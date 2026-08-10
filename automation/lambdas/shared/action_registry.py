"""Tell apart "new to this policy" from "new to AWS".

policy_diff compares two commits of one file, so its actions_added means the
action was added to that policy. This module adds the cross-history question:
has the action, or its whole service prefix, ever appeared in any AWS managed
policy before? A first-ever service prefix is the strongest signal available
that AWS is standing up an unannounced service, because the IAM component
usually lands before the SDK and the docs.

The registry is a DynamoDB table of earliest sightings, seeded from git history
by automation/scripts/build_action_registry.py. First sighting is decided by who
wins a conditional write, so the answer is identical whichever Lambda asks first
and stays stable when the same change is re-rendered by the next day's digest.

Never raises: a registry that is unavailable or unseeded degrades to "no
discoveries", which renders exactly like the emails did before this existed. That
is the right failure direction, since an empty registry would otherwise announce
all 12k known actions at once, but it is indistinguishable from a quiet week from
the outside, so every path that reaches it alerts the ops channel rather than only
printing to a log group nobody reads.
"""

import os
import time

import boto3
from botocore.exceptions import ClientError

TABLE_NAME = os.environ.get("ACTION_REGISTRY_TABLE", "")

ACTION_KEY = "act#"
SERVICE_KEY = "svc#"
SEEDED_KEY = "meta#seeded"

# DynamoDB caps a BatchGetItem at 100 keys.
BATCH_SIZE = 100

# Reads are batched and cheap, but each first sighting costs one conditional
# write, so only the slow path is capped. A day that trips this is either an AWS
# rewrite of unprecedented scale or a broken registry, and both want a loud log
# rather than a Lambda that times out. The --sync on the next deploy reconciles
# anything skipped, since git history is authoritative.
MAX_FIRST_SIGHTINGS = 500

# policy_diff encodes effect and match semantics into its labels, so the bare
# action has to be recovered before it can be looked up.
_LABEL_PREFIXES = ("Deny ", "NotAction ")

_resource = None
_table = None


def _alert(reason):
    """Log an inert registry and page the ops channel about it.

    discord_notifier is imported here rather than at module scope so this module
    still works wherever it is not bundled, and because an alert about a broken
    registry must never be the thing that breaks classification.
    """
    print(f"[action_registry] {reason}")
    try:
        import discord_notifier

        discord_notifier.send(
            "Discovery detection is inert",
            f"{reason} Until this is fixed, no change can be reported as "
            "never-before-seen on any channel.",
            discord_notifier.COLOR_ERROR,
            fields=[("Registry table", TABLE_NAME or "unset", True)],
        )
    except Exception as e:
        print(f"[action_registry] Could not raise the alert: {e}")


def _get_table():
    """The registry table, plus the resource needed for deserialized batch reads."""
    global _resource, _table
    if _table is None:
        if not TABLE_NAME:
            return None
        _resource = boto3.resource("dynamodb")
        _table = _resource.Table(TABLE_NAME)
    return _table


def bare_action(label):
    """Strip policy_diff's label prefixes, which it applies in this order."""
    for prefix in _LABEL_PREFIXES:
        if label.startswith(prefix):
            label = label[len(prefix):]
    return label


def is_literal_action(value):
    """Mirror is_literal_action in automation/scripts/build_action_registry.py."""
    if not isinstance(value, str) or not value:
        return False
    if "*" in value:
        return False
    idx = value.find(":")
    return 0 < idx < len(value) - 1


def same_commit(left, right):
    """True when two SHAs identify the same commit, at either abbreviation.

    The registry stores full SHAs from git log, while notifications carry the
    abbreviated form the scraper produces with %h, so an equality test would
    never match and every re-render would look like a fresh discovery.
    """
    if not left or not right:
        return False
    shorter, longer = sorted((left, right), key=len)
    return len(shorter) >= 7 and longer.startswith(shorter)


def _candidates(change):
    """Registry keys this change could be the first sighting of.

    Returns {key: display}, where display is the action or prefix as written.
    """
    found = {}
    for label in change.get("actions_added") or []:
        action = bare_action(label)
        if not is_literal_action(action):
            continue
        service = action.split(":", 1)[0]
        found[ACTION_KEY + action.lower()] = action
        found[SERVICE_KEY + service.lower()] = service.lower()
    return found


def _is_seeded(table):
    """Refuse to classify against a registry that was never loaded.

    Without this, an empty table would report all 15k known actions as
    never-before-seen the first time it was consulted.
    """
    try:
        item = table.get_item(Key={"entry": SEEDED_KEY}).get("Item")
    except ClientError as e:
        _alert(f"Could not read the registry's seed marker: {e}.")
        return False
    if not item:
        _alert(
            "The registry holds no seed marker, so it has never been loaded. "
            "A deploy reconciles it, or run build_action_registry.py --sync "
            f"{TABLE_NAME} by hand."
        )
        return False
    return True


def _fetch(keys):
    """Existing entries for the given keys, as {key: item}.

    Reads go through the resource rather than the low-level client so values come
    back as plain Python instead of DynamoDB type descriptors.
    """
    found = {}
    for start in range(0, len(keys), BATCH_SIZE):
        page = keys[start:start + BATCH_SIZE]
        request = {TABLE_NAME: {"Keys": [{"entry": k} for k in page]}}
        while request:
            response = _resource.batch_get_item(RequestItems=request)
            for item in response.get("Responses", {}).get(TABLE_NAME, []):
                found[item["entry"]] = item
            request = response.get("UnprocessedKeys") or None
    return found


def _claim(table, key, change):
    """Try to record this change as the first sighting of key.

    Returns the SHA that owns the first sighting, or "" if it could not be
    established. The conditional write is what makes the answer race-free: two
    Lambdas classifying the same commit concurrently cannot both claim it, and
    the loser reads back the winner's SHA.
    """
    sha = change.get("commit_sha", "")
    item = {
        "entry": key,
        # When the sighting was recorded rather than committed, which is the best
        # available here. The backfill uses commit time and is authoritative.
        "first_seen_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "first_commit_sha": sha,
        "first_policy": change.get("name", ""),
    }
    try:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(entry)")
        return sha
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            print(f"[action_registry] Could not claim {key}: {e}")
            return ""
    try:
        existing = table.get_item(Key={"entry": key}).get("Item") or {}
        return existing.get("first_commit_sha", "")
    except ClientError as e:
        print(f"[action_registry] Could not re-read {key}: {e}")
        return ""


def classify(changes):
    """Annotate each change with new_service_prefixes and new_actions, in place.

    A key counts as a discovery for a change when the registry's first sighting
    is that change's own commit, whether it was just claimed or was already
    recorded by an earlier pass over the same commit.

    Also sets "classified" on each change, so a caller about to write "nothing new
    this week" can tell a clean run from one that never managed to look. Without that
    flag an empty new_actions means both things at once, which is how eleven recaps
    went out asserting quiet weeks over two brand-new AWS services.
    """
    if not changes:
        return changes

    for c in changes:
        c["classified"] = False

    table = _get_table()
    if table is None:
        _alert("No registry table is configured. Set ACTION_REGISTRY_TABLE.")
        return changes

    try:
        if not _is_seeded(table):
            return changes

        per_change = [(c, _candidates(c)) for c in changes]
        keys = sorted({k for _, cands in per_change for k in cands})
        if not keys:
            # No candidate actions at all, so there is genuinely nothing to find and
            # this counts as a complete answer rather than a failure to look.
            for c in changes:
                c["classified"] = True
            return changes

        existing = _fetch(keys)

        # Which commit owns each key's first sighting.
        owner = {k: item.get("first_commit_sha", "") for k, item in existing.items()}
        claimed = 0
        capped = set()
        for change, cands in per_change:
            for key in sorted(cands):
                if key in owner:
                    continue
                if claimed >= MAX_FIRST_SIGHTINGS:
                    # Once per run, not once per key: a bulk day would otherwise
                    # spend hundreds of Discord posts saying the same thing.
                    if not capped:
                        _alert(
                            f"Hit the {MAX_FIRST_SIGHTINGS} first-sighting cap, so "
                            "the remaining actions in this run are reported as "
                            "routine until the next deploy sync reconciles them."
                        )
                    capped.add(id(change))
                    owner[key] = ""
                    continue
                owner[key] = _claim(table, key, change)
                claimed += 1

        for change, cands in per_change:
            sha = change.get("commit_sha", "")
            services, actions = [], []
            for key, display in cands.items():
                if not same_commit(owner.get(key, ""), sha):
                    continue
                (services if key.startswith(SERVICE_KEY) else actions).append(display)
            change["new_service_prefixes"] = sorted(services)
            change["new_actions"] = sorted(actions)
            # A change whose keys ran past the cap was only partly looked at.
            change["classified"] = id(change) not in capped

        discovered = sum(
            1 for c in changes if c["new_service_prefixes"] or c["new_actions"]
        )
        if discovered:
            print(
                f"[action_registry] {discovered} of {len(changes)} changes carry "
                f"first-ever actions ({claimed} new registry entries)"
            )
        return changes

    except Exception as e:
        _alert(f"Classification failed and was skipped: {e}.")
        return changes

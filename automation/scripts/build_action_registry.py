#!/usr/bin/env python3
"""Build the first-seen registry of every IAM action in the IAMTrail archive.

The archive's git history is the only record of when an AWS managed IAM policy
first mentioned a given action, so this replays every commit that ever touched
policies/ and keeps the earliest sighting of each action string and each service
prefix. A brand-new service prefix is the strongest available signal that AWS is
standing up an unannounced service, since the IAM component usually lands before
the SDK and the docs.

The replay is a single `git log` plus a single `git cat-file --batch`, which
keeps the whole 2019-onwards history at a couple of seconds rather than the tens
of minutes a `git show` per blob would cost.

The same replay yields the per-commit action delta as a by-product: holding the
previous action set for each policy path costs one dictionary and turns "policy
X changed" into "policy X gained these three actions", which is what the feeds
need and what the GitHub API would otherwise have to be asked for.

Writes data/action-registry.json and data/policy-change-deltas.json, and with
--seed loads the registry into DynamoDB for the notification Lambdas, which
cannot walk git history themselves.

Stdlib only unless --seed is passed, so it runs on a bare runner.
"""

import argparse
import json
import subprocess
import sys
import time
from collections import deque
from pathlib import Path

POLICY_PREFIX = "policies/"
REGISTRY_PATH = "data/action-registry.json"
DELTAS_PATH = "data/policy-change-deltas.json"
SCHEMA_VERSION = 1

# Key prefixes keep actions, service prefixes and bookkeeping in one table.
ACTION_KEY = "act#"
SERVICE_KEY = "svc#"
SEEDED_KEY = "meta#seeded"

# The feeds show 50 items. Keeping a thousand leaves room to filter or regroup
# without carrying the whole history, which would dwarf the registry itself.
MAX_DELTAS = 1000

# git log record separators, chosen because neither can appear in a path.
REC, FIELD = "\x01", "\x02"

_STATUS_NAMES = {"A": "added", "M": "modified", "D": "removed"}


def is_literal_action(value):
    """Mirror isLiteralIamActionString in website/lib/iamActionPattern.ts.

    Wildcards are excluded because `s3:*` says nothing about which concrete
    actions exist, so it cannot establish a first sighting.
    """
    if not isinstance(value, str) or not value:
        return False
    if "*" in value:
        return False
    idx = value.find(":")
    return 0 < idx < len(value) - 1


def statements(doc):
    if not isinstance(doc, dict):
        return []
    stmts = doc.get("PolicyVersion", {}).get("Document", {}).get("Statement", [])
    if isinstance(stmts, dict):
        return [stmts]
    if isinstance(stmts, list):
        return [s for s in stmts if isinstance(s, dict)]
    return []


def literal_actions(doc):
    """Every literal action a policy document mentions, regardless of effect.

    Effect and Action/NotAction are deliberately ignored: the question here is
    whether the action string has ever existed, not whether it was allowed.
    """
    found = set()
    for stmt in statements(doc):
        for key in ("Action", "NotAction"):
            values = stmt.get(key)
            if isinstance(values, str):
                values = [values]
            if not isinstance(values, list):
                continue
            for value in values:
                if is_literal_action(value):
                    found.add(value)
    return found


def version_id(doc):
    """The PolicyVersion VersionId, e.g. "v17", or "" when the shape is unexpected."""
    if not isinstance(doc, dict):
        return ""
    value = doc.get("PolicyVersion", {})
    return value.get("VersionId", "") if isinstance(value, dict) else ""


def touched_blobs():
    """Every (sha, commit time, status, path) that touched a policy, oldest first.

    Deletions are included so a policy AWS withdrew is reported as removed rather
    than simply going quiet.
    """
    out = subprocess.run(
        [
            "git", "log", "--reverse", "--no-renames", "--diff-filter=AMD",
            f"--format={REC}%H{FIELD}%ct", "--name-status", "--", POLICY_PREFIX,
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout

    pairs = []
    sha, when = "", 0
    for line in out.split("\n"):
        if line.startswith(REC):
            sha, raw_when = line[1:].split(FIELD)
            when = int(raw_when)
            continue
        status, tab, path = line.partition("\t")
        if tab and status in _STATUS_NAMES and path.startswith(POLICY_PREFIX):
            pairs.append((sha, when, status, path))
    return pairs


def read_blobs(pairs):
    """Yield (sha, when, path, document) for each pair, via one cat-file process.

    Blobs are requested and parsed in order, so a missing or unparseable object
    is skipped without desynchronising the stream from the request list.
    """
    proc = subprocess.Popen(
        ["git", "cat-file", "--batch"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
    )
    request = "".join(f"{sha}:{path}\n" for sha, _, path in pairs).encode()
    out, _ = proc.communicate(request)

    pos, index = 0, 0
    while pos < len(out) and index < len(pairs):
        end = out.find(b"\n", pos)
        if end == -1:
            break
        header = out[pos:end].decode("utf-8", errors="replace").split()
        sha, when, path = pairs[index]
        index += 1

        # "<oid> missing" has no size and no body to skip past.
        if len(header) < 3:
            pos = end + 1
            continue

        size = int(header[2])
        body = out[end + 1:end + 1 + size]
        pos = end + 1 + size + 1

        try:
            yield sha, when, path, json.loads(body)
        except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
            continue


def _delta(previous, current):
    """Actions added and removed between two {lowercase: display} maps.

    Compared on the lowercase key so a re-spelling AWS introduced (s3:GetObject
    becoming S3:GetObject) is not reported as one action added and one removed.
    """
    added = sorted(current[k] for k in current.keys() - previous.keys())
    removed = sorted(previous[k] for k in previous.keys() - current.keys())
    return added, removed


def build():
    """Replay the archive into the first-seen registry plus the per-commit deltas.

    Returns (entries, deltas): entries keyed as in the DynamoDB table, deltas
    newest first and capped, since only the recent tail is ever rendered.
    """
    pairs = touched_blobs()
    print(f"Replaying {len(pairs)} commit/file pairs")

    entries = {}
    deltas = deque(maxlen=MAX_DELTAS)
    # The action set each path carried the last time it was seen, which is what
    # turns a snapshot replay into a stream of diffs.
    previous = {}

    blob_pairs = [(sha, when, path) for sha, when, status, path in pairs if status != "D"]
    stream = read_blobs(blob_pairs)
    # read_blobs skips a blob it cannot read or parse, so the stream is matched
    # against the request list by identity rather than assumed to be one-to-one.
    pending = next(stream, None)

    for sha, when, status, path in pairs:
        policy = path[len(POLICY_PREFIX):]
        seen_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(when))

        if status == "D":
            gone = previous.pop(path, {})
            deltas.append({
                "sha": sha,
                "date": seen_at,
                "policyName": policy,
                "status": "removed",
                "versionId": "",
                "actionsAdded": [],
                "actionsRemoved": sorted(gone.values()),
                "newActions": [],
                "newServicePrefixes": [],
            })
            continue

        if not (pending and pending[0] == sha and pending[2] == path):
            continue
        doc = pending[3]
        pending = next(stream, None)

        # Sorted, because a document can spell one action two ways and set order
        # varies per process: without this, first_action flips between rebuilds.
        # Sorting also favours the PascalCase spelling AWS documents.
        actions = sorted(literal_actions(doc))

        # Recorded while the registry is still missing them, which is the only
        # moment the replay can tell a first sighting from a re-appearance.
        new_actions, new_prefixes = [], []

        for action in actions:
            service = action.split(":", 1)[0].lower()
            # Keys are lowercased because IAM matches actions case-insensitively
            # and AWS is inconsistent about it: s3:GetBucketPolicy, S3:GetBucketPolicy
            # and s3:getBucketPolicy all appear in the archive. Keying on the raw
            # string would report a mere re-spelling as a brand-new action.
            action_key, service_key = ACTION_KEY + action.lower(), SERVICE_KEY + service
            if action_key not in entries:
                new_actions.append(action)
            if service_key not in entries:
                new_prefixes.append(service)

            sighting = {
                "first_seen_at": seen_at,
                "first_commit_sha": sha,
                "first_policy": policy,
            }
            for key in (action_key, service_key):
                # Oldest first, so the first writer is the first sighting.
                entries.setdefault(key, dict(sighting))
            entries[action_key].setdefault("first_action", action)

        current = {a.lower(): a for a in actions}
        added, removed = _delta(previous.get(path, {}), current)
        previous[path] = current
        deltas.append({
            "sha": sha,
            "date": seen_at,
            "policyName": policy,
            "status": _STATUS_NAMES[status],
            "versionId": version_id(doc),
            "actionsAdded": added,
            "actionsRemoved": removed,
            "newActions": new_actions,
            "newServicePrefixes": new_prefixes,
        })

    return entries, list(reversed(deltas))


def counts(entries):
    actions = sum(1 for k in entries if k.startswith(ACTION_KEY))
    return actions, len(entries) - actions


def write_registry(entries, root):
    """Serialise one entry per line, so regenerating this file yields a readable diff.

    json.dump with an indent would spread each entry over five lines and triple
    the size, and a fully compact dump would put 15k entries on one line.
    """
    actions, services = counts(entries)
    head = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stats": {"actionCount": actions, "serviceCount": services},
    }
    rows = ",\n".join(
        f"    {json.dumps(key)}: "
        f"{json.dumps(entries[key], sort_keys=True, separators=(',', ':'))}"
        for key in sorted(entries)
    )

    path = root / REGISTRY_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as handle:
        handle.write("{\n")
        for key, value in head.items():
            handle.write(f"  {json.dumps(key)}: {json.dumps(value, sort_keys=True)},\n")
        handle.write('  "entries": {\n')
        handle.write(rows)
        handle.write("\n  }\n}\n")
    print(f"Wrote {path} ({actions} actions, {services} services)")


def write_deltas(deltas, root):
    """Serialise the recent change tail, newest first, one change per line."""
    head = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stats": {"changeCount": len(deltas)},
    }
    rows = ",\n".join(
        f"    {json.dumps(change, sort_keys=True, separators=(',', ':'))}"
        for change in deltas
    )

    path = root / DELTAS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as handle:
        handle.write("{\n")
        for key, value in head.items():
            handle.write(f"  {json.dumps(key)}: {json.dumps(value, sort_keys=True)},\n")
        handle.write('  "changes": [\n')
        handle.write(rows)
        handle.write("\n  ]\n}\n")
    print(f"Wrote {path} ({len(deltas)} changes)")


def seed(entries, table_name):
    """Bulk-load the registry, then mark it seeded.

    The sentinel is written last and on purpose: the Lambdas refuse to classify
    without it, so a run that dies midway leaves the table inert rather than
    reporting every already-known action as a discovery.
    """
    import boto3

    table = boto3.resource("dynamodb").Table(table_name)
    with table.batch_writer(overwrite_by_pkeys=["entry"]) as batch:
        for written, (key, value) in enumerate(entries.items(), start=1):
            batch.put_item(Item={"entry": key, **value})
            if written % 5000 == 0:
                print(f"  seeded {written}/{len(entries)}")

    actions, services = counts(entries)
    table.put_item(
        Item={
            "entry": SEEDED_KEY,
            "seeded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "action_count": actions,
            "service_count": services,
            "schema_version": SCHEMA_VERSION,
        }
    )
    print(f"Seeded {len(entries)} entries into {table_name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seed",
        metavar="TABLE",
        help="also load the registry into this DynamoDB table",
    )
    parser.add_argument(
        "--no-write",
        action="store_true",
        help="skip writing the registry and the change deltas",
    )
    args = parser.parse_args()

    root = Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
    )

    started = time.time()
    entries, deltas = build()
    if not entries:
        print("No actions found, refusing to write an empty registry", file=sys.stderr)
        return 1

    actions, services = counts(entries)
    print(
        f"Built {actions} actions, {services} services and {len(deltas)} changes "
        f"in {time.time() - started:.1f}s"
    )

    if not args.no_write:
        write_registry(entries, root)
        write_deltas(deltas, root)
    if args.seed:
        seed(entries, args.seed)
    return 0


if __name__ == "__main__":
    sys.exit(main())

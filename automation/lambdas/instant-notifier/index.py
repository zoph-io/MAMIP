import json
import os
import re
import traceback
from urllib.parse import quote
import action_registry
import bluesky_publisher
import boto3
import discord_notifier as discord
import iam_metadata
import policy_diff
import telegram_publisher

dynamodb = boto3.resource("dynamodb")
ses = boto3.client("ses", region_name=os.environ.get("SES_REGION", "eu-west-3"))

SUBSCRIPTIONS_TABLE = os.environ["SUBSCRIPTIONS_TABLE"]
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
SITE_URL = os.environ["SITE_URL"]

# Bluesky rejects a post longer than this.
BLUESKY_LIMIT = 300

# Tags are the only discovery surface Bluesky gives an account this small, and
# the posts carried none. Budgeted like the link: always present, never trimmed.
BLUESKY_TAGS = "#AWS #IAM #CloudSecurity"

# Telegram allows far more room, so the body names actions instead of teasing
# them. These keep a bulk day from crowding out the finding itself.
TELEGRAM_MAX_BLOCKS = 5
TELEGRAM_MAX_ACTIONS = 12

subs_table = dynamodb.Table(SUBSCRIPTIONS_TABLE)


def new_service_prefixes(changes):
    """Every brand-new service prefix across a batch of changes."""
    return sorted({p for c in changes for p in c.get("new_service_prefixes") or []})


def policy_url(name):
    """Link to a policy page, with the name encoded rather than trusted."""
    return f"{SITE_URL}/policies/{quote(name, safe='')}"


def _budget(*fixed):
    """Characters left for a name list once every fixed part is accounted for.

    Callers pass every piece that is not the list itself, including separators,
    because the two blank lines before the link and before the tags are easy to
    forget and a two-character miss is enough for Bluesky to reject the post.
    """
    return BLUESKY_LIMIT - sum(len(p) for p in fixed) - 4


def _fit_names(names, budget):
    """As many whole names as fit the budget, with a count for the remainder.

    The old scraper-side post cut the joined names at 200 bytes and appended
    "...", so it routinely ended mid-name. This only ever drops whole names, and
    returns "" when not even one fits, leaving the caller's count to speak alone.
    """
    shown = []
    for name in names:
        left = len(names) - len(shown) - 1
        suffix = f" (+{left} more)" if left else ""
        if len(", ".join(shown + [name])) + len(suffix) > budget:
            break
        shown.append(name)

    if not shown:
        return ""
    left = len(names) - len(shown)
    return ", ".join(shown) + (f" (+{left} more)" if left else "")


def batch_actions(changes):
    """Every action added and removed across a batch, de-duplicated, sorted."""
    added, removed = set(), set()
    for change in changes:
        added.update(change.get("actions_added") or [])
        removed.update(change.get("actions_removed") or [])
    return sorted(added), sorted(removed)


def build_bluesky_post(changes, policy_names):
    """The public post, leading with the discovery when there is one.

    Bluesky hard-caps a post at 300 characters, so everything is budgeted around
    the link and the tags, which are the parts that must survive intact.

    An ordinary run used to post a bare list of policy names, which told a
    follower that something happened without ever saying what. The delta and the
    permissions-management callout are what a reader can act on, so they lead and
    the names fill whatever room is left.
    """
    prefixes = new_service_prefixes(changes)

    if prefixes:
        introducing = next((c for c in changes if c.get("new_service_prefixes")), None)
        policy = introducing["name"] if introducing else ""
        link = policy_url(policy) if policy else f"{SITE_URL}/policies"
        lead = policy_diff.sentence(policy_diff.new_service_phrase(prefixes))

        count = len(introducing.get("new_actions") or []) if introducing else 0
        detail = ""
        if count and policy:
            detail = (
                f"\n\n{policy_diff.never_before_seen(count)}, first seen in {policy}"
            )

        budget = _budget(lead, ": ", detail, link, BLUESKY_TAGS)
        if budget < len(prefixes[0]):
            # The prefixes are the headline, so the detail line yields to them.
            detail = ""
            budget = _budget(lead, ": ", link, BLUESKY_TAGS)
        # A single prefix is already named in the lead, so listing it again would
        # only repeat the headline.
        listed = _fit_names(prefixes, budget) if len(prefixes) > 1 else ""
        body = f"{lead}{': ' + listed if listed else ''}{detail}"
        return _assemble(body, link)

    added, removed = batch_actions(changes)
    escalations = iam_metadata.permissions_management(added)
    count = len(policy_names)
    link = f"{SITE_URL}/policies"

    lead = (
        f"{policy_diff.plural(count, 'AWS managed IAM policy', 'AWS managed IAM policies')}"
        f" updated: {policy_diff.action_delta_phrase(added, removed)}"
    )
    if escalations:
        lead += f". {policy_diff.sentence(policy_diff.permissions_management_phrase(escalations))}"

    # Service prefixes rather than policy names: one prefix tells a reader
    # whether the batch is worth opening, and ten of them fit where three policy
    # names would not. The friendly names are left to the channels with room.
    services = iam_metadata.services_of(added + removed)
    names = services or policy_names
    label = "Services" if services else "Policies"
    listed = _fit_names(names, _budget(lead, f"\n\n{label}: ", link, BLUESKY_TAGS))
    detail = f"\n\n{label}: {listed}" if listed else ""

    return _assemble(f"{lead}{detail}", link)


def _assemble(body, link):
    """Join body, link and tags, dropping the name list if the cap is still hit.

    The budgeting above should make this unnecessary, but Bluesky rejects an
    over-long post outright, so the fallback is a shorter post rather than none.
    """
    post = f"{body}\n\n{link}\n\n{BLUESKY_TAGS}"
    if len(post) <= BLUESKY_LIMIT:
        return post

    trimmed = body.split("\n\n")[0]
    post = f"{trimmed}\n\n{link}\n\n{BLUESKY_TAGS}"
    if len(post) <= BLUESKY_LIMIT:
        return post

    room = BLUESKY_LIMIT - len(link) - len(BLUESKY_TAGS) - 4
    return f"{trimmed[:max(0, room)]}\n\n{link}\n\n{BLUESKY_TAGS}"


def _telegram_block(change, max_actions):
    """One discovery, rendered with as many actions as the caller allows."""
    esc = telegram_publisher.escape
    name = change["name"]
    prefixes = change.get("new_service_prefixes") or []
    actions = change.get("new_actions") or []
    count = len(actions)

    if prefixes:
        named = ", ".join(iam_metadata.label_service(p) for p in prefixes)
        head = f"<b>{policy_diff.sentence(policy_diff.new_service_phrase(prefixes))}</b>"
        detail = f"{esc(named)}, never seen in any AWS managed policy before"
    else:
        head = f"<b>{policy_diff.sentence(policy_diff.never_before_seen(count))}</b>"
        services = ", ".join(
            iam_metadata.label_service(p) for p in iam_metadata.services_of(actions)
        )
        detail = f"On {esc(services)}" if services else ""

    # Version and status, absent until now, are what tell a reader whether AWS
    # created this policy for the discovery or slipped it into an existing one.
    status = policy_diff.STATUS_WORDS.get(change.get("status"), "updated")
    version = change.get("new_version") or change.get("old_version") or ""
    where = f"First seen in {esc(name)} ({esc(status)}"
    where += f", {esc(version)})" if version else ")"

    escalations = iam_metadata.permissions_management(actions)

    # The new service's own actions lead. A policy that introduces a prefix
    # usually adds unrelated actions in the same commit, and an alphabetical list
    # buried odb: behind apigateway: for the reader who came for odb.
    if prefixes:
        wanted = set(prefixes)
        actions = sorted(
            actions, key=lambda a: (iam_metadata.service_of(a) not in wanted, a)
        )

    shown = [esc(a) for a in actions[:max_actions]]
    left = count - len(shown)
    listed = ", ".join(shown) + (f", and {left} more" if left else "")

    lines = [head]
    if detail:
        lines.append(detail)
    lines.append(where)
    # Kept to at least one entry even when the action list is trimmed to nothing:
    # this line is the reason a security reader follows the channel.
    if escalations:
        lines.append(
            "<b>Permissions management</b>: "
            + esc(", ".join(escalations[: max(1, max_actions)]))
        )
    if listed:
        lines.append(f"<code>{listed}</code>")
    lines.append(esc(policy_url(name)))
    return "\n".join(lines)


def build_telegram_post(changes):
    """The channel body, or "" when nothing is worth broadcasting.

    The channel carries discoveries only, so an ordinary version bump produces no
    post at all. Telegram's 4096-character budget is roomy enough to name the
    actions rather than tease them, so a reader gets the finding without leaving
    the app.
    """
    discoveries = sorted(
        (c for c in changes if policy_diff.is_discovery(c)),
        key=policy_diff.discovery_rank,
    )
    if not discoveries:
        return ""

    def render(max_actions):
        blocks = [
            _telegram_block(c, max_actions) for c in discoveries[:TELEGRAM_MAX_BLOCKS]
        ]
        left = len(discoveries) - TELEGRAM_MAX_BLOCKS
        if left > 0:
            blocks.append(
                f"and {left} more with never-before-seen actions: {SITE_URL}/policies"
            )
        # One aggregated message per run, because the channel rate limit is per
        # minute and a re:Invent day can carry several discoveries at once.
        return "\n\n".join(blocks)

    body = render(TELEGRAM_MAX_ACTIONS)
    if len(body) <= telegram_publisher.MESSAGE_LIMIT:
        return body

    # Shorten every block's action list rather than dropping blocks: the old
    # fallback kept the first discovery and threw the rest of the run away, so a
    # busy day silently lost findings the channel exists to report.
    for max_actions in (6, 3, 1, 0):
        body = render(max_actions)
        if len(body) <= telegram_publisher.MESSAGE_LIMIT:
            return body
    return body[: telegram_publisher.MESSAGE_LIMIT]


def build_subject(changes):
    """A never-before-seen service outranks any count of routine updates."""
    prefixes = new_service_prefixes(changes)
    if len(prefixes) == 1:
        return f"IAMTrail: {policy_diff.new_service_phrase(prefixes)}"
    if prefixes:
        return (
            f"IAMTrail: {policy_diff.new_service_phrase(prefixes)} - "
            f"{', '.join(prefixes[:3])}"
        )
    return (
        "IAMTrail Alert: "
        f"{policy_diff.summarize_counts(changes, brief=True)} just changed"
    )


def build_email_html(subscriber, policy_changes):
    """Compose the instant notification email from resolved change records."""
    prefixes = new_service_prefixes(policy_changes)
    if prefixes:
        summary = (
            f"Never seen before in any AWS managed policy: {', '.join(prefixes)}"
        )
    else:
        summary = f"{policy_diff.summarize_counts(policy_changes)} just changed"

    return policy_diff.render_email(
        title="IAMTrail Instant Alert",
        summary=summary,
        accent="#f59e0b",
        body_html=policy_diff.render_policy_section(policy_changes, SITE_URL),
        site_url=SITE_URL,
        manage_token=subscriber["manage_token"],
        intro="You're receiving this instant alert because you subscribed to IAMTrail policy change notifications.",
    )


def get_instant_subscribers():
    """Scan for confirmed instant subscribers that want policy or discovery alerts."""
    items = []
    scan_kwargs = {
        "FilterExpression": "confirmed = :c AND frequency = :f",
        "ExpressionAttributeValues": {":c": True, ":f": "instant"},
    }
    while True:
        result = subs_table.scan(**scan_kwargs)
        items.extend(result.get("Items", []))
        if "LastEvaluatedKey" not in result:
            break
        scan_kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]
    return [
        s for s in items
        if {"iam_policies", "discoveries"} & set(s.get("topics", ["iam_policies"]))
    ]


def handler(event, context):
    print(f"Received {len(event.get('Records', []))} records")

    for record in event.get("Records", []):
        try:
            policy_diff.clear_cache()
            body = json.loads(record["body"])
            message_str = body.get("Message", body)
            if isinstance(message_str, str):
                message = json.loads(message_str)
            else:
                message = message_str

            updated_policies = message.get("UpdatedPolicies", "")
            commit_url = message.get("CommitUrl", "")
            commit_map = message.get("CommitMap", {})

            commit_sha = ""
            repo_base_url = ""
            sha_match = re.search(r"(https://github\.com/[^/]+/[^/]+)/commit/([a-f0-9]+)", commit_url)
            if sha_match:
                repo_base_url = sha_match.group(1)
                commit_sha = sha_match.group(2)

            policy_names = [p.strip() for p in updated_policies.split(",") if p.strip()]
            if not policy_names:
                print("No policy names found in message, skipping")
                continue

            print(f"Processing instant notifications for {len(policy_names)} policies")

            rows = []
            for name in policy_names:
                p_sha = commit_map.get(name, commit_sha)
                rows.append({
                    "name": name,
                    "commit_sha": p_sha,
                    "commit_url": (
                        f"{repo_base_url}/commit/{p_sha}"
                        if p_sha and repo_base_url
                        else commit_url
                    ),
                })

            # Waiting on the newest SHA covers the whole batch, since every
            # entry in CommitMap is one of its ancestors.
            if commit_sha and not policy_diff.wait_for_commit(commit_sha):
                print(
                    f"Commit {commit_sha[:8]} is not on GitHub, "
                    "sending without diffs"
                )

            policy_changes = policy_diff.resolve_changes(rows)
            action_registry.classify(policy_changes)

            # Public feeds go out before the subscriber check, otherwise they
            # would fall silent whenever nobody holds an instant subscription.
            bluesky_publisher.post(build_bluesky_post(policy_changes, policy_names))
            telegram_publisher.post(build_telegram_post(policy_changes))

            subscribers = get_instant_subscribers()
            if not subscribers:
                print("No instant subscribers found")
                continue

            sent_count = 0
            fail_count = 0
            for subscriber in subscribers:
                subscribed_policies = set(subscriber.get("policies", ["*"]))

                if "*" in subscribed_policies:
                    matching = policy_changes
                else:
                    matching = [c for c in policy_changes if c["name"] in subscribed_policies]

                # Someone who asked for discoveries but not every policy change
                # only hears about the never-before-seen ones.
                topics = set(subscriber.get("topics", ["iam_policies"]))
                if "iam_policies" not in topics:
                    matching = [c for c in matching if policy_diff.is_discovery(c)]

                if not matching:
                    continue

                try:
                    html = build_email_html(subscriber, matching)
                    ses.send_email(
                        Source=SENDER_EMAIL,
                        Destination={"ToAddresses": [subscriber["email"]]},
                        Message={
                            "Subject": {"Data": build_subject(matching)},
                            "Body": {"Html": {"Data": html}},
                        },
                    )
                    sent_count += 1
                except Exception as e:
                    fail_count += 1
                    print(f"Failed to send to {subscriber['email']}: {e}")
                    discord.send(
                        "Instant Send Failure",
                        f"Failed to email {discord.mask_email(subscriber['email'])}",
                        discord.COLOR_WARNING,
                        fields=[("Error", str(e)[:200], False)],
                    )

            print(f"Sent {sent_count} instant notification emails")

            preview = ", ".join(policy_names[:5])
            if len(policy_names) > 5:
                preview += f" (+{len(policy_names) - 5} more)"

            fields = [
                ("Emails Sent", str(sent_count), True),
                ("Policies", str(len(policy_names)), True),
            ]
            prefixes = new_service_prefixes(policy_changes)
            if prefixes:
                fields.append(("New Services", ", ".join(prefixes), False))
            if commit_url:
                fields.append(("Commit", f"[View]({commit_url})", True))
            if fail_count:
                fields.append(("Failures", str(fail_count), True))

            discord.send(
                "Instant Alerts Sent",
                preview,
                discord.COLOR_SUCCESS if not fail_count else discord.COLOR_WARNING,
                fields=fields,
            )

        except Exception as e:
            print(f"Error processing record: {e}")
            discord.send(
                "Instant Notifier Error",
                f"```{traceback.format_exc()[-1000:]}```",
                discord.COLOR_ERROR,
            )
            raise

    return {"statusCode": 200, "body": "OK"}

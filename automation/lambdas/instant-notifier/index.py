import json
import os
import re
import traceback
from urllib.parse import quote
import action_registry
import bluesky_publisher
import boto3
import discord_notifier as discord
import policy_diff
import telegram_publisher

dynamodb = boto3.resource("dynamodb")
ses = boto3.client("ses", region_name=os.environ.get("SES_REGION", "eu-west-3"))

SUBSCRIPTIONS_TABLE = os.environ["SUBSCRIPTIONS_TABLE"]
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
SITE_URL = os.environ["SITE_URL"]

# Bluesky rejects a post longer than this.
BLUESKY_LIMIT = 300

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


def build_bluesky_post(changes, policy_names):
    """The public post, leading with the discovery when there is one.

    Bluesky hard-caps a post at 300 characters, so everything is budgeted around
    the link, which is the one part that must survive intact.
    """
    prefixes = new_service_prefixes(changes)

    if prefixes:
        introducing = next((c for c in changes if c.get("new_service_prefixes")), None)
        policy = introducing["name"] if introducing else ""
        link = policy_url(policy) if policy else f"{SITE_URL}/policies"
        noun = "service" if len(prefixes) == 1 else "services"
        lead = f"[Policies] New AWS {noun} in IAM"

        count = len(introducing.get("new_actions") or []) if introducing else 0
        detail = ""
        if count and policy:
            detail = (
                f"\n\n{count} never-before-seen action{'s' if count != 1 else ''}"
                f", first seen in {policy}"
            )

        budget = BLUESKY_LIMIT - len(lead) - len(detail) - len(link) - 4
        if budget < len(prefixes[0]):
            # The prefixes are the headline, so the detail line yields to them.
            detail = ""
            budget = BLUESKY_LIMIT - len(lead) - len(link) - 4
        listed = _fit_names(prefixes, budget)
        if not listed:
            lead = f"[Policies] {len(prefixes)} new AWS {noun} in IAM"
        return f"{lead}{': ' + listed if listed else ''}{detail}\n\n{link}"

    count = len(policy_names)
    link = f"{SITE_URL}/policies"
    lead = f"[Policies] {count} {'policy' if count == 1 else 'policies'} updated"
    listed = _fit_names(policy_names, BLUESKY_LIMIT - len(lead) - len(link) - 4)
    return f"{lead}{': ' + listed if listed else ''}\n\n{link}"


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

    esc = telegram_publisher.escape
    blocks = []
    for change in discoveries[:TELEGRAM_MAX_BLOCKS]:
        name = change["name"]
        prefixes = change.get("new_service_prefixes") or []
        actions = change.get("new_actions") or []
        count = len(actions)
        plural = "s" if count != 1 else ""

        if prefixes:
            noun = "service" if len(prefixes) == 1 else "services"
            head = f"<b>New AWS {noun} in IAM: {esc(', '.join(prefixes))}</b>"
            detail = (
                f"{count} never-before-seen action{plural}, first seen in {esc(name)}"
            )
        else:
            head = f"<b>{count} first-ever IAM action{plural}</b>"
            detail = f"First seen in {esc(name)}"

        shown = [esc(a) for a in actions[:TELEGRAM_MAX_ACTIONS]]
        left = count - len(shown)
        listed = ", ".join(shown) + (f", and {left} more" if left else "")

        lines = [head, detail]
        if listed:
            lines.append(f"<code>{listed}</code>")
        lines.append(esc(policy_url(name)))
        blocks.append("\n".join(lines))

    left = len(discoveries) - TELEGRAM_MAX_BLOCKS
    if left > 0:
        blocks.append(f"and {left} more with never-before-seen actions: {SITE_URL}/policies")

    # One aggregated message per run, because the channel rate limit is per
    # minute and a re:Invent day can carry several discoveries at once.
    body = "\n\n".join(blocks)
    if len(body) > telegram_publisher.MESSAGE_LIMIT:
        body = "\n\n".join(blocks[:1] + [f"{SITE_URL}/policies"])
    return body


def build_subject(changes):
    """A never-before-seen service outranks any count of routine updates."""
    prefixes = new_service_prefixes(changes)
    if len(prefixes) == 1:
        return f"IAMTrail: new AWS service detected - {prefixes[0]}"
    if prefixes:
        return (
            f"IAMTrail: {len(prefixes)} new AWS services detected - "
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

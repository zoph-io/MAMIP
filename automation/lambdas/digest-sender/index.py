import os
import traceback
from datetime import datetime, timedelta, timezone
import action_registry
import boto3
from boto3.dynamodb.conditions import Key
import discord_notifier as discord
import iam_metadata
import policy_diff
import telegram_publisher

dynamodb = boto3.resource("dynamodb")
ses = boto3.client("ses", region_name=os.environ.get("SES_REGION", "eu-west-3"))

SUBSCRIPTIONS_TABLE = os.environ["SUBSCRIPTIONS_TABLE"]
CHANGES_TABLE = os.environ["CHANGES_TABLE"]
ENDPOINT_CHANGES_TABLE = os.environ.get("ENDPOINT_CHANGES_TABLE", "")
GUARDDUTY_TABLE = os.environ.get("GUARDDUTY_TABLE", "")
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
SITE_URL = os.environ["SITE_URL"]

subs_table = dynamodb.Table(SUBSCRIPTIONS_TABLE)
changes_table = dynamodb.Table(CHANGES_TABLE)
endpoint_table = dynamodb.Table(ENDPOINT_CHANGES_TABLE) if ENDPOINT_CHANGES_TABLE else None
guardduty_table = dynamodb.Table(GUARDDUTY_TABLE) if GUARDDUTY_TABLE else None

_resolved_changes = {}


def get_recent_policy_changes(days):
    """Query policy changes from the last N days."""
    changes = []
    now = datetime.now(timezone.utc)
    for i in range(days + 1):
        date_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        result = changes_table.query(
            KeyConditionExpression=Key("date").eq(date_str),
        )
        changes.extend(result.get("Items", []))
    return changes


def get_recent_endpoint_changes(days):
    """Query endpoint changes from the last N days."""
    if not endpoint_table:
        return []
    changes = []
    now = datetime.now(timezone.utc)
    for i in range(days + 1):
        date_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        result = endpoint_table.query(
            KeyConditionExpression=Key("detected_date").eq(date_str),
        )
        changes.extend(result.get("Items", []))
    return changes


def get_recent_guardduty_changes(days):
    """Query GuardDuty announcements from the last N days."""
    if not guardduty_table:
        return []
    changes = []
    now = datetime.now(timezone.utc)
    for i in range(days + 1):
        date_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        result = guardduty_table.query(
            KeyConditionExpression=Key("announcement_date").eq(date_str),
        )
        changes.extend(result.get("Items", []))
    return changes


def _change_key(item):
    return (item["policy_name"], item.get("commit_sha", ""))


def resolve_policy_changes(items):
    """Turn DynamoDB change rows into change records, resolving each one once."""
    pending = []
    seen = set()
    for item in items:
        key = _change_key(item)
        if key in _resolved_changes or key in seen:
            continue
        seen.add(key)
        pending.append(
            {
                "name": item["policy_name"],
                "commit_sha": item.get("commit_sha", ""),
                "commit_url": item.get("commit_url", ""),
            }
        )

    for item, record in zip(pending, policy_diff.resolve_changes(pending)):
        _resolved_changes[(item["name"], item["commit_sha"])] = record

    return [_resolved_changes[_change_key(item)] for item in items]


def _build_endpoint_section(changes):
    """Build the endpoint changes section HTML."""
    items = []
    for change in changes:
        desc = change.get("description", change.get("identifier", ""))
        change_type = change.get("change_type", "").replace("_", " ").title()
        partition = change.get("partition", "")
        commit_url = change.get("botocore_commit_url", "")

        escaped_desc = (
            desc.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        )

        item = f"""
        <div style="margin-bottom:8px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;">
            <div style="font-size:13px;color:#1e293b;font-weight:500;">{escaped_desc}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">
                {f'<span style="background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;">{change_type}</span>' if change_type else ''}
                {f' &middot; {partition}' if partition else ''}
                {f' &middot; <a href="{commit_url}" style="color:#64748b;text-decoration:none;">botocore commit</a>' if commit_url else ''}
            </div>
        </div>
        """
        items.append(item)

    count = len(changes)
    return f"""
    <div style="margin-bottom:32px;">
        <h2 style="margin:0 0 4px;font-size:16px;color:#1e293b;">
            AWS Endpoint Changes
        </h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:13px;">
            {count} {'change' if count == 1 else 'changes'} detected
        </p>
        {"".join(items)}
        <p style="margin:8px 0 0;font-size:12px;">
            <a href="{SITE_URL}/endpoints" style="color:#2563eb;text-decoration:none;">View endpoint tracker &rarr;</a>
        </p>
    </div>
    """


def _build_guardduty_section(changes):
    """Build the GuardDuty announcements section HTML."""
    TYPE_COLORS = {
        "NEW_FINDINGS": ("#fef2f2", "#dc2626"),
        "UPDATED_FINDINGS": ("#fff7ed", "#ea580c"),
        "NEW_FEATURES": ("#ecfdf5", "#059669"),
        "NEW_REGION": ("#eff6ff", "#2563eb"),
        "GENERAL": ("#f4f4f5", "#52525b"),
    }

    items = []
    for change in changes:
        gd_type = change.get("type", "GENERAL")
        short_desc = change.get("short_description", "")
        full_desc = change.get("description", "")
        link = change.get("link", "")
        bg, fg = TYPE_COLORS.get(gd_type, TYPE_COLORS["GENERAL"])
        label = gd_type.replace("_", " ").title()

        display_desc = short_desc or full_desc[:200]
        escaped_desc = (
            display_desc.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

        item = f"""
        <div style="margin-bottom:8px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;">
            <div style="font-size:13px;color:#1e293b;font-weight:500;">{escaped_desc}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">
                <span style="background:{bg};color:{fg};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;">{label}</span>
                {f' &middot; <a href="{link}" style="color:#64748b;text-decoration:none;">Details</a>' if link else ''}
            </div>
        </div>
        """
        items.append(item)

    count = len(changes)
    return f"""
    <div style="margin-bottom:32px;">
        <h2 style="margin:0 0 4px;font-size:16px;color:#1e293b;">
            GuardDuty Announcements
        </h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:13px;">
            {count} {'announcement' if count == 1 else 'announcements'}
        </p>
        {"".join(items)}
        <p style="margin:8px 0 0;font-size:12px;">
            <a href="{SITE_URL}/guardduty" style="color:#2563eb;text-decoration:none;">View GuardDuty feed &rarr;</a>
        </p>
    </div>
    """


def _policy_selection(changes, topics):
    """The policy changes a subscriber's topics entitle them to.

    Holding discoveries without iam_policies means "only tell me about actions
    AWS has never used before", not every version bump.
    """
    if "iam_policies" in topics:
        return changes
    if "discoveries" in topics:
        return [c for c in changes if policy_diff.is_discovery(c)]
    return []


def _summary_parts(policy_changes, endpoint_changes, guardduty_changes, brief=False):
    """Topic counts used for both the subject line and the header subtitle."""
    parts = []
    if policy_changes:
        parts.append(policy_diff.summarize_counts(policy_changes, brief=brief))
    if endpoint_changes:
        n = len(endpoint_changes)
        parts.append(f"{n} endpoint {'change' if n == 1 else 'changes'}")
    if guardduty_changes:
        n = len(guardduty_changes)
        parts.append(f"{n} GuardDuty {'update' if n == 1 else 'updates'}")
    return parts


def build_email_html(subscriber, policy_changes, endpoint_changes, guardduty_changes):
    """Compose the multi-topic digest email HTML."""
    sections = []

    if policy_changes:
        sections.append(policy_diff.render_policy_section(policy_changes, SITE_URL))
    if endpoint_changes:
        sections.append(_build_endpoint_section(endpoint_changes))
    if guardduty_changes:
        sections.append(_build_guardduty_section(guardduty_changes))

    return policy_diff.render_email(
        title="IAMTrail Digest",
        summary=", ".join(_summary_parts(policy_changes, endpoint_changes, guardduty_changes)),
        accent="#2563eb",
        body_html="\n".join(sections),
        site_url=SITE_URL,
        manage_token=subscriber["manage_token"],
        intro="You're receiving this because you subscribed to IAMTrail notifications.",
    )


def build_subject(policy_changes, endpoint_changes, guardduty_changes):
    """Build a concise email subject reflecting all included topics."""
    parts = _summary_parts(
        policy_changes, endpoint_changes, guardduty_changes, brief=True
    )
    return f"IAMTrail: {', '.join(parts)}"


def build_telegram_recap(now, policy_changes, endpoint_changes, guardduty_changes):
    """The Monday recap for the Telegram channel.

    The channel carries discoveries only, so it can go quiet for weeks and a
    reader has no way to tell whether it is working or whether AWS has simply
    been still. One post a week is enough of a pulse, and it doubles as the
    summary a reader who muted the busy days would want.
    """
    esc = telegram_publisher.escape
    week_of = (now - timedelta(days=7)).strftime("%-d %B")

    lines = [
        "<b>IAMTrail weekly recap</b>",
        f"{week_of} to {now.strftime('%-d %B %Y')}",
        "",
    ]

    if policy_changes:
        lines.append(
            policy_diff.plural(
                len(policy_changes), "AWS managed IAM policy", "AWS managed IAM policies"
            )
            + " updated"
        )

    prefixes = sorted(
        {p for c in policy_changes for p in c.get("new_service_prefixes") or []}
    )
    with_new_actions = [
        c for c in policy_changes if c.get("new_actions") and not c.get("new_service_prefixes")
    ]

    if prefixes:
        named = ", ".join(iam_metadata.label_service(p) for p in prefixes)
        lines.append(
            f"<b>{policy_diff.sentence(policy_diff.new_service_phrase(prefixes))}</b>: {esc(named)}"
        )
    if with_new_actions:
        total = sum(len(c.get("new_actions") or []) for c in with_new_actions)
        lines.append(
            f"<b>{policy_diff.sentence(policy_diff.never_before_seen(total))}</b> across "
            + policy_diff.plural(len(with_new_actions), "policy", "policies")
        )
    if not prefixes and not with_new_actions:
        # A change that could not be classified, or whose diff could not be read, is
        # not evidence of a quiet week: new_actions is empty because nothing looked,
        # not because nothing happened. Asserting the quiet week anyway is what put
        # eleven false recaps out over two brand-new AWS services.
        blind = [
            c
            for c in policy_changes
            if not c.get("classified")
            or (c.get("detailed", True) and not c.get("resolved"))
        ]
        if blind:
            lines.append(
                "Could not check for never-before-seen actions or new AWS services "
                "this week"
            )
        else:
            lines.append("No never-before-seen actions or services this week")

    if endpoint_changes:
        lines.append(policy_diff.plural(len(endpoint_changes), "AWS endpoint change"))
    if guardduty_changes:
        lines.append(
            policy_diff.plural(len(guardduty_changes), "GuardDuty announcement")
        )

    lines.append("")
    lines.append(f"{SITE_URL}/discoveries")

    body = "\n".join(lines)
    if len(body) > telegram_publisher.MESSAGE_LIMIT:
        body = body[: telegram_publisher.MESSAGE_LIMIT]
    return body


def handler(event, context):
    try:
        policy_diff.clear_cache()
        _resolved_changes.clear()
        now = datetime.now(timezone.utc)
        is_monday = now.weekday() == 0

        daily_policy = get_recent_policy_changes(1)
        weekly_policy = get_recent_policy_changes(7) if is_monday else []

        daily_endpoints = get_recent_endpoint_changes(1)
        weekly_endpoints = get_recent_endpoint_changes(7) if is_monday else []

        daily_guardduty = get_recent_guardduty_changes(1)
        weekly_guardduty = get_recent_guardduty_changes(7) if is_monday else []

        has_daily = daily_policy or daily_endpoints or daily_guardduty
        has_weekly = weekly_policy or weekly_endpoints or weekly_guardduty

        if not has_daily and not has_weekly:
            print("No changes to report across any topic")
            # The recap still goes out, because a quiet week is itself the news
            # and silence would read as a broken channel.
            if is_monday:
                telegram_publisher.post(build_telegram_recap(now, [], [], []))
            discord.send(
                "Digest - No Changes",
                "No changes to report today (policies, endpoints, GuardDuty)",
                discord.COLOR_INFO,
                fields=[("Day", now.strftime("%A %Y-%m-%d"), True)],
            )
            return {"statusCode": 200, "body": "No changes"}

        # Resolve every change once up front, under a single detail budget, so
        # the per-subscriber loop is pure rendering.
        print(f"Resolving {len(daily_policy) + len(weekly_policy)} policy changes")
        resolve_policy_changes(daily_policy + weekly_policy)
        daily_policy = resolve_policy_changes(daily_policy)
        weekly_policy = resolve_policy_changes(weekly_policy)

        # Daily and weekly share these record objects, so one pass annotates both.
        action_registry.classify(list(_resolved_changes.values()))

        # A change we could not read renders as "no action added or removed" and can
        # never be a discovery, which is exactly what a genuinely uneventful change
        # looks like, so this cannot stay a log line.
        failed = policy_diff.unresolved(list(_resolved_changes.values()))
        if failed:
            discord.send(
                "Diffs could not be resolved",
                f"{policy_diff.plural(len(failed), 'change')} went into today's "
                "digest without a readable diff, so their action delta is unknown "
                "and any never-before-seen action in them was missed. Usually a "
                "GitHub API outage or an expired token.",
                discord.COLOR_ERROR,
                fields=[("Policies", ", ".join(failed[:10]), False)],
            )

        # Posted before the per-subscriber loop, so a slow or partly failing send
        # cannot cost the channel its weekly pulse.
        if is_monday:
            telegram_publisher.post(
                build_telegram_recap(
                    now, weekly_policy, weekly_endpoints, weekly_guardduty
                )
            )

        subscribers = []
        scan_kwargs = {
            "FilterExpression": "confirmed = :c",
            "ExpressionAttributeValues": {":c": True},
        }
        while True:
            result = subs_table.scan(**scan_kwargs)
            subscribers.extend(result.get("Items", []))
            if "LastEvaluatedKey" not in result:
                break
            scan_kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]

        sent_count = 0
        fail_count = 0
        for subscriber in subscribers:
            frequency = subscriber.get("frequency", "daily")
            topics = set(subscriber.get("topics", ["iam_policies"]))
            subscribed_policies = set(subscriber.get("policies", ["*"]))

            if frequency == "instant":
                # Instant subscribers still get digest for non-IAM topics
                if not (topics & {"endpoints", "guardduty"}):
                    continue
            elif frequency == "daily":
                pass
            elif frequency == "weekly" and is_monday:
                pass
            else:
                continue

            if frequency == "daily" or frequency == "instant":
                pc = _policy_selection(daily_policy, topics)
                ec = daily_endpoints if "endpoints" in topics else []
                gc = daily_guardduty if "guardduty" in topics else []
            elif frequency == "weekly":
                pc = _policy_selection(weekly_policy, topics)
                ec = weekly_endpoints if "endpoints" in topics else []
                gc = weekly_guardduty if "guardduty" in topics else []
            else:
                continue

            # Instant subscribers only get digest for non-IAM topics
            if frequency == "instant":
                pc = []

            # Filter IAM policies by subscription preference
            if pc and "*" not in subscribed_policies:
                pc = [c for c in pc if c["name"] in subscribed_policies]

            if not pc and not ec and not gc:
                continue

            try:
                html = build_email_html(subscriber, pc, ec, gc)
                subject = build_subject(pc, ec, gc)
                ses.send_email(
                    Source=SENDER_EMAIL,
                    Destination={"ToAddresses": [subscriber["email"]]},
                    Message={
                        "Subject": {"Data": subject},
                        "Body": {"Html": {"Data": html}},
                    },
                )
                sent_count += 1
            except Exception as e:
                fail_count += 1
                print(f"Failed to send to {subscriber['email']}: {e}")
                discord.send(
                    "Digest Send Failure",
                    f"Failed to email {discord.mask_email(subscriber['email'])}",
                    discord.COLOR_WARNING,
                    fields=[("Error", str(e)[:200], False)],
                )

        print(f"Sent {sent_count} digest emails")

        fields = [
            ("Emails Sent", str(sent_count), True),
            ("Daily Policies", str(len(daily_policy)), True),
            ("Daily Endpoints", str(len(daily_endpoints)), True),
            ("Daily GuardDuty", str(len(daily_guardduty)), True),
        ]
        if is_monday:
            fields.append(("Weekly Policies", str(len(weekly_policy)), True))
            fields.append(("Weekly Endpoints", str(len(weekly_endpoints)), True))
            fields.append(("Weekly GuardDuty", str(len(weekly_guardduty)), True))
        if fail_count:
            fields.append(("Failures", str(fail_count), True))

        discord.send(
            "Digest Complete",
            f"Sent {sent_count} digest emails",
            discord.COLOR_SUCCESS if not fail_count else discord.COLOR_WARNING,
            fields=fields,
        )

        return {"statusCode": 200, "body": f"Sent {sent_count} emails"}

    except Exception as e:
        discord.send(
            "Digest Sender Error",
            f"```{traceback.format_exc()[-1000:]}```",
            discord.COLOR_ERROR,
        )
        raise

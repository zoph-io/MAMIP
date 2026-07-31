import json
import os
import time
import traceback
import boto3
import bluesky_publisher
import discord_notifier as discord

TABLE_NAME = os.environ.get("GUARDDUTY_TABLE", "")

# Bluesky rejects a post longer than this. Tags are the only discovery surface
# the account has, so they are budgeted alongside the link rather than dropped.
BLUESKY_LIMIT = 300
BLUESKY_TAGS = "#AWS #GuardDuty #CloudSecurity"

# Discord truncates an embed description past this, so cut it ourselves.
DISCORD_DESC_LIMIT = 4096

TYPE_CONFIG = {
    "NEW_FINDINGS": {
        "detail_key": "findingDetails",
        "description_fn": lambda d: d.get("findingType", ""),
        "detail_fn": lambda d: d.get("findingDescription", d.get("description", "")),
        "link_fn": lambda d: d.get("link", ""),
        "discord_color": 0xE74C3C,
        "discord_title": "New GuardDuty Finding",
        "post_prefix": "New AWS GuardDuty Finding:",
    },
    "UPDATED_FINDINGS": {
        "detail_key": "findingDetails",
        "description_fn": lambda d: d.get("findingType", ""),
        "detail_fn": lambda d: d.get("description", ""),
        "link_fn": lambda d: d.get("link", ""),
        "discord_color": 0xF39C12,
        "discord_title": "Updated GuardDuty Finding",
        "post_prefix": "Updated AWS GuardDuty Finding:",
    },
    "NEW_FEATURES": {
        "detail_key": "featureDetails",
        "description_fn": lambda d: d.get("featureDescription", ""),
        "detail_fn": lambda d: d.get("featureDescription", ""),
        "link_fn": lambda d: d.get("featureLink", ""),
        "discord_color": 0x2ECC71,
        "discord_title": "New GuardDuty Feature",
        "post_prefix": "New Feature on AWS GuardDuty:",
    },
    "NEW_REGION": {
        "detail_key": "regionDetails",
        "description_fn": lambda d: d.get("description", ""),
        "detail_fn": lambda d: d.get("description", ""),
        "link_fn": lambda d: d.get("link", ""),
        "discord_color": 0x3498DB,
        "discord_title": "New GuardDuty Region",
        "post_prefix": "New AWS GuardDuty Region:",
    },
}

GENERAL_CONFIG = {
    "discord_color": 0x95A5A6,
    "discord_title": "GuardDuty Announcement",
    "post_prefix": "AWS GuardDuty Update:",
}


def handler(event, context):
    print(f"Received {len(event.get('Records', []))} records")

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(TABLE_NAME)

    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            message_str = body.get("Message", body)
            if isinstance(message_str, str):
                message = json.loads(message_str)
            else:
                message = message_str

            msg_type = message.get("type", "UNKNOWN")
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            today = time.strftime("%Y-%m-%d", time.gmtime())
            timestamp_id = time.strftime("%Y-%m-%d-%H-%M-%S", time.gmtime())

            print(f"Processing GuardDuty announcement: {msg_type}")

            if msg_type == "GENERAL":
                _process_general(message, table, today, timestamp_id, now)
            elif msg_type in TYPE_CONFIG:
                _process_typed(message, msg_type, table, today, timestamp_id, now)
            else:
                print(f"Unknown message type: {msg_type}")
                discord.send(
                    "Unknown GuardDuty Announcement Type",
                    f"```json\n{json.dumps(message, indent=2)[:1500]}\n```",
                    discord.COLOR_WARNING,
                )

        except Exception as e:
            print(f"Error processing record: {e}")
            discord.send(
                "GuardDuty Recorder Error",
                f"```{traceback.format_exc()[-1000:]}```",
                discord.COLOR_ERROR,
            )
            raise


def _process_typed(message, msg_type, table, today, timestamp_id, now):
    config = TYPE_CONFIG[msg_type]
    details = message.get(config["detail_key"], [])

    for i, detail in enumerate(details):
        short_desc = config["description_fn"](detail)[:150]
        full_desc = config["detail_fn"](detail)
        link = config["link_fn"](detail)
        announcement_id = f"{msg_type}-{timestamp_id}-{i}"

        table.put_item(
            Item={
                "announcement_date": today,
                "announcement_id": announcement_id,
                "type": msg_type,
                "description": full_desc,
                "short_description": short_desc,
                "link": link,
                "raw_message": json.dumps(message),
                "detected_at": now,
            }
        )

        fields = [
            ("Type", msg_type, True),
            ("Date", today, True),
        ]
        if link:
            fields.append(("Link", f"[Details]({link})", True))

        discord.send(
            config["discord_title"],
            short_desc or full_desc[:200],
            config["discord_color"],
            fields=fields,
            footer="GuardDuty Monitor",
        )

        # The public embed names the finding in the title and explains it in the
        # body. It used to do the opposite: a generic title and a description
        # that was only the finding type ID, so the channel announced
        # "Execution:Runtime/SuspiciousTool" and never said what that meant.
        page_url = link if link else "https://iamtrail.com/guardduty"
        discord.send_public(
            f"{config['discord_title']}: {short_desc}" if short_desc else config["discord_title"],
            full_desc[:DISCORD_DESC_LIMIT] or short_desc,
            config["discord_color"],
            fields=fields,
            footer="GuardDuty",
            url=page_url,
        )

        bluesky_publisher.post(_build_post(config["post_prefix"], short_desc, link))

    print(f"Recorded {len(details)} {msg_type} announcements")


def _process_general(message, table, today, timestamp_id, now):
    entries = message.get("message", [])

    for i, entry in enumerate(entries):
        title = entry.get("title", "")
        body = entry.get("body", "")
        links = entry.get("links", [])
        link = links[0] if links else ""
        announcement_id = f"GENERAL-{timestamp_id}-{i}"

        table.put_item(
            Item={
                "announcement_date": today,
                "announcement_id": announcement_id,
                "type": "GENERAL",
                "description": body,
                "short_description": title[:150],
                "link": link,
                "raw_message": json.dumps(message),
                "detected_at": now,
            }
        )

        fields = [
            ("Type", "GENERAL", True),
            ("Date", today, True),
        ]
        if link:
            fields.append(("Link", f"[Details]({link})", True))

        discord.send(
            GENERAL_CONFIG["discord_title"],
            f"**{title}**\n{body[:300]}",
            GENERAL_CONFIG["discord_color"],
            fields=fields,
            footer="GuardDuty Monitor",
        )

        # Title carries the announcement, body carries the whole text: Discord
        # allows 4096 characters, so there is no reason to cut it at 300 the way
        # the ops embed does.
        page_url = link if link else "https://iamtrail.com/guardduty"
        discord.send_public(
            f"{GENERAL_CONFIG['discord_title']}: {title}" if title else GENERAL_CONFIG["discord_title"],
            body[:DISCORD_DESC_LIMIT],
            GENERAL_CONFIG["discord_color"],
            fields=fields,
            footer="GuardDuty",
            url=page_url,
        )

        bluesky_publisher.post(_build_post(GENERAL_CONFIG["post_prefix"], title, link))

    print(f"Recorded {len(entries)} GENERAL announcements")


def _build_post(prefix, description, link):
    """A GuardDuty post: what happened, the doc link, then the tags.

    Budgeted against Bluesky's 300-character cap with the link and the tags held
    back, since a truncated link is worthless and a post without tags reaches
    nobody. The description yields whatever room is left.
    """
    fixed = len(prefix) + len(BLUESKY_TAGS) + 4
    if link:
        fixed += len(link) + 2
    max_desc_len = max(0, BLUESKY_LIMIT - fixed)

    desc = description[:max_desc_len]
    if len(description) > max_desc_len:
        desc = desc[:max(0, max_desc_len - 3)] + "..."

    parts = [prefix, desc]
    if link:
        parts.append(link)
    return f"{' '.join(p for p in parts if p)}\n\n{BLUESKY_TAGS}"

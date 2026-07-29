"""Broadcast IAMTrail discoveries to a read-only Telegram channel.

The channel carries novelty only: an action or service prefix that has never
appeared in any AWS managed policy before. Routine version bumps stay on email,
Bluesky and RSS, so subscribing here is worth it even for someone who ignores
every other feed.

Read-only comes from Telegram itself. A channel with no linked discussion group
cannot be replied to, so there is no moderation surface and no subscription state
on our side. Telegram owns the member list.

Manual prerequisites, mirroring how the public Discord webhook is provisioned:

  1. Create the bot with @BotFather and keep the token.
  2. Create the public channel, pick its @handle, and add the bot as an
     administrator with "Post Messages". A bot cannot post to a channel otherwise.
  3. Store the token as an SSM SecureString at /iamtrail/telegram-bot-token.
  4. Leave no discussion group linked, so members cannot reply.

Never raises: a broken channel must not fail a notification run.
"""

import json
import os
import time
import urllib.error
import urllib.request

import boto3

API_BASE = "https://api.telegram.org"

# Telegram rejects a sendMessage body longer than this.
MESSAGE_LIMIT = 4096

# Roughly 20 messages per minute per channel, which is why callers send one
# aggregated message per run rather than one per policy.
RETRY_AFTER_CAP = 30

CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

_ssm = boto3.client("ssm")
_token = None


def _get_token():
    global _token
    if _token:
        return _token
    param_name = os.environ.get("TELEGRAM_TOKEN_SSM", "")
    if not param_name:
        return None
    try:
        resp = _ssm.get_parameter(Name=param_name, WithDecryption=True)
        _token = resp["Parameter"]["Value"]
        return _token
    except Exception as e:
        print(f"[telegram_publisher] Failed to read SSM parameter: {e}")
        return None


def escape(text):
    """Escape the three characters parse_mode=HTML treats as markup.

    Policy and action names are AWS-controlled strings interpolated into the
    message, so without this Telegram would reject or mangle the whole post.
    """
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _send_once(url, payload):
    """POST the message. Returns seconds to wait when rate-limited, else None."""
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "IAMTrail-Telegram/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
        return None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        if e.code == 429:
            try:
                retry = json.loads(body).get("parameters", {}).get("retry_after", 1)
            except ValueError:
                retry = 1
            return min(int(retry), RETRY_AFTER_CAP)
        print(f"[telegram_publisher] Telegram rejected the post ({e.code}): {body[:300]}")
        return None


def post(text):
    """Send one message to the channel. Never raises - logs errors instead."""
    token = _get_token()
    if not token or not CHAT_ID or not text:
        return False

    if len(text) > MESSAGE_LIMIT:
        print(f"[telegram_publisher] Body is {len(text)} chars, trimming to the limit")
        text = text[:MESSAGE_LIMIT]

    url = f"{API_BASE}/bot{token}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        # Previews are left on so the per-policy Open Graph image the site
        # already generates renders in the channel.
        "disable_web_page_preview": False,
    }

    try:
        retry = _send_once(url, payload)
        if retry is None:
            return True
        # Honour one 429 and give up after that, rather than hold the Lambda open.
        print(f"[telegram_publisher] Rate limited, retrying in {retry}s")
        time.sleep(retry)
        return _send_once(url, payload) is None
    except Exception as e:
        print(f"[telegram_publisher] Failed to post to Telegram: {e}")
        return False

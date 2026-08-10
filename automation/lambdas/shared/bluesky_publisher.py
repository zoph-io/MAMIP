"""
Enqueue a plain-text post for @iamtrail.bsky.social.

The FIFO queue is consumed by the qbsky-mamip-prod Lambda (outside this repo).
Message body must stay under ~300 chars (Bluesky post limit).
"""

import os

import boto3

_sqs_client = None
QUEUE_URL = os.environ.get("BLUESKY_QUEUE_URL", "")


def _client():
    global _sqs_client
    if _sqs_client is None:
        _sqs_client = boto3.client(
            "sqs", region_name=os.environ.get("AWS_REGION", "eu-west-1")
        )
    return _sqs_client


_alerted = set()


def _alert(reason):
    """Log a dark feed and page the ops channel about it.

    Deduplicated per process so a bulk day does not spend the run reporting the same
    outage, and discord_notifier is imported lazily so this module stays usable
    wherever it is not bundled.
    """
    print(f"[bluesky_publisher] {reason}")
    if reason in _alerted:
        return
    _alerted.add(reason)
    try:
        import discord_notifier

        discord_notifier.send(
            "Bluesky is not publishing", reason, discord_notifier.COLOR_ERROR
        )
    except Exception as e:
        print(f"[bluesky_publisher] Could not raise the alert: {e}")


def post(text, group_id="1"):
    """Send text to the Bluesky FIFO queue. Never raises - alerts and returns False.

    Nothing to say is legitimate. A missing queue URL is not, and followers cannot
    tell the two apart, so it alerts rather than returning quietly.
    """
    if not text:
        return False
    if not QUEUE_URL:
        _alert(
            "BLUESKY_QUEUE_URL is unset, so the feed is dark and a follower cannot "
            "tell this from a quiet day."
        )
        return False
    try:
        _client().send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=text,
            MessageGroupId=str(group_id),
        )
        return True
    except Exception as e:
        _alert(f"A Bluesky post was lost on the way to the queue: {e}.")
        return False

import json
import os
import re
import traceback
import boto3
import discord_notifier as discord
import policy_diff

dynamodb = boto3.resource("dynamodb")
ses = boto3.client("ses", region_name=os.environ.get("SES_REGION", "eu-west-3"))

SUBSCRIPTIONS_TABLE = os.environ["SUBSCRIPTIONS_TABLE"]
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
SITE_URL = os.environ["SITE_URL"]

subs_table = dynamodb.Table(SUBSCRIPTIONS_TABLE)


def build_email_html(subscriber, policy_changes):
    """Compose the instant notification email from resolved change records."""
    return policy_diff.render_email(
        title="IAMTrail Instant Alert",
        summary=f"{policy_diff.summarize_counts(policy_changes)} just changed",
        accent="#f59e0b",
        body_html=policy_diff.render_policy_section(policy_changes, SITE_URL),
        site_url=SITE_URL,
        manage_token=subscriber["manage_token"],
        intro="You're receiving this instant alert because you subscribed to IAMTrail policy change notifications.",
    )


def get_instant_subscribers():
    """Scan for confirmed instant subscribers that track IAM policies."""
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
        if "iam_policies" in s.get("topics", ["iam_policies"])
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

                if not matching:
                    continue

                try:
                    html = build_email_html(subscriber, matching)
                    ses.send_email(
                        Source=SENDER_EMAIL,
                        Destination={"ToAddresses": [subscriber["email"]]},
                        Message={
                            "Subject": {
                                "Data": (
                                    "IAMTrail Alert: "
                                    f"{policy_diff.summarize_counts(matching, brief=True)}"
                                    " just changed"
                                )
                            },
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

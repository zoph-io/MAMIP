# Notifications and social channels

## Bluesky

IAM policies (instant-notifier Lambda), GuardDuty (Lambda + optional GitHub sync), and endpoint changes (GitHub Actions) enqueue plain text to the FIFO queue consumed by `qbsky-mamip-prod` in `eu-west-1`, posted as [@iamtrail.bsky.social](https://bsky.app/profile/iamtrail.bsky.social). Posts open with the finding itself and close with hashtags; the old `[Policies]` / `[GuardDuty]` / `[Endpoints]` prefixes were removed because they spent characters on a label the reader already had from the account.

## Discord

- **Internal ops** (`/iamtrail/discord-webhook-url` in SSM): errors, run summaries, and operator alerts. Used by Lambdas via `DISCORD_WEBHOOK_SSM` and by `runbook-prod.sh` for failures. Deliberately terse; the canonical reader-facing vocabulary does not apply here.
- **Invite-only channel** (`/iamtrail/discord-public-webhook-url` in SSM, SecureString): the same events as Bluesky, but embeds allow far more room, so this is the only short-form channel that carries the full action list, the permissions-management callout, and the services touched. Not linked from the public website (iamtrail.com only promotes Bluesky and RSS). Lambdas and the runbook read the webhook from SSM; GitHub Actions use the OIDC role.

The public policy-change embed is built by **instant-notifier**, not change-recorder, for the same reason as Bluesky and Telegram: that Lambda is where diffs are resolved and never-before-seen actions are classified. change-recorder only ever receives a list of policy names, which cannot produce more than a "something changed" post.

## X / Twitter

Removed. IAMTrail no longer posts to X (the X handles were deleted). The `x_poster.py` script and the `iamtrail/social/*` Secrets Manager secrets have been deleted. Bluesky is the only social channel.

## GitHub Actions IAM

`GhA-MAMIP-Role` uses **three** customer-managed policies (split to stay under the 6,144 character limit per policy). The JSON files live in `automation/`: [github-actions-01-s3-foundation.json](../automation/github-actions-01-s3-foundation.json) (S3, ECS, ECR, CloudWatch logs, CloudFront, R53, ACM, Events, misc read), [github-actions-02-iam.json](../automation/github-actions-02-iam.json) (IAM for Terraform and self-attach to this role), and [github-actions-03-services.json](../automation/github-actions-03-services.json) (DDB, Lambda, SQS, SNS, API Gateway, Secrets, SSM, `cloudwatch:GetMetricStatistics`, and other services).

- `sqs:SendMessage` on the Bluesky FIFO queue and related permissions are in `03-services`.
- `ssm:GetParameter` on `arn:aws:ssm:eu-west-1:567589703415:parameter/iamtrail/*` (Discord webhooks under `/iamtrail/`) is in `03-services`.

`aws_iam_policy` / `aws_iam_role_policy_attachment` in [`automation/tf-fargate/iam.tf`](../automation/tf-fargate/iam.tf) apply these. After changing any fragment, `terraform apply` the `automation/tf-fargate` stack.

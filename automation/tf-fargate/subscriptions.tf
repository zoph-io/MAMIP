################################
# IAMTrail Email Subscriptions #
################################

locals {
  domain_name                = "iamtrail.com"
  api_domain                 = "api.iamtrail.com"
  sender                     = "IAMTrail <noreply@iamtrail.com>"
  sender_email               = "noreply@iamtrail.com"
  ses_region                 = "eu-west-3"
  discord_webhook_ssm        = "/iamtrail/discord-webhook-url"
  discord_public_webhook_ssm = "/iamtrail/discord-public-webhook-url"
  telegram_token_ssm         = "/iamtrail/telegram-bot-token"
  github_secret_id           = "mamip/prod/github"
  github_secret_arn_pattern  = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:mamip/prod/github-*"
  bluesky_fifo_queue_url     = "https://sqs.${var.aws_region}.amazonaws.com/${data.aws_caller_identity.current.account_id}/${var.qbsky_sqs_name}.fifo"
}

# ──────────────────────────────
# Route53 Hosted Zone
# ──────────────────────────────

resource "aws_route53_zone" "iamtrail" {
  name = local.domain_name
}

# ──────────────────────────────
# ACM Certificates
# ──────────────────────────────

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_acm_certificate" "iamtrail" {
  provider                  = aws.us_east_1
  domain_name               = local.domain_name
  subject_alternative_names = ["*.${local.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.iamtrail.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = aws_route53_zone.iamtrail.zone_id
  allow_overwrite = true
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "iamtrail" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.iamtrail.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

resource "aws_acm_certificate" "api" {
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = aws_route53_zone.iamtrail.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.api_cert_validation : record.fqdn]
}

# ──────────────────────────────
# S3 + CloudFront for website
# ──────────────────────────────

resource "aws_s3_bucket" "website" {
  bucket = local.domain_name
}

resource "aws_s3_bucket_public_access_block" "website" {
  bucket                  = aws_s3_bucket.website.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_identity" "website" {
  comment = "OAI for ${local.domain_name}"
}

resource "aws_s3_bucket_policy" "website" {
  bucket = aws_s3_bucket.website.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = aws_cloudfront_origin_access_identity.website.iam_arn }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.website.arn}/*"
    }]
  })
}

resource "aws_cloudfront_function" "index_rewrite" {
  name    = "iamtrail-index-rewrite"
  runtime = "cloudfront-js-2.0"
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.endsWith('/')) {
        request.uri += 'index.html';
      } else if (!uri.includes('.')) {
        request.uri += '/index.html';
      }
      return request;
    }
  EOF
}

resource "aws_cloudfront_distribution" "website" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [local.domain_name]

  origin {
    domain_name = aws_s3_bucket.website.bucket_regional_domain_name
    origin_id   = "S3-${local.domain_name}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.website.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${local.domain_name}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index_rewrite.arn
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.iamtrail.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.iamtrail]
}

resource "aws_route53_record" "website" {
  zone_id = aws_route53_zone.iamtrail.zone_id
  name    = local.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.website.domain_name
    zone_id                = aws_cloudfront_distribution.website.hosted_zone_id
    evaluate_target_health = false
  }
}

# ──────────────────────────────
# 301 Redirect from mamip.zoph.io
# ──────────────────────────────

resource "aws_cloudfront_function" "redirect_mamip" {
  name    = "iamtrail-redirect-mamip"
  runtime = "cloudfront-js-2.0"
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
          location: { value: 'https://${local.domain_name}' + request.uri }
        }
      };
    }
  EOF
}

# SES identity, DKIM, MAIL FROM, SPF, and DMARC are managed manually
# in eu-west-3 via the AWS console (production mode approved there).

# ──────────────────────────────
# DynamoDB Tables
# ──────────────────────────────

resource "aws_dynamodb_table" "subscriptions" {
  name         = "iamtrail-subscriptions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "manage_token"
    type = "S"
  }

  global_secondary_index {
    name            = "manage_token-index"
    hash_key        = "manage_token"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "rate_limits" {
  name         = "iamtrail-rate-limits"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "ip"

  attribute {
    name = "ip"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "policy_changes" {
  name         = "iamtrail-policy-changes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "date"
  range_key    = "policy_name"

  attribute {
    name = "date"
    type = "S"
  }

  attribute {
    name = "policy_name"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

# ──────────────────────────────────────
# DynamoDB - IAM action first-seen registry
# ──────────────────────────────────────

# Earliest sighting of every IAM action and service prefix in the archive, so a
# notification can say "never seen before" without walking git history. Seeded by
# automation/scripts/build_action_registry.py and appended to as changes arrive.
# Deliberately no TTL: an expired entry would re-announce a known action.
# No point-in-time recovery either: every entry is derivable from the archive, so
# a rebuild from git is faster than a restore and costs nothing.
resource "aws_dynamodb_table" "action_registry" {
  name         = "iamtrail-action-registry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "entry"

  attribute {
    name = "entry"
    type = "S"
  }
}

# ──────────────────────────────────────
# DynamoDB - Endpoint Changes (botocore)
# ──────────────────────────────────────

resource "aws_dynamodb_table" "endpoint_changes" {
  name         = "iamtrail-endpoint-changes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "detected_date"
  range_key    = "change_id"

  attribute {
    name = "detected_date"
    type = "S"
  }

  attribute {
    name = "change_id"
    type = "S"
  }

  tags = var.tags
}

# ──────────────────────────────
# SQS Queue for Change Recording
# ──────────────────────────────

resource "aws_sqs_queue" "changes" {
  name                       = "iamtrail-changes-queue"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 86400

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.changes_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "changes_dlq" {
  name                      = "iamtrail-changes-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue_policy" "changes_dlq" {
  queue_url = aws_sqs_queue.changes_dlq.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sqs.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.changes_dlq.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = aws_sqs_queue.changes.arn
        }
      }
    }]
  })
}

resource "aws_sqs_queue_policy" "changes" {
  queue_url = aws_sqs_queue.changes.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.changes.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = "arn:aws:sns:${var.aws_region}:${data.aws_caller_identity.current.account_id}:mamip-sns-topic"
        }
      }
    }]
  })
}

resource "aws_sns_topic_subscription" "changes" {
  topic_arn = "arn:aws:sns:${var.aws_region}:${data.aws_caller_identity.current.account_id}:mamip-sns-topic"
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.changes.arn
}

# ──────────────────────────────
# SQS Queue for Instant Notifications
# ──────────────────────────────

resource "aws_sqs_queue" "instant" {
  name                       = "iamtrail-instant-queue"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 86400

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.instant_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "instant_dlq" {
  name                      = "iamtrail-instant-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue_policy" "instant_dlq" {
  queue_url = aws_sqs_queue.instant_dlq.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sqs.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.instant_dlq.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = aws_sqs_queue.instant.arn
        }
      }
    }]
  })
}

resource "aws_sqs_queue_policy" "instant" {
  queue_url = aws_sqs_queue.instant.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.instant.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = "arn:aws:sns:${var.aws_region}:${data.aws_caller_identity.current.account_id}:mamip-sns-topic"
        }
      }
    }]
  })
}

resource "aws_sns_topic_subscription" "instant" {
  topic_arn = "arn:aws:sns:${var.aws_region}:${data.aws_caller_identity.current.account_id}:mamip-sns-topic"
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.instant.arn
}

# ──────────────────────────────
# Lambda: Subscription API
# ──────────────────────────────

data "archive_file" "subscription_api" {
  type        = "zip"
  output_path = "${path.module}/../lambdas/.dist/subscription-api.zip"

  source {
    content  = file("${path.module}/../lambdas/subscription-api/index.py")
    filename = "index.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/discord_notifier.py")
    filename = "discord_notifier.py"
  }
}

resource "aws_lambda_function" "subscription_api" {
  function_name    = "iamtrail-subscription-api"
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.subscription_api.output_path
  source_code_hash = data.archive_file.subscription_api.output_base64sha256
  role             = aws_iam_role.subscription_api.arn
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      SUBSCRIPTIONS_TABLE = aws_dynamodb_table.subscriptions.name
      RATE_LIMIT_TABLE    = aws_dynamodb_table.rate_limits.name
      SENDER_EMAIL        = local.sender
      SES_REGION          = local.ses_region
      SITE_URL            = "https://${local.domain_name}"
      API_URL             = "https://${local.api_domain}"
      DISCORD_WEBHOOK_SSM = local.discord_webhook_ssm
    }
  }
}

# ──────────────────────────────
# Lambda: Change Recorder
# ──────────────────────────────

data "archive_file" "change_recorder" {
  type        = "zip"
  output_path = "${path.module}/../lambdas/.dist/change-recorder.zip"

  source {
    content  = file("${path.module}/../lambdas/change-recorder/index.py")
    filename = "index.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/discord_notifier.py")
    filename = "discord_notifier.py"
  }
}

resource "aws_lambda_function" "change_recorder" {
  function_name    = "iamtrail-change-recorder"
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.change_recorder.output_path
  source_code_hash = data.archive_file.change_recorder.output_base64sha256
  role             = aws_iam_role.change_recorder.arn
  timeout          = 120
  memory_size      = 128

  environment {
    variables = {
      CHANGES_TABLE              = aws_dynamodb_table.policy_changes.name
      DISCORD_WEBHOOK_SSM        = local.discord_webhook_ssm
      DISCORD_PUBLIC_WEBHOOK_SSM = local.discord_public_webhook_ssm
    }
  }
}

resource "aws_lambda_event_source_mapping" "change_recorder" {
  event_source_arn                   = aws_sqs_queue.changes.arn
  function_name                      = aws_lambda_function.change_recorder.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 5
}

# ──────────────────────────────
# Lambda: Digest Sender
# ──────────────────────────────

data "archive_file" "digest_sender" {
  type        = "zip"
  output_path = "${path.module}/../lambdas/.dist/digest-sender.zip"

  source {
    content  = file("${path.module}/../lambdas/digest-sender/index.py")
    filename = "index.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/discord_notifier.py")
    filename = "discord_notifier.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/policy_diff.py")
    filename = "policy_diff.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/action_registry.py")
    filename = "action_registry.py"
  }
}

resource "aws_lambda_function" "digest_sender" {
  function_name    = "iamtrail-digest-sender"
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.digest_sender.output_path
  source_code_hash = data.archive_file.digest_sender.output_base64sha256
  role             = aws_iam_role.digest_sender.arn
  timeout          = 300
  memory_size      = 512

  environment {
    variables = {
      SUBSCRIPTIONS_TABLE    = aws_dynamodb_table.subscriptions.name
      CHANGES_TABLE          = aws_dynamodb_table.policy_changes.name
      ENDPOINT_CHANGES_TABLE = aws_dynamodb_table.endpoint_changes.name
      GUARDDUTY_TABLE        = aws_dynamodb_table.guardduty_announcements.name
      ACTION_REGISTRY_TABLE  = aws_dynamodb_table.action_registry.name
      SENDER_EMAIL           = local.sender
      SES_REGION             = local.ses_region
      SITE_URL               = "https://${local.domain_name}"
      GITHUB_REPO            = "zoph-io/IAMTrail"
      GITHUB_SECRET_ID       = local.github_secret_id
      DISCORD_WEBHOOK_SSM    = local.discord_webhook_ssm
    }
  }
}

# ──────────────────────────────
# Lambda: Instant Notifier
# ──────────────────────────────

data "archive_file" "instant_notifier" {
  type        = "zip"
  output_path = "${path.module}/../lambdas/.dist/instant-notifier.zip"

  source {
    content  = file("${path.module}/../lambdas/instant-notifier/index.py")
    filename = "index.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/discord_notifier.py")
    filename = "discord_notifier.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/policy_diff.py")
    filename = "policy_diff.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/action_registry.py")
    filename = "action_registry.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/bluesky_publisher.py")
    filename = "bluesky_publisher.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/telegram_publisher.py")
    filename = "telegram_publisher.py"
  }
}

resource "aws_lambda_function" "instant_notifier" {
  function_name    = "iamtrail-instant-notifier"
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.instant_notifier.output_path
  source_code_hash = data.archive_file.instant_notifier.output_base64sha256
  role             = aws_iam_role.instant_notifier.arn
  timeout          = 120
  memory_size      = 256

  reserved_concurrent_executions = 1

  environment {
    variables = {
      SUBSCRIPTIONS_TABLE   = aws_dynamodb_table.subscriptions.name
      ACTION_REGISTRY_TABLE = aws_dynamodb_table.action_registry.name
      SENDER_EMAIL          = local.sender
      SES_REGION            = local.ses_region
      SITE_URL              = "https://${local.domain_name}"
      GITHUB_REPO           = "zoph-io/IAMTrail"
      GITHUB_SECRET_ID      = local.github_secret_id
      DISCORD_WEBHOOK_SSM   = local.discord_webhook_ssm
      BLUESKY_QUEUE_URL     = local.bluesky_fifo_queue_url
      TELEGRAM_TOKEN_SSM    = local.telegram_token_ssm
      TELEGRAM_CHAT_ID      = var.telegram_chat_id
    }
  }
}

resource "aws_lambda_event_source_mapping" "instant_notifier" {
  event_source_arn                   = aws_sqs_queue.instant.arn
  function_name                      = aws_lambda_function.instant_notifier.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 0
}

# ──────────────────────────────
# EventBridge: Daily Digest
# ──────────────────────────────

resource "aws_cloudwatch_event_rule" "daily_digest" {
  name                = "iamtrail-daily-digest"
  description         = "Trigger IAMTrail digest email sender daily at 08:00 UTC"
  schedule_expression = "cron(0 8 * * ? *)"
}

resource "aws_cloudwatch_event_target" "daily_digest" {
  rule = aws_cloudwatch_event_rule.daily_digest.name
  arn  = aws_lambda_function.digest_sender.arn
}

resource "aws_lambda_permission" "daily_digest" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.digest_sender.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_digest.arn
}

# ──────────────────────────────
# CloudWatch Alarms: Lambda Errors
# ──────────────────────────────

locals {
  lambda_alarms = {
    subscription_api   = aws_lambda_function.subscription_api.function_name
    change_recorder    = aws_lambda_function.change_recorder.function_name
    digest_sender      = aws_lambda_function.digest_sender.function_name
    instant_notifier   = aws_lambda_function.instant_notifier.function_name
    guardduty_recorder = aws_lambda_function.guardduty_recorder.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.lambda_alarms

  alarm_name          = "iamtrail-${each.key}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Lambda ${each.value} has errors"
  alarm_actions       = [aws_sns_topic.ecs_task_failure.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each = local.lambda_alarms

  alarm_name          = "iamtrail-${each.key}-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Lambda ${each.value} is being throttled"
  alarm_actions       = [aws_sns_topic.ecs_task_failure.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  for_each = {
    digest_sender = {
      function_name = aws_lambda_function.digest_sender.function_name
      threshold     = 240000
    }
  }

  alarm_name          = "iamtrail-${each.key}-duration"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Maximum"
  threshold           = each.value.threshold
  alarm_description   = "Lambda ${each.value.function_name} approaching timeout (>4min of 5min limit)"
  alarm_actions       = [aws_sns_topic.ecs_task_failure.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  for_each = {
    changes = aws_sqs_queue.changes_dlq.name
    instant = aws_sqs_queue.instant_dlq.name
  }

  alarm_name          = "iamtrail-${each.key}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Messages in the ${each.key} DLQ - processing failures"
  alarm_actions       = [aws_sns_topic.ecs_task_failure.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = each.value
  }
}

# ──────────────────────────────
# API Gateway
# ──────────────────────────────

resource "aws_apigatewayv2_api" "subscriptions" {
  name          = "iamtrail-subscriptions-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["https://${local.domain_name}"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type"]
    max_age       = 86400
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.subscriptions.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
}

resource "aws_apigatewayv2_integration" "subscription_api" {
  api_id                 = aws_apigatewayv2_api.subscriptions.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.subscription_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_subscribe" {
  api_id    = aws_apigatewayv2_api.subscriptions.id
  route_key = "POST /subscribe"
  target    = "integrations/${aws_apigatewayv2_integration.subscription_api.id}"
}

resource "aws_apigatewayv2_route" "get_confirm" {
  api_id    = aws_apigatewayv2_api.subscriptions.id
  route_key = "GET /confirm/{token}"
  target    = "integrations/${aws_apigatewayv2_integration.subscription_api.id}"
}

resource "aws_apigatewayv2_route" "get_manage" {
  api_id    = aws_apigatewayv2_api.subscriptions.id
  route_key = "GET /manage/{token}"
  target    = "integrations/${aws_apigatewayv2_integration.subscription_api.id}"
}

resource "aws_apigatewayv2_route" "put_manage" {
  api_id    = aws_apigatewayv2_api.subscriptions.id
  route_key = "PUT /manage/{token}"
  target    = "integrations/${aws_apigatewayv2_integration.subscription_api.id}"
}

resource "aws_apigatewayv2_route" "delete_manage" {
  api_id    = aws_apigatewayv2_api.subscriptions.id
  route_key = "DELETE /manage/{token}"
  target    = "integrations/${aws_apigatewayv2_integration.subscription_api.id}"
}

resource "aws_apigatewayv2_route" "post_resend" {
  api_id    = aws_apigatewayv2_api.subscriptions.id
  route_key = "POST /resend-manage-link"
  target    = "integrations/${aws_apigatewayv2_integration.subscription_api.id}"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.subscription_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.subscriptions.execution_arn}/*/*"
}

# Custom domain for API
resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = local.api_domain

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.api.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  depends_on = [aws_acm_certificate_validation.api]
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.subscriptions.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.iamtrail.zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ──────────────────────────────
# IAM Roles for Lambdas
# ──────────────────────────────

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# --- Subscription API Role ---

resource "aws_iam_role" "subscription_api" {
  name               = "iamtrail-subscription-api-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "subscription_api" {
  name = "iamtrail-subscription-api-policy"
  role = aws_iam_role.subscription_api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"]
        Resource = [
          aws_dynamodb_table.subscriptions.arn,
          "${aws_dynamodb_table.subscriptions.arn}/index/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem"]
        Resource = [aws_dynamodb_table.rate_limits.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = ["*"]
        Condition = {
          StringEquals = {
            "ses:FromAddress" = local.sender_email
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.discord_webhook_ssm}"]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      }
    ]
  })
}

# --- Change Recorder Role ---

resource "aws_iam_role" "change_recorder" {
  name               = "iamtrail-change-recorder-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "change_recorder" {
  name = "iamtrail-change-recorder-policy"
  role = aws_iam_role.change_recorder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:BatchWriteItem"]
        Resource = [aws_dynamodb_table.policy_changes.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = [aws_sqs_queue.changes.arn]
      },
      {
        Effect = "Allow"
        Action = ["ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.discord_webhook_ssm}",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.discord_public_webhook_ssm}",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      }
    ]
  })
}

# --- Digest Sender Role ---

resource "aws_iam_role" "digest_sender" {
  name               = "iamtrail-digest-sender-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "digest_sender" {
  name = "iamtrail-digest-sender-policy"
  role = aws_iam_role.digest_sender.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:Scan", "dynamodb:Query"]
        Resource = [
          aws_dynamodb_table.subscriptions.arn,
          aws_dynamodb_table.policy_changes.arn,
          aws_dynamodb_table.endpoint_changes.arn,
          aws_dynamodb_table.guardduty_announcements.arn
        ]
      },
      {
        # First-seen lookups for the discovery badges.
        Effect   = "Allow"
        Action   = ["dynamodb:BatchGetItem", "dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = [aws_dynamodb_table.action_registry.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = ["*"]
        Condition = {
          StringEquals = {
            "ses:FromAddress" = local.sender_email
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.discord_webhook_ssm}"]
      },
      {
        # Authenticated GitHub API calls, otherwise diffs hit the 60/hour
        # unauthenticated limit shared across Lambda egress IPs.
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [local.github_secret_arn_pattern]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      }
    ]
  })
}

# --- Instant Notifier Role ---

resource "aws_iam_role" "instant_notifier" {
  name               = "iamtrail-instant-notifier-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "instant_notifier" {
  name = "iamtrail-instant-notifier-policy"
  role = aws_iam_role.instant_notifier.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = [aws_dynamodb_table.subscriptions.arn]
      },
      {
        # First-seen lookups for the discovery badges.
        Effect   = "Allow"
        Action   = ["dynamodb:BatchGetItem", "dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = [aws_dynamodb_table.action_registry.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = [aws_sqs_queue.instant.arn]
      },
      {
        # Public Bluesky posts, consumed by the external qbsky publisher.
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = ["arn:aws:sqs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${var.qbsky_sqs_name}.fifo"]
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = ["*"]
        Condition = {
          StringEquals = {
            "ses:FromAddress" = local.sender_email
          }
        }
      },
      {
        Effect = "Allow"
        Action = ["ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.discord_webhook_ssm}",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.telegram_token_ssm}",
        ]
      },
      {
        # Authenticated GitHub API calls, otherwise diffs hit the 60/hour
        # unauthenticated limit shared across Lambda egress IPs.
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [local.github_secret_arn_pattern]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      }
    ]
  })
}

# ════════════════════════════════════════
# GuardDuty Announcements Monitor (MGDA)
# ════════════════════════════════════════

# ──────────────────────────────
# DynamoDB - GuardDuty Announcements
# ──────────────────────────────

resource "aws_dynamodb_table" "guardduty_announcements" {
  name         = "iamtrail-guardduty-announcements"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "announcement_date"
  range_key    = "announcement_id"

  attribute {
    name = "announcement_date"
    type = "S"
  }

  attribute {
    name = "announcement_id"
    type = "S"
  }

  tags = var.tags
}

# ──────────────────────────────
# SQS Queue for GuardDuty Announcements
# ──────────────────────────────

resource "aws_sqs_queue" "guardduty" {
  name                       = "iamtrail-guardduty-queue"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 86400

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.guardduty_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "guardduty_dlq" {
  name                      = "iamtrail-guardduty-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue_policy" "guardduty_dlq" {
  queue_url = aws_sqs_queue.guardduty_dlq.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sqs.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.guardduty_dlq.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = aws_sqs_queue.guardduty.arn
        }
      }
    }]
  })
}

resource "aws_sqs_queue_policy" "guardduty" {
  queue_url = aws_sqs_queue.guardduty.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.guardduty.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = var.guardduty_sns_topic_arn
        }
      }
    }]
  })
}

# Cross-account SNS subscription (AWS-owned GuardDuty topic)
resource "aws_sns_topic_subscription" "guardduty" {
  topic_arn = var.guardduty_sns_topic_arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.guardduty.arn
}

# ──────────────────────────────
# Lambda: GuardDuty Recorder
# ──────────────────────────────

data "archive_file" "guardduty_recorder" {
  type        = "zip"
  output_path = "${path.module}/../lambdas/.dist/guardduty-recorder.zip"

  source {
    content  = file("${path.module}/../lambdas/guardduty-recorder/index.py")
    filename = "index.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/discord_notifier.py")
    filename = "discord_notifier.py"
  }
  source {
    content  = file("${path.module}/../lambdas/shared/bluesky_publisher.py")
    filename = "bluesky_publisher.py"
  }
}

resource "aws_lambda_function" "guardduty_recorder" {
  function_name    = "iamtrail-guardduty-recorder"
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.guardduty_recorder.output_path
  source_code_hash = data.archive_file.guardduty_recorder.output_base64sha256
  role             = aws_iam_role.guardduty_recorder.arn
  timeout          = 120
  memory_size      = 128

  environment {
    variables = {
      GUARDDUTY_TABLE            = aws_dynamodb_table.guardduty_announcements.name
      DISCORD_WEBHOOK_SSM        = local.discord_webhook_ssm
      DISCORD_PUBLIC_WEBHOOK_SSM = local.discord_public_webhook_ssm
      BLUESKY_QUEUE_URL          = local.bluesky_fifo_queue_url
    }
  }
}

resource "aws_lambda_event_source_mapping" "guardduty_recorder" {
  event_source_arn                   = aws_sqs_queue.guardduty.arn
  function_name                      = aws_lambda_function.guardduty_recorder.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 5
}

# ──────────────────────────────
# IAM Role: GuardDuty Recorder
# ──────────────────────────────

resource "aws_iam_role" "guardduty_recorder" {
  name               = "iamtrail-guardduty-recorder-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "guardduty_recorder" {
  name = "iamtrail-guardduty-recorder-policy"
  role = aws_iam_role.guardduty_recorder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:BatchWriteItem"]
        Resource = [aws_dynamodb_table.guardduty_announcements.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = [aws_sqs_queue.guardduty.arn]
      },
      {
        Effect = "Allow"
        Action = ["ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.discord_webhook_ssm}",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.discord_public_webhook_ssm}",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = ["arn:aws:sqs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${var.qbsky_sqs_name}.fifo"]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      }
    ]
  })
}

# ──────────────────────────────
# CloudWatch Alarm: GuardDuty DLQ
# ──────────────────────────────

resource "aws_cloudwatch_metric_alarm" "guardduty_dlq_messages" {
  alarm_name          = "iamtrail-guardduty-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Messages in the GuardDuty DLQ - processing failures"
  alarm_actions       = [aws_sns_topic.ecs_task_failure.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.guardduty_dlq.name
  }
}

# ──────────────────────────────
# Outputs
# ──────────────────────────────

output "iamtrail_nameservers" {
  description = "NS records to configure at your domain registrar for iamtrail.com"
  value       = aws_route53_zone.iamtrail.name_servers
}

# ──────────────────────────────────────────────
# SSM: Invite-only Discord webhook (not Terraform-managed)
# Create SecureString /iamtrail/discord-public-webhook-url in the console
# with the channel webhook URL. Not advertised on iamtrail.com (Bluesky + RSS only).
# ──────────────────────────────────────────────
# Social: Bluesky and a read-only Telegram channel. Bluesky posts are enqueued to
# the qbsky FIFO queue; the external qbsky-mamip-prod consumer holds Bluesky
# credentials (qbsky-mamip-secrets-prod). Both are published by the instant
# notifier, which is the only place that classifies never-before-seen actions.
# ──────────────────────────────────────────────
# SSM: Telegram bot token (not Terraform-managed)
# Create SecureString /iamtrail/telegram-bot-token in the console with the
# @BotFather token, add the bot to the channel as an administrator with "Post
# Messages", and set var.telegram_chat_id to the channel handle. Leave no
# discussion group linked, so the channel stays read-only.
# ──────────────────────────────────────────────

output "iamtrail_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for iamtrail.com (use in deploy workflow)"
  value       = aws_cloudfront_distribution.website.id
}

output "iamtrail_api_url" {
  value = "https://${local.api_domain}"
}

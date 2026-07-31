####################################
# CloudFront rate limiting (AWS WAF)
####################################

# Everything IAMTrail serves is a static file, so there is no origin to protect
# and no login to brute force. The thing worth limiting is egress: a single
# client can ask for actions.json 4.5 MB at a time, and because CloudFront only
# compresses when the caller sends Accept-Encoding, the caller is the one who
# decides whether that request costs 256 KB or 4.5 MB.
#
# A CloudFront-scoped web ACL must live in us-east-1 no matter where the rest of
# the stack runs, which is why every resource here uses the aws.us_east_1 alias
# already declared for the ACM certificate.

resource "aws_wafv2_web_acl" "website" {
  provider    = aws.us_east_1
  name        = "iamtrail-website"
  description = "Per-IP rate limits for the IAMTrail website and public JSON API"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # API consumers are scripts, so they get a machine-readable body they can
  # branch on rather than an HTML page they would have to guess at.
  custom_response_body {
    key          = "rate_limited_json"
    content_type = "APPLICATION_JSON"
    content = jsonencode({
      error   = "rate_limited"
      message = "Too many requests from this IP. The public API allows ${var.waf_bulk_json_rate_limit} requests per 5 minutes. Send Accept-Encoding: gzip (curl --compressed) to cut most payloads by about 17x, or mirror the files if you need more."
      docs    = "https://iamtrail.com/api/"
    })
  }

  custom_response_body {
    key          = "rate_limited_html"
    content_type = "TEXT_HTML"
    content      = "<!doctype html><meta charset=utf-8><title>Too many requests - IAMTrail</title><h1>429 Too many requests</h1><p>You are requesting pages faster than this site serves them. Try again in a few minutes.</p><p>If you are automating, use the <a href=\"https://iamtrail.com/api/\">JSON API</a> instead of scraping pages.</p>"
  }

  # Bulk JSON, where one client can spend real money. This covers /data/ as well
  # as /api/, because the two serve byte-identical payloads: limiting only /api/
  # would be sidestepped by asking for /data/action-index.json instead.
  rule {
    name     = "bulk-json-rate-limit"
    priority = 0

    action {
      dynamic "block" {
        for_each = var.waf_rate_limit_action == "block" ? [1] : []
        content {
          custom_response {
            response_code            = 429
            custom_response_body_key = "rate_limited_json"
          }
        }
      }
      dynamic "count" {
        for_each = var.waf_rate_limit_action == "count" ? [1] : []
        content {}
      }
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_bulk_json_rate_limit
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300

        scope_down_statement {
          or_statement {
            statement {
              byte_match_statement {
                search_string         = "/api/"
                positional_constraint = "STARTS_WITH"

                field_to_match {
                  uri_path {}
                }

                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
                }
              }
            }

            statement {
              byte_match_statement {
                search_string         = "/data/"
                positional_constraint = "STARTS_WITH"

                field_to_match {
                  uri_path {}
                }

                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "iamtrail-bulk-json-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Catch-all for everything else. Deliberately loose: it exists to stop one host
  # hammering the site, not to police browsing. It also covers path fuzzing,
  # which is unusually expensive here because the distribution rewrites 403 and
  # 404 into a 200 carrying the full 220 KB index.html.
  rule {
    name     = "site-wide-rate-limit"
    priority = 1

    action {
      dynamic "block" {
        for_each = var.waf_rate_limit_action == "block" ? [1] : []
        content {
          custom_response {
            response_code            = 429
            custom_response_body_key = "rate_limited_html"
          }
        }
      }
      dynamic "count" {
        for_each = var.waf_rate_limit_action == "count" ? [1] : []
        content {}
      }
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_site_rate_limit
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "iamtrail-site-wide-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "iamtrail-website"
    sampled_requests_enabled   = true
  }
}

# Fires while a limit is actively blocking, which is both the abuse signal and
# the tuning signal: if this alarms on a day with no incident, the limit is too
# low for real traffic rather than too high for an attacker.
resource "aws_cloudwatch_metric_alarm" "waf_rate_limit_blocking" {
  provider            = aws.us_east_1
  alarm_name          = "iamtrail-waf-rate-limit-blocking"
  alarm_description   = "A per-IP rate limit is blocking requests to iamtrail.com. Either someone is hammering the site or the limit is too low."
  namespace           = "AWS/WAFV2"
  metric_name         = "BlockedRequests"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.waf_blocked_request_alarm_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.website.name
    Region = "CloudFront"
    Rule   = "ALL"
  }
}

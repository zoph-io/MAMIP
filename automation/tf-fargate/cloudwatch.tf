resource "aws_cloudwatch_event_rule" "cw_run_task" {
  name                = "${var.project}_run_task_${var.env}"
  description         = "Run ${var.project} on ${var.schedule}"
  schedule_expression = var.schedule
}

resource "aws_cloudwatch_event_target" "cw_event_target" {
  target_id = "${var.project}_event_target_${var.env}"
  arn       = aws_ecs_cluster.ecs_cluster.arn
  rule      = aws_cloudwatch_event_rule.cw_run_task.name
  role_arn  = var.ecs_event_role

  ecs_target {
    launch_type         = "FARGATE"
    platform_version    = "LATEST"
    propagate_tags      = "TASK_DEFINITION"
    task_definition_arn = aws_ecs_task_definition.mamip_td.arn
    tags                = var.tags

    network_configuration {
      subnets          = var.subnets
      security_groups  = var.security_groups
      assign_public_ip = var.assign_public_ip
    }
  }
}

# SNS Topic for ECS task failure notifications
resource "aws_sns_topic" "ecs_task_failure" {
  name = "${var.project}_ecs_task_failure_${var.env}"
}

# SNS Topic subscription (email)
resource "aws_sns_topic_subscription" "ecs_task_failure_email" {
  count     = var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.ecs_task_failure.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# CloudWatch Event Rule to capture ECS task state changes
resource "aws_cloudwatch_event_rule" "ecs_task_state_change" {
  name        = "${var.project}_ecs_task_state_change_${var.env}"
  description = "Capture ECS task state changes for ${var.project}"

  event_pattern = jsonencode({
    source      = ["aws.ecs"]
    detail-type = ["ECS Task State Change"]
    detail = {
      clusterArn = [aws_ecs_cluster.ecs_cluster.arn]
      lastStatus = ["STOPPED"]
      stopCode   = ["TaskFailedToStart", "EssentialContainerExited"]
    }
  })
}

# CloudWatch Event Target to send task failures to SNS
resource "aws_cloudwatch_event_target" "ecs_task_failure_target" {
  rule      = aws_cloudwatch_event_rule.ecs_task_state_change.name
  target_id = "${var.project}_ecs_task_failure_target_${var.env}"
  arn       = aws_sns_topic.ecs_task_failure.arn

  input_transformer {
    input_paths = {
      taskArn       = "$.detail.taskArn"
      lastStatus    = "$.detail.lastStatus"
      stoppedReason = "$.detail.stoppedReason"
      clusterArn    = "$.detail.clusterArn"
      containers    = "$.detail.containers"
    }
    input_template = <<EOF
{
  "Subject": "🚨 MAMIP ECS Task Failed",
  "Message": "ECS Task failed in cluster <clusterArn>.\nTask ARN: <taskArn>\nStatus: <lastStatus>\nReason: <stoppedReason>\nContainers: <containers>"
}
EOF
  }
}

# CloudWatch Alarm for task failures
resource "aws_cloudwatch_metric_alarm" "ecs_task_failure_alarm" {
  alarm_name          = "${var.project}_ecs_task_failure_${var.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "TaskCount"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors ECS task failures for ${var.project}"
  alarm_actions       = [aws_sns_topic.ecs_task_failure.arn]

  dimensions = {
    ServiceName = aws_ecs_cluster.ecs_cluster.name
    ClusterName = aws_ecs_cluster.ecs_cluster.name
  }

  treat_missing_data = "notBreaching"
}
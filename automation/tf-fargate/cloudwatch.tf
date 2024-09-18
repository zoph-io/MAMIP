resource "aws_cloudwatch_event_rule" "cw_run_task" {
  name                = "${var.project}_run_task_${var.env}"
  description         = "Run ${var.project} on ${var.schedule}"
  schedule_expression = var.schedule
  state               = (var.env == "dev" ? "DISABLED" : "ENABLED")
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
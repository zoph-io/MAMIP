resource "aws_ecs_cluster" "ecs_cluster" {
  name               = "${var.project}_ecs_cluster_${var.env}"
  capacity_providers = ["FARGATE_SPOT"]

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = "100"
  }

  tags = var.tags
}

data "template_file" "mamip_task" {
  template = file("./tasks/task_definition.json")

  vars = {
    container_image = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/mamip-ecr-${var.env}:latest"
    project         = var.project
    aws_region      = var.aws_region
    env             = var.env
  }
}

resource "aws_ecs_task_definition" "mamip_td" {
  family                   = "${var.project}_task_definition_${var.env}"
  container_definitions     = data.template_file.mamip_task.rendered
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu_units
  memory                   = var.ecs_memory
  execution_role_arn       = var.ecs_taskexec_role
  task_role_arn            = aws_iam_role.ecs_role.arn
  

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "log_group" {
  name              = "/ecs/${var.project}-${var.env}"
  retention_in_days = var.log_group_retention

  tags = var.tags
}

# To retrieve info about current account / userid
data "aws_caller_identity" "current" {}
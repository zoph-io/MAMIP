resource "aws_ecs_cluster" "ecs_cluster" {
  name = "${var.project}_ecs_cluster_${var.env}"
}

resource "aws_ecs_cluster_capacity_providers" "cluster_capacity" {
  cluster_name = aws_ecs_cluster.ecs_cluster.name

  capacity_providers = ["FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE_SPOT"
  }
}

data "template_file" "mamip_task" {
  template = file("./tasks/container_definition.json.tpl")

  vars = {
    container_image = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/mamip-ecr-${var.env}:latest"
    project         = var.project
    aws_region      = var.aws_region
    env             = var.env
  }
}

resource "aws_ecs_task_definition" "mamip_td" {
  family                   = "${var.project}_task_definition_${var.env}"
  container_definitions    = data.template_file.mamip_task.rendered
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu_units
  memory                   = var.ecs_memory
  execution_role_arn       = var.ecs_taskexec_role
  task_role_arn            = aws_iam_role.ecs_role.arn

  runtime_platform {
    cpu_architecture = "ARM64"
    operating_system_family = "LINUX"
  }


  tags = var.tags
}

resource "aws_cloudwatch_log_group" "log_group" {
  name              = "/ecs/${var.project}-${var.env}"
  retention_in_days = var.log_group_retention

  tags = var.tags
}

# To retrieve info about current account / userid
data "aws_caller_identity" "current" {}
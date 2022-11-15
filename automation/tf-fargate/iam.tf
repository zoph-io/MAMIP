
resource "aws_iam_role" "ecs_role" {
  name               = "${var.project}_ecs_role_${var.env}"
  assume_role_policy = data.aws_iam_policy_document.ecs_service_assume_role_policy.json
}

data "aws_iam_policy_document" "ecs_service_policy" {
  statement {
    effect = "Allow"
    resources = [
      "arn:aws:s3:::mamip-artifacts/*"
    ]
    actions = [
      "s3:PutObject",
      "s3:GetObject"
    ]
  }
  statement {
    effect    = "Allow"
    resources = ["*"]
    actions = [
      "iam:ListPolicies",
      "iam:GetPolicyVersion"
    ]
  }
  statement {
    effect    = "Allow"
    resources = ["*"]
    actions = [
      "access-analyzer:ValidatePolicy"
    ]
  }
  statement {
    effect    = "Allow"
    resources = [
      "arn:aws:sqs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${var.qtweeter_sqs_name}.fifo",
      "arn:aws:sqs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:qmasto-development-sqs-queue.fifo"
      ]
    actions = [
      "sqs:SendMessage"
    ]
  }
}

data "aws_iam_policy_document" "ecs_service_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

/* ecs service scheduler role */
resource "aws_iam_role_policy" "ecs_service_role_policy" {
  name   = "${var.project}_ecs_service_role_policy_${var.env}"
  policy = data.aws_iam_policy_document.ecs_service_policy.json
  role   = aws_iam_role.ecs_role.id
}

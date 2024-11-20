variable "aws_region" {
  default     = "eu-west-1"
  description = "AWS Region"
}

variable "env" {
  default     = "dev"
  description = "Environment"
}

variable "tags" {
  type = map(string)
  default = {
    Service-Owner = "Victor GRENU"
  }
}

variable "project" {
  default     = "mamip"
  description = "Project Name"
}

variable "description" {
  default     = "Monitor AWS Managed IAM Policies Changes"
  description = "Project Description"
}

variable "qtweeter_sqs_name" {
  default = "qtweet-mamip-sqs-queue"
}

variable "qbsky_sqs_name" {
  default = "qbsky-mamip-prod-sqs-queue"
}

variable "qmasto_sqs_name" {
  default = "qmasto-development-sqs-queue"
}

variable "log_group_retention" {
  default = "90"
}

variable "artifacts_bucket" {
  default     = "no-artifact-bucket-defined"
  description = "Artifacts Bucket Name"
}

variable "ecs_event_role" {
  default     = "arn:aws:iam::567589703415:role/ecsEventsRole"
  description = "IAM Role used for CloudWatch"
}

variable "ecs_taskexec_role" {
  default     = "arn:aws:iam::567589703415:role/ecsTaskExecutionRole"
  description = "IAM Role used for Task Execution"
}

variable "subnets" {
  type        = list(string)
  default     = ["subnet-0877cf6c", "subnet-b3e648c5", "subnet-40738a18"]
  description = "Subnets used for Fargate Containers"
}

variable "security_groups" {
  type        = list(string)
  default     = ["sg-0f669a11a7a45c8dd"]
  description = "Security Groups used for Fargate"
}

variable "schedule" {
  default     = "cron(0 */2 ? * MON-FRI *)"
  #default     = "cron(0 * ? * * *)"
  description = "Schedule for your job"
}

variable "assign_public_ip" {
  default     = "true"
  description = "Set public IP on Fargate Container"
}

variable "ecs_cpu_units" {
  default     = "2048"
  description = "Container: Number of CPU Units"
}

variable "ecs_memory" {
  default     = "8192"
  description = "Container: Memory Units"
}

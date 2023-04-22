provider "aws" {
  region  = var.aws_region
  version = "4.64.0"
  default_tags {
    tags = {
      aws_region    = "eu-west-1"
      Project       = "mamip"
      Terraform     = "true"
      Service-Owner = "Victor GRENU"
    }
  }
}

terraform {
  backend "s3" {
    region = "eu-west-1"
  }
}
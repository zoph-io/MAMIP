provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      aws_region    = "eu-west-1"
      Project       = "mamip"
      Terraform     = "true"
    }
  }
}

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "4.64.0"
    }
  }

  backend "s3" {
    region = "eu-west-1"
  }
}
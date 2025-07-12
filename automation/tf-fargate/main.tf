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
      version = "~> 5.0"
    }
  }

  backend "s3" {
    region = "eu-west-1"
  }
}
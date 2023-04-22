provider "aws" {
  region  = var.aws_region
  version = "4.64.0"
}

terraform {
  backend "s3" {
    region = "eu-west-1"
  }
}
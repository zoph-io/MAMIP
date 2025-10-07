.DEFAULT_GOAL := help

help:
	@echo "${PROJECT}"
	@echo "${DESCRIPTION}"
	@echo ""
	@echo "Docker & Infrastructure:"
	@echo "	build-docker - build docker image"
	@echo "	init - init IaC using Terraform"
	@echo "	validate - validate the IaC using Terraform"
	@echo "	plan - plan (dryrun) IaC using Terraform"
	@echo "	apply - deploy the IaC using Terraform"
	@echo "	destroy - delete all previously created infrastructure using Terraform"
	@echo "	update-runbook - update the runbook script on S3 artifacts bucket"
	@echo ""
	@echo "Website:"
	@echo "	website-install - install website dependencies"
	@echo "	website-dev - run website development server"
	@echo "	website-generate-data - generate policy data for website"
	@echo "	website-build - build static website for production"
	@echo "	website-deploy - build + deploy to S3 and CloudFront (mamip.zoph.io)"
	@echo "	website-sync - sync existing build to S3 (no rebuild)"
	@echo "	website-clean - clean website build artifacts"
	@echo ""
	@echo "Utilities:"
	@echo "	clean - clean all build folders"
	@echo "	longest - show 10 longest policy names"
	@echo "	shortest - show 10 shortest policy names"

################ Project #######################
PROJECT ?= mamip
DESCRIPTION ?= Monitor AWS Managed IAM Policies Changes
################################################

################ Config ########################
S3_BUCKET ?= zoph-lab-terraform-tfstate
ARTIFACTS_BUCKET ?= mamip-artifacts
AWS_REGION ?= eu-west-1
NOTIFICATION_EMAIL ?= "victor+mamip@zoph.io"
ENV ?= prod
ECR ?= 567589703415.dkr.ecr.eu-west-1.amazonaws.com/mamip-ecr-$(ENV)
################################################

# Automation is done by Github Actions
login:
	@aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR)

build-docker: login
	@docker buildx build --platform=linux/arm64 -t mamip-image ./automation/
	@docker tag mamip-image $(ECR)
	@docker push $(ECR)

################ Terraform #####################
init:
	@terraform init \
		-backend-config="bucket=$(S3_BUCKET)" \
		-backend-config="key=$(PROJECT)/terraform.tfstate" \
		./automation/tf-fargate/

validate:
	@terraform validate ./automation/tf-fargate/

plan:
	@terraform plan \
		-var="env=$(ENV)" \
		-var="project=$(PROJECT)" \
		-var="description=$(DESCRIPTION)" \
		-var="aws_region=$(AWS_REGION)" \
		-var="artifacts_bucket=$(S3_BUCKET)" \
		./automation/tf-fargate/

apply:
	@terraform apply \
		-var="env=$(ENV)" \
		-var="project=$(PROJECT)" \
		-var="description=$(DESCRIPTION)" \
		-var="notification_email=$(NOTIFICATION_EMAIL)" \
		-compact-warnings ./automation/tf-fargate/

longest:
	@find ./policies -type f | awk -F/ '{print length($$NF), $$NF}' | sort -nr | head -10

shortest:
	@find ./policies  -type f | awk -F/ '{print length($$NF), $$NF}' | sort -n | head -10

destroy:
	@read -p "Are you sure that you want to destroy: '$(PROJECT)-$(ENV)-$(AWS_REGION)'? [yes/N]: " sure && [ $${sure:-N} = 'yes' ]
	@terraform destroy ./automation/tf-fargate/

update-runbook:
	@echo "Copying runbook scripts in artifacts s3 bucket"
	@aws s3 cp automation/runbook-$(ENV).sh 's3://${ARTIFACTS_BUCKET}/$(ENV)/runbook.sh'

################ Website #######################
website-install:
	@echo "📦 Installing website dependencies..."
	@cd website && npm install

website-dev: website-generate-data
	@echo "🚀 Starting development server..."
	@cd website && npm run dev

website-generate-data:
	@echo "📊 Generating policy data..."
	@cd website && npm run generate-data

website-build: website-generate-data
	@echo "🏗️  Building static website..."
	@cd website && NEXT_PUBLIC_USE_BASE_PATH=false npm run build

website-deploy: website-build
	@echo "☁️  Deploying to S3 and CloudFront..."
	@echo "📦 Syncing to s3://mamip.zoph.io..."
	@aws s3 sync website/out/ s3://mamip.zoph.io/ \
		--delete \
		--cache-control "public, max-age=31536000, immutable" \
		--exclude "*.html" --exclude "*.json" --exclude "*.txt" --exclude "*.xml"
	@aws s3 sync website/out/ s3://mamip.zoph.io/ \
		--cache-control "public, max-age=0, must-revalidate" \
		--exclude "*" --include "*.html" --include "*.json" --include "*.txt" --include "*.xml"
	@echo "🔄 Creating CloudFront invalidation..."
	@aws cloudfront create-invalidation --distribution-id E9B7QP8QWPHLW --paths "/*"
	@echo "✅ Deployed to https://mamip.zoph.io"

website-sync:
	@echo "☁️  Syncing to S3 and CloudFront (no rebuild)..."
	@if [ ! -d "website/out" ]; then \
		echo "❌ Error: website/out directory not found. Run 'make website-build' first."; \
		exit 1; \
	fi
	@echo "📦 Syncing to s3://mamip.zoph.io..."
	@aws s3 sync website/out/ s3://mamip.zoph.io/ \
		--delete \
		--cache-control "public, max-age=31536000, immutable" \
		--exclude "*.html" --exclude "*.json" --exclude "*.txt" --exclude "*.xml"
	@aws s3 sync website/out/ s3://mamip.zoph.io/ \
		--cache-control "public, max-age=0, must-revalidate" \
		--exclude "*" --include "*.html" --include "*.json" --include "*.txt" --include "*.xml"
	@echo "🔄 Creating CloudFront invalidation..."
	@aws cloudfront create-invalidation --distribution-id E9B7QP8QWPHLW --paths "/*"
	@echo "✅ Deployed to https://mamip.zoph.io"

website-clean:
	@echo "🧹 Cleaning website build artifacts..."
	@rm -fr website/.next/
	@rm -fr website/out/
	@rm -fr website/node_modules/
	@rm -fr website/public/data/*.json
	@find website -name '.DS_Store' -exec rm -fr {} +
################################################

clean: website-clean
	@echo "🧹 Cleaning all build artifacts..."
	@rm -fr build/
	@rm -fr automation/build/
	@rm -fr dist/
	@rm -fr htmlcov/
	@rm -fr site/
	@rm -fr .eggs/
	@rm -fr .tox/
	@rm -fr *.tfstate
	@rm -fr *.tfplan
	@find . -name '*.egg-info' -exec rm -fr {} +
	@find . -name '.DS_Store' -exec rm -fr {} +
	@find . -name '*.egg' -exec rm -f {} +
	@find . -name '*.pyc' -exec rm -f {} +
	@find . -name '*.pyo' -exec rm -f {} +
	@find . -name '*~' -exec rm -f {} +
	@find . -name '__pycache__' -exec rm -fr {} +

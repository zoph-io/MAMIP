.DEFAULT_GOAL := help

help:
	@echo "${PROJECT}"
	@echo "${DESCRIPTION}"
	@echo ""
	@echo "Docker & Infrastructure:"
	@echo "	build-docker - build and push docker image to ECR"
	@echo "	run-task - manually trigger the ECS Fargate task"
	@echo "	deploy-runbook - update runbook on S3 and trigger ECS task"
	@echo "	init - init IaC using Terraform"
	@echo "	validate - validate the IaC using Terraform"
	@echo "	plan - plan (dryrun) IaC using Terraform"
	@echo "	apply - deploy the IaC using Terraform"
	@echo "	destroy - delete all previously created infrastructure using Terraform"
	@echo "	update-runbook - update the runbook script on S3 artifacts bucket"
	@echo "	deploy-cf-function - deploy CloudFront URL rewrite function (CloudFormation)"
	@echo "	delete-cf-function - delete CloudFront URL rewrite function stack"
	@echo ""
	@echo "Subscriptions Infrastructure (local deploy, no git push):"
	@echo "	infra-plan - plan subscription infra only (DNS, SES, API GW, Lambdas, DynamoDB)"
	@echo "	infra-apply - deploy subscription infra only"
	@echo "	infra-plan-all - plan all infrastructure (ECS + subscriptions)"
	@echo "	infra-apply-all - deploy all infrastructure"
	@echo ""
	@echo "Website:"
	@echo "	website-install - install website dependencies"
	@echo "	website-dev - run website development server (with data generation)"
	@echo "	website-dev-fast - run website development server (skip data generation)"
	@echo "	website-generate-data - generate policy data for website"
	@echo "	website-build - build static website for production"
	@echo "	website-build-fast - build static website (skip data generation)"
	@echo "	website-deploy - build + deploy to S3 and CloudFront (iamtrail.com)"
	@echo "	website-deploy-fast - deploy without regenerating data (UI-only changes)"
	@echo "	website-sync - sync existing build to S3 (no rebuild)"
	@echo "	website-clean - clean website build artifacts"
	@echo ""
	@echo "Data:"
	@echo "	action-registry - rebuild data/action-registry.json and data/policy-change-deltas.json from git history"
	@echo "	iam-metadata - refresh data/iam-metadata.json from iam-dataset (access levels, service names)"
	@echo ""
	@echo "Utilities:"
	@echo "	clean - clean all build folders"
	@echo "	longest - show 10 longest policy names"
	@echo "	shortest - show 10 shortest policy names"

################ Project #######################
PROJECT ?= mamip
DESCRIPTION ?= IAMTrail - Monitor AWS Managed IAM Policies Changes
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

ECS_CLUSTER ?= $(PROJECT)_ecs_cluster_$(ENV)
ECS_TASK_DEF ?= $(PROJECT)_task_definition_$(ENV)
SUBNETS ?= subnet-0877cf6c,subnet-b3e648c5,subnet-40738a18
SECURITY_GROUP ?= sg-0f669a11a7a45c8dd

run-task:
	@echo "Triggering ECS Fargate task manually..."
	@aws ecs run-task \
		--cluster $(ECS_CLUSTER) \
		--task-definition $(ECS_TASK_DEF) \
		--launch-type FARGATE \
		--platform-version LATEST \
		--network-configuration "awsvpcConfiguration={subnets=[$(SUBNETS)],securityGroups=[$(SECURITY_GROUP)],assignPublicIp=ENABLED}" \
		--region $(AWS_REGION) \
		--query 'tasks[0].taskArn' \
		--output text
	@echo "Task started. Check logs at: /ecs/$(PROJECT)-$(ENV)"

################ Terraform #####################
init:
	@terraform -chdir=./automation/tf-fargate/ init \
		-backend-config="bucket=$(S3_BUCKET)" \
		-backend-config="key=$(PROJECT)/terraform.tfstate"

validate:
	@terraform -chdir=./automation/tf-fargate/ validate

plan:
	@terraform -chdir=./automation/tf-fargate/ plan \
		-var="env=$(ENV)" \
		-var="project=$(PROJECT)" \
		-var="description=$(DESCRIPTION)" \
		-var="aws_region=$(AWS_REGION)" \
		-var="artifacts_bucket=$(S3_BUCKET)"

apply:
	@terraform -chdir=./automation/tf-fargate/ apply \
		-var="env=$(ENV)" \
		-var="project=$(PROJECT)" \
		-var="description=$(DESCRIPTION)" \
		-var="notification_email=$(NOTIFICATION_EMAIL)" \
		-compact-warnings

################ Subscriptions Infrastructure ###
# Deploy subscription infra locally without pushing to master.
# Uses -target to scope to subscription resources only.

SUBSCRIPTION_TARGETS = \
	-target=aws_route53_zone.iamtrail \
	-target=aws_acm_certificate.iamtrail \
	-target=aws_acm_certificate.api \
	-target=aws_acm_certificate_validation.iamtrail \
	-target=aws_acm_certificate_validation.api \
	-target=aws_s3_bucket.website \
	-target=aws_s3_bucket_public_access_block.website \
	-target=aws_s3_bucket_policy.website \
	-target=aws_cloudfront_origin_access_identity.website \
	-target=aws_cloudfront_distribution.website \
	-target=aws_cloudfront_function.redirect_mamip \
	-target=aws_ses_domain_identity.iamtrail \
	-target=aws_ses_domain_dkim.iamtrail \
	-target=aws_ses_domain_mail_from.iamtrail \
	-target=aws_dynamodb_table.subscriptions \
	-target=aws_dynamodb_table.policy_changes \
	-target=aws_dynamodb_table.action_registry \
	-target=aws_sqs_queue.changes \
	-target=aws_sqs_queue_policy.changes \
	-target=aws_sns_topic_subscription.changes \
	-target=aws_lambda_function.subscription_api \
	-target=aws_lambda_function.change_recorder \
	-target=aws_lambda_function.digest_sender \
	-target=aws_lambda_function.instant_notifier \
	-target=aws_apigatewayv2_api.subscriptions \
	-target=aws_apigatewayv2_stage.default \
	-target=aws_apigatewayv2_domain_name.api \
	-target=aws_apigatewayv2_api_mapping.api \
	-target=aws_iam_role.subscription_api \
	-target=aws_iam_role.change_recorder \
	-target=aws_iam_role.digest_sender \
	-target=aws_cloudwatch_event_rule.daily_digest

infra-plan:
	@echo "📋 Planning subscription infrastructure (targeted)..."
	@terraform -chdir=./automation/tf-fargate/ plan \
		-var="env=$(ENV)" \
		-var="project=$(PROJECT)" \
		-var="description=$(DESCRIPTION)" \
		-var="aws_region=$(AWS_REGION)" \
		-var="artifacts_bucket=$(S3_BUCKET)" \
		$(SUBSCRIPTION_TARGETS)

infra-apply:
	@echo "🚀 Deploying subscription infrastructure (targeted)..."
	@terraform -chdir=./automation/tf-fargate/ apply \
		-var="env=$(ENV)" \
		-var="project=$(PROJECT)" \
		-var="description=$(DESCRIPTION)" \
		-var="notification_email=$(NOTIFICATION_EMAIL)" \
		-compact-warnings \
		$(SUBSCRIPTION_TARGETS)

infra-plan-all:
	@echo "📋 Planning all infrastructure..."
	@terraform -chdir=./automation/tf-fargate/ plan \
		-var="env=$(ENV)" \
		-var="project=$(PROJECT)" \
		-var="description=$(DESCRIPTION)" \
		-var="aws_region=$(AWS_REGION)" \
		-var="artifacts_bucket=$(S3_BUCKET)"

infra-apply-all:
	@echo "🚀 Deploying all infrastructure..."
	@terraform -chdir=./automation/tf-fargate/ apply \
		-var="env=$(ENV)" \
		-var="project=$(PROJECT)" \
		-var="description=$(DESCRIPTION)" \
		-var="notification_email=$(NOTIFICATION_EMAIL)" \
		-compact-warnings
####################################################

################ Data ##########################
action-registry:
	@echo "🔁 Replaying the archive into the action registry and change deltas..."
	@python3 automation/scripts/build_action_registry.py

# Not run in CI on purpose: the Service Authorization Reference moves slowly, and
# committing the refresh keeps the deploy from having to push to master.
iam-metadata:
	@echo "📚 Refreshing IAM metadata from iam-dataset..."
	@python3 automation/scripts/build_iam_metadata.py
####################################################

longest:
	@find ./policies -type f | awk -F/ '{print length($$NF), $$NF}' | sort -nr | head -10

shortest:
	@find ./policies  -type f | awk -F/ '{print length($$NF), $$NF}' | sort -n | head -10

destroy:
	@read -p "Are you sure that you want to destroy: '$(PROJECT)-$(ENV)-$(AWS_REGION)'? [yes/N]: " sure && [ $${sure:-N} = 'yes' ]
	@terraform -chdir=./automation/tf-fargate/ destroy

update-runbook:
	@echo "Copying runbook scripts in artifacts s3 bucket"
	@aws s3 cp automation/runbook-$(ENV).sh 's3://${ARTIFACTS_BUCKET}/$(ENV)/runbook.sh'

deploy-runbook: update-runbook run-task

################ CloudFront Function ###########
CF_STACK_NAME ?= mamip-cloudfront-url-rewrite
CF_DISTRIBUTION_ID ?= E2R2N8OZK7U78U

deploy-cf-function:
	@echo "☁️  Deploying CloudFront URL rewrite function..."
	@aws cloudformation deploy \
		--template-file automation/cloudfront-function.yaml \
		--stack-name $(CF_STACK_NAME) \
		--parameter-overrides CloudFrontDistributionId=$(CF_DISTRIBUTION_ID) \
		--region us-east-1 \
		--no-fail-on-empty-changeset
	@echo "✅ CloudFront Function deployed"
	@echo "⚠️  Remember to associate the function with your distribution's viewer-request event"
	@echo "   Function ARN:"
	@aws cloudformation describe-stacks \
		--stack-name $(CF_STACK_NAME) \
		--region us-east-1 \
		--query 'Stacks[0].Outputs[?OutputKey==`FunctionArn`].OutputValue' \
		--output text

delete-cf-function:
	@echo "🗑️  Deleting CloudFront URL rewrite function stack..."
	@aws cloudformation delete-stack \
		--stack-name $(CF_STACK_NAME) \
		--region us-east-1
	@aws cloudformation wait stack-delete-complete \
		--stack-name $(CF_STACK_NAME) \
		--region us-east-1
	@echo "✅ Stack deleted"

################ Website #######################
website-install:
	@echo "📦 Installing website dependencies..."
	@cd website && npm install

website-dev: website-generate-data
	@echo "🚀 Starting development server..."
	@cd website && npm run dev

website-dev-fast:
	@echo "🚀 Starting development server (skip data generation)..."
	@cd website && npm run dev

website-generate-data:
	@echo "📊 Generating policy data..."
	@cd website && npm run generate-data

website-build: website-generate-data
	@echo "🖼️  Generating OG images (incremental)..."
	@cd website && npm run generate-og
	@echo "🏗️  Building static website..."
	@cd website && npm run build

website-build-fast:
	@echo "🏗️  Building static website (skip data generation)..."
	@if [ ! -d "website/public/data" ] || [ -z "$$(ls -A website/public/data/*.json 2>/dev/null)" ]; then \
		echo "⚠️  No data found in website/public/data/. Running generate-data first..."; \
		cd website && npm run generate-data; \
	fi
	@cd website && npm run generate-og
	@cd website && npm run build

website-deploy: website-build
	@echo "☁️  Deploying to S3 and CloudFront (content-diff, changed files only)..."
	@cd website && node scripts/deploy-s3.mjs --bucket iamtrail.com
	@echo "🔄 Creating CloudFront invalidation..."
	@aws cloudfront create-invalidation --distribution-id E2R2N8OZK7U78U --paths "/*"
	@echo "✅ Deployed to https://iamtrail.com"

website-deploy-fast: website-build-fast
	@echo "☁️  Deploying to S3 and CloudFront (no data regeneration)..."
	@cd website && node scripts/deploy-s3.mjs --bucket iamtrail.com
	@echo "🔄 Creating CloudFront invalidation..."
	@aws cloudfront create-invalidation --distribution-id E2R2N8OZK7U78U --paths "/*"
	@echo "✅ Deployed to https://iamtrail.com"

website-sync:
	@echo "☁️  Syncing to S3 and CloudFront (no rebuild)..."
	@if [ ! -d "website/out" ]; then \
		echo "❌ Error: website/out directory not found. Run 'make website-build' first."; \
		exit 1; \
	fi
	@cd website && node scripts/deploy-s3.mjs --bucket iamtrail.com
	@echo "🔄 Creating CloudFront invalidation..."
	@aws cloudfront create-invalidation --distribution-id E2R2N8OZK7U78U --paths "/*"
	@echo "✅ Deployed to https://iamtrail.com"

website-clean:
	@echo "🧹 Cleaning website build artifacts..."
	@rm -fr website/.next/
	@rm -fr website/out/
	@rm -fr website/node_modules/
	@rm -fr website/public/data/*.json
	@rm -fr website/public/policies/
	@rm -f website/.og-manifest.json
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

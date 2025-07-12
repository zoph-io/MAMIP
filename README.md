# 🔊 MAMIP - Monitor AWS Managed IAM Policies

[![[Prod] MAMIP - GitHub Actions](https://github.com/z0ph/MAMIP/actions/workflows/main.yml/badge.svg?branch=master)](https://github.com/z0ph/MAMIP/actions/workflows/main.yml)

MAMIP is a comprehensive monitoring tool that tracks changes in AWS Managed IAM Policies and provides automated notifications through multiple channels. Built with a serverless architecture using ECS Fargate and Terraform, it ensures continuous monitoring of AWS policy updates with real-time validation using AWS Access Analyzer.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Policy Validation](#-policy-validation)
- [Data Storage](#-data-storage)
- [Contributing](#-contributing)
- [Credits](#-credits)
- [License](#-license)

## 🔍 Features

### Core Functionality

- **Automated Policy Monitoring**: Continuously tracks all AWS Managed IAM Policies
- **Change Detection**: Identifies new, updated, and deprecated policies
- **Policy Validation**: Validates policies using AWS Access Analyzer with detailed findings
- **Multi-Channel Notifications**: Sends alerts via social media, SNS, and GitHub
- **Deprecation Tracking**: Maintains historical records of deprecated policies
- **Individual Commit History**: Each policy change gets its own commit with version tracking

### Technical Features

- **Serverless Architecture**: ECS Fargate with Spot instances for cost optimization
- **Infrastructure as Code**: Complete Terraform configuration for reproducible deployments
- **Container-Based**: Docker containerization for consistent execution environments
- **GitHub Integration**: Secure token-based authentication via AWS Secrets Manager
- **Automated CI/CD**: GitHub Actions for continuous integration and deployment

## 🏗 Architecture

![Schema ECS Fargate](assets/schema.drawio.svg)

### System Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   GitHub Actions │────│   ECS Fargate    │────│   AWS Services  │
│   - Scheduled    │    │   - Container    │    │   - IAM APIs    │
│   - Manual       │    │   - Python App   │    │   - Access Analyzer │
└─────────────────┘    └──────────────────┘    │   - Secrets Mgr │
                                               │   - SNS/SQS     │
                                               └─────────────────┘
            │                       │                       │
            ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Data Storage  │    │   Notifications  │    │   Monitoring    │
│   - policies/   │    │   - Social Media │    │   - CloudWatch  │
│   - findings/   │    │   - Email/SNS    │    │   - Logs        │
│   - DEPRECATED  │    │   - GitHub       │    │   - Metrics     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Data Flow

1. **Policy Fetching**: Script retrieves current AWS Managed Policies
2. **Change Detection**: Compares with local repository to identify changes
3. **Validation**: New/updated policies validated using AWS Access Analyzer
4. **Storage**: Policy documents stored in `policies/`, findings in `findings/`
5. **Versioning**: Individual commits created for each policy change
6. **Notification**: Alerts sent through configured channels
7. **Cleanup**: Deprecated policies moved to tracking list

## 🖐 Usage

### Notification Channels

Choose from multiple ways to receive policy change notifications:

#### 1. Social Media

- **Bluesky**: [@mamip.bsky.social](https://bsky.app/profile/mamip.bsky.social)
- **Twitter/𝕏**: [@mamip_aws](https://x.com/mamip_aws)

#### 2. GitHub Notifications

- Enable "Releases Only" notifications on this repository
- Subscribe to commit RSS feed: [GitHub RSS Feed](https://github.com/z0ph/MAMIP/commits/master.atom)

#### 3. AWS SNS Topic

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-1:567589703415:mamip-sns-topic \
  --protocol email \
  --notification-endpoint your-email@example.com
```

#### 4. Direct Repository Monitoring

- Watch this repository for commit notifications
- Monitor the `policies/` directory for changes

### Manual Execution

For manual policy checks:

```bash
# Local execution
cd automation
python validate-batch.py

# Container execution
docker run -e AWS_REGION=eu-west-1 your-ecr/mamip:latest
```

## ✅ Policy Validation

Each AWS Managed Policy undergoes comprehensive validation using [AWS Access Analyzer Policy Validation](https://aws.amazon.com/blogs/aws/iam-access-analyzer-update-policy-validation/).

### Validation Process

1. **Syntax Validation**: Ensures proper JSON structure
2. **Security Analysis**: Identifies potential security issues
3. **Best Practice Checks**: Validates against AWS recommendations
4. **Resource Analysis**: Checks resource ARN patterns

### Validation Findings

- **Location**: All findings stored in [`findings/`](./findings/) directory
- **Format**: JSON files containing detailed validation results
- **Naming**: Corresponds to policy names for easy reference
- **Types**: Warnings, suggestions, and security findings

### Example Finding Structure

```json
{
  "findings": [
    {
      "findingType": "WARNING",
      "issueCode": "REDUNDANT_STATEMENT",
      "findingDetails": "...",
      "locations": [...]
    }
  ],
  "validatePolicyResponse": {...}
}
```

## 💾 Data Storage

### Repository Structure

```
MAMIP/
├── automation/           # Core application code
│   ├── validate-batch.py # Main validation script
│   ├── tf-fargate/      # Terraform infrastructure
│   └── runbook-*.sh     # Execution scripts
├── policies/            # Current AWS Managed Policies
├── findings/           # Policy validation results
├── DEPRECATED.json     # List of deprecated policies
└── assets/            # Documentation assets
```

### Policy Storage

- **Current Policies**: Stored in `policies/` directory
- **File Naming**: Direct policy name mapping
- **Format**: AWS IAM policy JSON documents
- **Versioning**: Git history tracks all changes

### Deprecated Policies

Policies no longer maintained by AWS are tracked in [`DEPRECATED.json`](./DEPRECATED.json):

```json
{
  "deprecated_policies": [
    {
      "policy_name": "ExampleDeprecatedPolicy",
      "deprecated_date": "2024-01-15",
      "reason": "Replaced by newer policy"
    }
  ]
}
```

## 🔒 Security

### Authentication

- **GitHub Integration**: Uses AWS Secrets Manager for secure token storage
- **AWS Permissions**: Least-privilege IAM roles for ECS tasks
- **Container Security**: Regular base image updates

### Secrets Management

- GitHub tokens stored in AWS Secrets Manager
- No hardcoded credentials in code
- Environment-specific configuration

### Permissions Required

The ECS task requires the following AWS permissions:

- `iam:ListPolicies` - Fetch policy list
- `iam:GetPolicyVersion` - Retrieve policy documents
- `access-analyzer:ValidatePolicy` - Validate policies
- `secretsmanager:GetSecretValue` - Retrieve GitHub token
- `sns:Publish` - Send notifications
- `sqs:SendMessage` - Queue social media posts
- `s3:GetObject`, `s3:PutObject` - Access artifacts

## 📊 Monitoring

### CloudWatch Integration

- Container logs automatically sent to CloudWatch
- Metrics tracking for execution success/failure
- Alerting on validation errors

### Execution Tracking

- Detailed logging throughout execution
- Error handling with automatic retries
- Performance metrics collection

## 🎖️ Credits

Special thanks to [Scott Piper](https://twitter.com/0xdabbad00) for the original concept. This project extends his idea by:

- Automating the complete monitoring process
- Adding comprehensive policy validation
- Implementing multiple notification channels
- Providing infrastructure as code
- Tracking policy deprecation lifecycle

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

---

**Maintained by**: [@z0ph](https://github.com/z0ph)  
**Latest Update**: Automatically updated every 6 hours  
**Status**: [![Build Status](https://github.com/z0ph/MAMIP/actions/workflows/main.yml/badge.svg)](https://github.com/z0ph/MAMIP/actions/workflows/main.yml)

<div align="center">

# 🔊 MAMIP

### AWS Managed Policy Changes Archive

[![Build Status](https://github.com/z0ph/MAMIP/actions/workflows/main.yml/badge.svg?branch=master)](https://github.com/z0ph/MAMIP/actions/workflows/main.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-mamip.zoph.io-brightgreen)](https://mamip.zoph.io)

Track every change to AWS Managed IAM Policies with full version history and validation.

**[🌐 Visit the Website](https://mamip.zoph.io)** • **[📊 Browse Policies](https://mamip.zoph.io/policies)** • **[ℹ️ About](https://mamip.zoph.io/about)**

</div>

---

## 🖥️ Companion Website

Explore AWS Managed IAM Policies through our modern, searchable web interface:

[![MAMIP Website](assets/compagnion-website.png)](https://mamip.zoph.io)

### **[✨ Visit mamip.zoph.io](https://mamip.zoph.io)**

**Features:**

- 🔍 **Search & Filter** - Instantly find any policy among 1,465+ managed policies
- 📈 **Track Changes** - View full version history and git diffs for every policy
- 🆕 **Spot New Features** - Discover v1 policies indicating new AWS services
- 💻 **Syntax Highlighting** - Read policy documents with color-coded JSON
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile

---

## ✨ Key Features

### 📊 Comprehensive Monitoring

- **1,465+ Policies Tracked** - All AWS Managed IAM Policies monitored continuously
- **Real-Time Updates** - Automated checks every 4 hours on weekdays
- **Version History** - Full git history for every policy change
- **Deprecation Tracking** - Historical records of 73+ deprecated policies

### 🔔 Multi-Channel Notifications

Stay informed about policy changes through your preferred channel:

- 🦋 **Bluesky**: [@mamip.bsky.social](https://bsky.app/profile/mamip.bsky.social)
- 𝕏 **X/Twitter**: [@mamip_aws](https://x.com/mamip_aws)
- 📧 **AWS SNS**: `arn:aws:sns:eu-west-1:567589703415:mamip-sns-topic`
- 🔔 **GitHub**: Watch this repository for releases

### ✅ Policy Validation

Every policy validated using [AWS Access Analyzer](https://aws.amazon.com/blogs/aws/iam-access-analyzer-update-policy-validation/):

- Security analysis and best practice checks
- Syntax validation and resource analysis
- Detailed findings stored in [`findings/`](./findings/) directory

### 🏗️ Technical Stack

- **Serverless**: ECS Fargate with Spot instances
- **Infrastructure**: Terraform (full IaC)
- **Validation**: AWS Access Analyzer
- **CI/CD**: GitHub Actions
- **Frontend**: Next.js 15 + Tailwind CSS

## 🏗️ How It Works

![Architecture](assets/schema.drawio.svg)

**Automated workflow running every 4 hours (Mon-Fri):**

1. 🔄 **Fetch** - Retrieve all AWS Managed IAM Policies via AWS CLI
2. 🔍 **Compare** - Detect new, updated, or deprecated policies
3. ✅ **Validate** - Run AWS Access Analyzer policy validation
4. 💾 **Store** - Commit changes to git with individual commits per policy
5. 📢 **Notify** - Send alerts via Bluesky, X/Twitter, SNS, and GitHub
6. 🌐 **Deploy** - Update the companion website automatically

## 🚀 Quick Start

### Subscribe to Updates

**Option 1: Social Media (Recommended)**

```bash
# Follow on Bluesky
https://bsky.app/profile/mamip.bsky.social

# Follow on X/Twitter
https://x.com/mamip_aws
```

**Option 2: AWS SNS Email Notifications**

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-1:567589703415:mamip-sns-topic \
  --protocol email \
  --notification-endpoint your-email@example.com
```

**Option 3: GitHub**

- ⭐ Star this repository and enable "Releases only" notifications
- 📡 Subscribe to [RSS feed](https://github.com/z0ph/MAMIP/commits/master.atom)

### Browse Policies

Visit **[mamip.zoph.io](https://mamip.zoph.io)** for the full searchable archive with:

- Policy search and filtering
- Full version history and git diffs
- Syntax-highlighted JSON viewer
- Brand new (v1) policy tracking

## 📂 Repository Structure

```
MAMIP/
├── policies/          # 1,465+ AWS Managed IAM Policies (JSON)
├── findings/          # Policy validation results from Access Analyzer
├── DEPRECATED.json    # Historical record of 73+ deprecated policies
├── automation/        # Python scripts & Terraform infrastructure
├── website/           # Next.js companion website source code
└── assets/            # Documentation and images
```

**Browse the data:**

- 📋 [All Policies](./policies/) - Current AWS Managed IAM Policies
- 🔍 [Validation Findings](./findings/) - Access Analyzer results
- 🗑️ [Deprecated Policies](./DEPRECATED.json) - Historical deprecation records

## 🛠️ Technical Details

### Infrastructure

- **Compute**: AWS ECS Fargate (Spot instances for cost optimization)
- **Schedule**: CloudWatch Events (every 4 hours, Mon-Fri)
- **IaC**: Terraform configuration in [`automation/tf-fargate/`](./automation/tf-fargate/)
- **Container**: Python 3.x with AWS CLI and git
- **Secrets**: AWS Secrets Manager for GitHub token storage

### Required AWS Permissions

```
iam:ListPolicies, iam:GetPolicyVersion
access-analyzer:ValidatePolicy
secretsmanager:GetSecretValue
sns:Publish, sqs:SendMessage
s3:GetObject, s3:PutObject
```

### Monitoring

- CloudWatch Logs for execution tracking
- SNS alerts on failures
- GitHub Actions status badges

## 📈 Stats

<div align="center">

| Metric                  | Count                        |
| ----------------------- | ---------------------------- |
| **Active Policies**     | 1,465                        |
| **Deprecated Policies** | 73                           |
| **Brand New (v1)**      | 20                           |
| **Most Modified**       | ReadOnlyAccess (97 versions) |

</div>

## 💡 Credits & Inspiration

This project is inspired by [Scott Piper's](https://twitter.com/0xdabbad00) original [aws_managed_policies](https://github.com/SummitRoute/aws_managed_policies) repository. MAMIP extends this concept with:

- ✅ Fully automated infrastructure and monitoring
- ✅ Comprehensive AWS Access Analyzer validation
- ✅ Multi-channel notifications (Bluesky, X, SNS, GitHub)
- ✅ Modern searchable web interface
- ✅ Complete deprecation lifecycle tracking

**Thank you, Scott, for pioneering this valuable resource!**

## 📄 License

GNU General Public License v3.0 - see [LICENSE](LICENSE) for details.

---

<div align="center">

**[🌐 Visit Website](https://mamip.zoph.io)** • **[📊 Browse Policies](https://mamip.zoph.io/policies)** • **[🦋 Follow on Bluesky](https://bsky.app/profile/mamip.bsky.social)** • **[𝕏 Follow on X](https://x.com/mamip_aws)**

Made with ❤️ by [zoph.io](https://zoph.io) — AWS Cloud Advisory Boutique

[![Build Status](https://github.com/z0ph/MAMIP/actions/workflows/main.yml/badge.svg)](https://github.com/z0ph/MAMIP/actions/workflows/main.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

_This is an unofficial archive and is not affiliated with Amazon Web Services (AWS)._

</div>

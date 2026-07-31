<div align="center">

# IAMTrail

### AWS Managed Policy Changes Archive

_Previously known as MAMIP (Monitor AWS Managed IAM Policies)._

[![Build Status](https://github.com/zoph-io/IAMTrail/actions/workflows/main.yml/badge.svg?branch=master)](https://github.com/zoph-io/IAMTrail/actions/workflows/main.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-iamtrail.com-brightgreen)](https://iamtrail.com)

Track every change to AWS Managed IAM Policies with full version history and validation.

**[Website](https://iamtrail.com)** | **[Browse Policies](https://iamtrail.com/policies)** | **[About](https://iamtrail.com/about)**

</div>

---

## Website

Explore AWS Managed IAM Policies through a searchable web interface at **[iamtrail.com](https://iamtrail.com)**:

[![IAMTrail Website](assets/screenshot.png)](https://iamtrail.com)

- Search and filter across 1,465+ managed policies
- Full version history with git diffs for every policy
- Syntax-highlighted JSON policy viewer
- New (v1) policy tracking to spot new AWS services
- Policy validation findings from AWS Access Analyzer
- [Known AWS Account lookup](https://iamtrail.com/accounts) - identify who owns an AWS account ID, powered by the [fwdcloudsec/known_aws_accounts](https://github.com/fwdcloudsec/known_aws_accounts) community dataset

---

## Get Notified

Subscribe to policy changes:

- **Email Digest** (recommended): [Subscribe on iamtrail.com](https://iamtrail.com/subscribe) - daily or weekly emails with inline diffs, per-policy filtering, no account required
- **Bluesky** (unified feed - IAM policies, endpoints, GuardDuty): [@iamtrail.bsky.social](https://bsky.app/profile/iamtrail.bsky.social)
- **RSS Feeds** ([all feeds](https://iamtrail.com/feeds/)):
  - [All Changes](https://iamtrail.com/feeds/all.xml) - everything in one feed
  - [IAM Policy Changes](https://iamtrail.com/feeds/iam-policies.xml) - policy updates, new policies, deprecations
  - [Endpoint Changes](https://iamtrail.com/feeds/endpoints.xml) - new regions, services, and expansions from botocore
  - [GuardDuty Announcements](https://iamtrail.com/feeds/guardduty.xml) - new findings, features, and region launches

See [docs/notifications-and-social.md](docs/notifications-and-social.md) for SSM parameters, Bluesky queue, and GitHub Actions IAM.

## Browse the Data

All policies are stored as JSON in this repository and updated automatically every hour on weekdays.

| Path | Description |
| --- | --- |
| [`policies/`](./policies/) | 1,465+ current AWS Managed IAM Policies |
| [`findings/`](./findings/) | Access Analyzer validation results |
| [`DEPRECATED.json`](./DEPRECATED.json) | Historical record of 73+ deprecated policies |

## API

The whole archive is also published as versioned JSON at `https://iamtrail.com/api/v1`. No key, no sign-up, no rate limit - these are static files on the same CloudFront distribution that serves the site. Full documentation at [iamtrail.com/api](https://iamtrail.com/api).

| Resource | Description |
| --- | --- |
| [`/api/v1/index.json`](https://iamtrail.com/api/v1/index.json) | Service index: contract version, counts, and the URL of every other resource |
| [`/api/v1/policies.json`](https://iamtrail.com/api/v1/policies.json) | Every tracked policy with its ARN, current version and dates |
| `/api/v1/policies/{policyName}.json` | One policy: current IAM document plus full version history with per-version action deltas |
| [`/api/v1/changes.json`](https://iamtrail.com/api/v1/changes.json) | Recent changes, each naming the actions added and removed |
| [`/api/v1/actions.json`](https://iamtrail.com/api/v1/actions.json) | Every literal IAM action mapped to the policies that allow, deny or NotAction it |
| [`/api/v1/discoveries.json`](https://iamtrail.com/api/v1/discoveries.json) | Actions and service prefixes seen for the first time anywhere in the archive |

```bash
# What changed in the last day
curl -s https://iamtrail.com/api/v1/changes.json \
  | jq -r '.changes[]
      | select(.date > (now - 86400 | todate))
      | "\(.policyName) \(.versionId): \(.summary)"'
```

Fields are added, never removed or repurposed, within a version. A breaking change means a new path under `/api/v2/`.

## How It Works

An automated workflow runs every hour (Mon-Fri):

1. Fetch all AWS Managed IAM Policies via the AWS API
2. Detect new, updated, or deprecated policies
3. Validate each policy with AWS Access Analyzer
4. Commit changes to git (one commit per policy)
5. Notify via Bluesky, RSS, email digests, and an invite-only Discord webhook (SSM only, not linked on the site)

## Credits

Inspired by [Scott Piper's](https://twitter.com/0xdabbad00) original [aws_managed_policies](https://github.com/SummitRoute/aws_managed_policies) repository. Thank you, Scott, for pioneering this.

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE) for details.

---

<div align="center">

**[Website](https://iamtrail.com)** | **[RSS Feeds](https://iamtrail.com/feeds/)** | **[Bluesky](https://bsky.app/profile/iamtrail.bsky.social)**

Made by [zoph.io](https://zoph.io) - AWS Cloud Advisory Boutique

[![Build Status](https://github.com/zoph-io/IAMTrail/actions/workflows/main.yml/badge.svg)](https://github.com/zoph-io/IAMTrail/actions/workflows/main.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

_Unofficial archive, not affiliated with AWS._

</div>

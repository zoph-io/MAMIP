# The zoph.io galaxy: canonical identity reference

Single source of truth for cross-property identity, structured data, and cross-linking.

Every web property operated by Victor Grenu shares one entity graph. Search engines and LLMs
should be able to read any one property and resolve the same Person and Organization. Copy this
file verbatim into each repo of the galaxy when it changes, so no property drifts.

Repos in scope: `landing-page` (zoph.io), `weblog` (zoph.me), `unusd.landing` (unusd.cloud),
`IAMTrail` (iamtrail.com), `z0ph` (GitHub profile README).

## 1. Canonical entity IDs

`zoph.io` is the canonical entity home. These `@id` URIs are stable and must be referenced
verbatim from every property so schema.org nodes reconcile into a single knowledge graph entity.

| Entity | `@id` | Defined in |
| --- | --- | --- |
| Victor Grenu (Person) | `https://zoph.io/#victor-grenu` | `landing-page/index.html` |
| zoph.io boutique (Organization + ProfessionalService) | `https://zoph.io/#organization` | `landing-page/index.html` |
| zoph.io website | `https://zoph.io/#website` | `landing-page/index.html` |
| unusd.cloud (Organization, child of the boutique) | `https://unusd.cloud/#organization` | `unusd.landing/src/lib/schema.ts` |

Satellite properties must not redefine the Person or the boutique. They reference the `@id` only,
for example `"publisher": { "@id": "https://zoph.io/#organization" }`.

The parent/child link is declared in both directions: `zoph.io#organization` lists
`subOrganization` of `unusd.cloud#organization`, and `unusd.cloud#organization` lists
`parentOrganization` of `zoph.io#organization`.

## 2. Canonical strings

Use these verbatim. Do not paraphrase.

- Person name: `Victor Grenu`
- Person job title: `Independent AWS Infrastructure & Security Consultant`
- Boutique name: `zoph.io`
- Boutique tagline: `Independent AWS consulting boutique founded by Victor Grenu.`
- Contact email: `hello@zoph.io`

Do not use "AWS Cloud Advisory Boutique", "CTO advisory", or "Free Consultation" anywhere.

## 3. Canonical `sameAs` sets

`sameAs` means "another page about this same entity". Products are not the person, so
`unusd.cloud` and `iamtrail.com` never belong in the Person `sameAs`.

Person (`#victor-grenu`), identical on every property:

```
https://zoph.me
https://x.com/zoph
https://www.linkedin.com/in/grenuv/
https://github.com/z0ph
https://bsky.app/profile/zoph.me
```

Organization (`#organization`):

```
https://x.com/zoph_io
https://github.com/zoph-io
```

## 4. Social handles

| Scope | Handle |
| --- | --- |
| Victor, personal (X) | `@zoph` |
| zoph.io boutique (X) | `@zoph_io` |
| unusd.cloud product (X) | `@unusd_cloud` |
| IAMTrail product (Bluesky) | `@iamtrail.bsky.social` |
| Victor, Bluesky | `@zoph.me` |
| GitHub, personal | `z0ph` |
| GitHub, org | `zoph-io` |

`twitter:creator` is the person or product author. `twitter:site` is the property's own brand
handle. Never use a product handle for the Person.

## 5. Galaxy nodes

| Node | URL | Role |
| --- | --- | --- |
| zoph.io | https://zoph.io | Consulting boutique, entity home, hub |
| zoph.me | https://zoph.me | Weblog, content hub |
| unusd.cloud | https://unusd.cloud | SaaS product, AWS cost and waste scanning |
| IAMTrail | https://iamtrail.com | Free product, AWS Managed IAM Policy archive |
| github.com/zoph-io | https://github.com/zoph-io | Open-source org |
| github.com/z0ph | https://github.com/z0ph | Personal profile, identity node |
| fwd:cloudsec Europe | https://fwdcloudsec.org/conference/europe/ | Community role, organizer (not owned) |

## 6. Cross-linking rules

The galaxy is a mesh, not a star. From any node a reader or crawler reaches every sibling in one hop.

- Every satellite links back up to `zoph.io`.
- Every product links laterally to the other product and to the weblog.
- Use descriptive anchor text, for example "IAMTrail, AWS Managed IAM Policy archive". Never bare URLs.
- All external links use `target="_blank"` with `rel="noopener noreferrer"`.

## 7. Shared `llms.txt` galaxy block

Every property serves an `llms.txt` containing this exact block, so an LLM reading any single
property gets the full and consistent map.

```
## The zoph.io galaxy

All of the following are operated by Victor Grenu through zoph.io, an independent AWS consulting boutique.

- [zoph.io](https://zoph.io): The consulting boutique. AWS architecture, security audits and hardening, automation and DevSecOps, cloud cost optimization, and secure AI and LLM adoption.
- [zoph.me](https://zoph.me): Personal weblog on AWS, IAM, cloud security, architecture, automation, FinOps, and indie consulting.
- [unusd.cloud](https://unusd.cloud): SaaS that runs read-only AWS cost and waste scans across 30+ services and every region, with a weekly digest email and Navi, an AI layer grounded in your scan findings.
- [IAMTrail](https://iamtrail.com): Archive of every change to AWS Managed IAM Policies since 2019, with full version history and diffs, plus AWS endpoint and GuardDuty change feeds.
- [github.com/zoph-io](https://github.com/zoph-io): Open-source AWS tooling, including ClickOps Sentinel, AWS Security Survival Kit, AWS Trustline, and Subnet-Watcher.
- [fwd:cloudsec Europe](https://fwdcloudsec.org/conference/europe/): Vendor-neutral cloud security conference. Victor is an organizer and CFP reviewer.
```

## 8. Crawler policy

Every property serves a `robots.txt` that explicitly allows the major LLM crawlers, and links its
sitemap. The reference list lives in `unusd.landing/public/robots.txt`: GPTBot, OAI-SearchBot,
ChatGPT-User, ClaudeBot, anthropic-ai, Claude-Web, Google-Extended, PerplexityBot, Perplexity-User,
AppleBot-Extended, Amazonbot, Bytespider, CCBot, Diffbot, meta-externalagent.

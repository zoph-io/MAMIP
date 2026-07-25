/**
 * Canonical identity for the zoph.io galaxy.
 *
 * IAMTrail is one property in a group operated by Victor Grenu through zoph.io. The Person and
 * Organization entities are defined once, on zoph.io, and only referenced here by `@id` so
 * schema.org nodes reconcile into a single knowledge graph entity.
 *
 * Source of truth: GALAXY.md at the repository root. Keep both in sync.
 */

export const PARENT_BRAND_NAME = "zoph.io";
export const PARENT_BRAND_URL = "https://zoph.io";
export const PARENT_ORG_ID = `${PARENT_BRAND_URL}/#organization`;
export const FOUNDER_ID = `${PARENT_BRAND_URL}/#victor-grenu`;
export const FOUNDER_NAME = "Victor Grenu";

/** Use verbatim. Do not paraphrase. */
export const PARENT_BRAND_TAGLINE =
  "Independent AWS consulting boutique founded by Victor Grenu.";

export const SITE_URL = "https://iamtrail.com";

/** Canonical `sameAs` set for the founder, identical on every galaxy property. */
export const FOUNDER_SAME_AS = [
  "https://zoph.me",
  "https://x.com/zoph",
  "https://www.linkedin.com/in/grenuv/",
  "https://github.com/z0ph",
  "https://bsky.app/profile/zoph.me",
];

/** Reference to the parent boutique, safe to embed in any schema.org node. */
export const PARENT_ORG_NODE = {
  "@type": "Organization",
  "@id": PARENT_ORG_ID,
  name: PARENT_BRAND_NAME,
  url: PARENT_BRAND_URL,
  description: PARENT_BRAND_TAGLINE,
};

/** Sibling properties, used for lateral cross-links in the footer. */
export const SIBLING_LINKS = [
  {
    label: "unusd.cloud",
    href: "https://unusd.cloud",
    description: "AWS cost and waste scanning",
  },
  {
    label: "zoph.me",
    href: "https://zoph.me",
    description: "Weblog on AWS and cloud security",
  },
];

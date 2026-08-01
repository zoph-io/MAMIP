import {
  Activity,
  BarChart3,
  Code2,
  FileText,
  GitBranch,
  Globe2,
  Info,
  Layers,
  Mail,
  Radar,
  Rss,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export const GITHUB_URL = "https://github.com/zoph-io/IAMTrail";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

// The three destinations that answer "what changed in AWS IAM", kept in the bar
// itself. Everything else lives in the More menu and the footer sitemap.
export const PRIMARY_NAV: NavItem[] = [
  {
    href: "/changes",
    label: "Changes",
    description: "Every recorded policy change, newest first",
    icon: Activity,
  },
  {
    href: "/policies",
    label: "Policies",
    description: "Search all tracked AWS managed policies",
    icon: FileText,
  },
  {
    href: "/discoveries",
    label: "Discoveries",
    description: "Never-before-seen actions and new AWS services",
    icon: Sparkles,
  },
];

export const SUBSCRIBE_ITEM: NavItem = {
  href: "/subscribe",
  label: "Subscribe",
  description: "Email digest, double opt-in, no account needed",
  icon: Mail,
};

export const MENU_GROUPS: NavGroup[] = [
  {
    id: "policies",
    label: "IAM policies",
    items: [
      ...PRIMARY_NAV,
      {
        href: "/brand-new",
        label: "Brand new",
        description: "Policies still on their first version",
        icon: Sparkles,
      },
      {
        href: "/deprecated",
        label: "Deprecated",
        description: "Policies AWS has deprecated",
        icon: XCircle,
      },
      {
        href: "/most-active",
        label: "Most active",
        description: "Policies with the most revisions",
        icon: TrendingUp,
      },
      {
        href: "/largest-policies",
        label: "Largest policies",
        description: "Policies granting the most actions",
        icon: Layers,
      },
      {
        href: "/service-growth",
        label: "Service growth",
        description: "When each AWS service first appeared in IAM",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "ecosystem",
    label: "AWS ecosystem",
    items: [
      {
        href: "/endpoints",
        label: "Endpoints",
        description: "New regions, services and endpoint expansions",
        icon: Globe2,
      },
      {
        href: "/guardduty",
        label: "GuardDuty",
        description: "New findings, features and region rollouts",
        icon: Radar,
      },
      {
        href: "/accounts",
        label: "Account lookup",
        description: "Identify the owner of an AWS account ID",
        icon: Search,
      },
      {
        href: "/findings",
        label: "Security findings",
        description: "Access Analyzer and privilege escalation paths",
        icon: ShieldAlert,
      },
    ],
  },
  {
    id: "informed",
    label: "Stay informed",
    items: [
      SUBSCRIBE_ITEM,
      {
        href: "/feeds",
        label: "Feeds",
        description: "RSS for every topic we track",
        icon: Rss,
      },
      {
        href: "/api",
        label: "JSON API",
        description: "Free static endpoints under /api/v1/",
        icon: Code2,
      },
      {
        href: "/usage",
        label: "Usage stats",
        description: "How many readers the notifications reach",
        icon: Users,
      },
    ],
  },
  {
    id: "project",
    label: "Project",
    items: [
      {
        href: "/about",
        label: "About",
        description: "How the archive works, sources and credits",
        icon: Info,
      },
      {
        href: GITHUB_URL,
        label: "GitHub",
        description: "Raw policy history, committed on every change",
        icon: GitBranch,
      },
    ],
  },
];

const ITEMS_BY_HREF = new Map<string, NavItem>(
  MENU_GROUPS.flatMap((group) => group.items).map((item) => [item.href, item])
);

export function navItem(href: string): NavItem | undefined {
  return ITEMS_BY_HREF.get(href);
}

// Every page that would otherwise be a dead end names the peers a reader most
// likely wants next, so no destination depends on the nav alone.
export const RELATED_LINKS: Record<string, string[]> = {
  "/accounts": ["/findings", "/policies", "/subscribe"],
  "/service-growth": ["/discoveries", "/changes", "/feeds"],
  "/feeds": ["/subscribe", "/api", "/discoveries"],
  "/guardduty": ["/endpoints", "/feeds", "/subscribe"],
  "/endpoints": ["/guardduty", "/discoveries", "/feeds"],
  "/findings": ["/policies", "/accounts", "/subscribe"],
  "/brand-new": ["/deprecated", "/most-active", "/changes"],
  "/deprecated": ["/brand-new", "/policies", "/changes"],
  "/most-active": ["/largest-policies", "/changes", "/policies"],
  "/largest-policies": ["/most-active", "/brand-new", "/policies"],
  "/api": ["/feeds", "/subscribe", "/policies"],
  "/usage": ["/subscribe", "/feeds", "/about"],
};

export function relatedLinks(href: string): NavItem[] {
  return (RELATED_LINKS[href] ?? [])
    .map((target) => ITEMS_BY_HREF.get(target))
    .filter((item): item is NavItem => Boolean(item));
}

// A policy detail page belongs to Policies, and an action page is reached from
// one, so both keep the Policies tab lit.
const ACTIVE_PREFIXES: Record<string, string[]> = {
  "/policies": ["/policies", "/actions"],
};

export function isActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  const prefixes = ACTIVE_PREFIXES[href] ?? [href];
  return prefixes.some((prefix) => pathname.startsWith(`${prefix}/`));
}

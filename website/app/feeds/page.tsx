import { Rss, Shield, Globe, FileText, Layers, Sparkles } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RSS Feeds",
  description:
    "Subscribe to IAMTrail RSS feeds for IAM policy changes, endpoint updates, and GuardDuty announcements.",
};

const SITE_URL = "https://iamtrail.com";

const feeds = [
  {
    name: "Discoveries",
    url: `${SITE_URL}/feeds/discoveries.xml`,
    path: "/feeds/discoveries.xml",
    description:
      "First-ever sightings of AWS IAM service prefixes and actions. The IAM component usually lands before the SDK and the docs, so a service often shows up here before AWS announces it.",
    icon: Sparkles,
    highlight: true,
  },
  {
    name: "All Changes",
    url: `${SITE_URL}/feeds/all.xml`,
    path: "/feeds/all.xml",
    description:
      "Everything in one feed - discoveries, IAM policy changes, endpoint updates, and GuardDuty announcements.",
    icon: Layers,
    highlight: false,
  },
  {
    name: "IAM Policy Changes",
    url: `${SITE_URL}/feeds/iam-policies.xml`,
    path: "/feeds/iam-policies.xml",
    description:
      "Every AWS Managed IAM Policy change, with the actions added and removed named in the item itself.",
    icon: FileText,
    highlight: false,
  },
  {
    name: "Endpoint Changes",
    url: `${SITE_URL}/feeds/endpoints.xml`,
    path: "/feeds/endpoints.xml",
    description:
      "New AWS regions, new services, and service expansions detected from botocore endpoint data.",
    icon: Globe,
    highlight: false,
  },
  {
    name: "GuardDuty Announcements",
    url: `${SITE_URL}/feeds/guardduty.xml`,
    path: "/feeds/guardduty.xml",
    description:
      "AWS GuardDuty SNS announcements - new findings, feature updates, region launches, and service changes.",
    icon: Shield,
    highlight: false,
  },
];

export default function FeedsPage() {
  return (
    <div className="space-y-8">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            <Rss className="w-7 h-7 text-orange-500" />
            <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              RSS Feeds
            </h1>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Subscribe to IAMTrail feeds in your favorite RSS reader. Pick a
            specific channel or use the all-in-one feed to get everything.
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {feeds.map((feed) => {
          const Icon = feed.icon;
          return (
            <div
              key={feed.path}
              className={`border rounded-lg p-6 ${
                feed.highlight
                  ? "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`p-2 rounded-lg ${
                    feed.highlight
                      ? "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold font-mono text-zinc-900 dark:text-white">
                      {feed.name}
                    </h2>
                    {feed.highlight && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                        recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                    {feed.description}
                  </p>
                  <div className="flex items-center gap-3">
                    <a
                      href={feed.path}
                      className="inline-flex items-center gap-1.5 text-sm font-mono px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                    >
                      <Rss className="w-3.5 h-3.5" />
                      Subscribe
                    </a>
                    <code className="text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 rounded truncate max-w-xs sm:max-w-md">
                      {feed.url}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 bg-zinc-50 dark:bg-zinc-900/50">
        <h3 className="text-sm font-semibold font-mono text-zinc-900 dark:text-white mb-2">
          How to subscribe
        </h3>
        <ol className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5 list-decimal list-inside">
          <li>Copy the feed URL above</li>
          <li>
            Open your RSS reader (e.g. Feedly, Inoreader, NetNewsWire,
            Miniflux)
          </li>
          <li>Add a new subscription and paste the URL</li>
        </ol>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-3">
          Most RSS readers also auto-discover feeds from any IAMTrail page via
          the standard{" "}
          <code className="px-1 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded">
            &lt;link rel=&quot;alternate&quot;&gt;
          </code>{" "}
          tags.
        </p>
      </div>
    </div>
  );
}

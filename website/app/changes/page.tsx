import Link from "next/link";
import type { Metadata } from "next";
import { Rss } from "lucide-react";
import ChangeTimeline from "@/components/ChangeTimeline";
import type { ChangesFile } from "@/lib/changes";

export const metadata: Metadata = {
  title: "AWS Managed IAM Policy Changes",
  description:
    "Every recent change to an AWS Managed IAM Policy, with the actions added and removed named in full, plus never-before-seen actions and new AWS services.",
  alternates: {
    canonical: "https://iamtrail.com/changes",
    types: {
      "application/rss+xml": [
        { url: "/feeds/iam-policies.xml", title: "IAMTrail - IAM Policy Changes" },
      ],
    },
  },
};

// Enough rows to fill the first screen and give crawlers real content; the
// client swaps in the full timeline for search, filters and paging.
const SEED_ROWS = 25;

async function getChanges(): Promise<ChangesFile | null> {
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(process.cwd(), "public/data/changes.json");
  if (!fs.existsSync(dataPath)) return null;
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function formatDay(iso: string | null): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ChangesPage() {
  const data = await getChanges();

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">
          No change data available. Run{" "}
          <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
            automation/scripts/build_action_registry.py
          </code>{" "}
          then regenerate the site data.
        </p>
      </div>
    );
  }

  const { changes, stats } = data;

  return (
    <div className="space-y-8">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              Changes
            </h1>
            <a
              href="/feeds/iam-policies.xml"
              title="Subscribe via RSS"
              className="text-zinc-400 hover:text-orange-500 dark:text-zinc-500 dark:hover:text-orange-400 transition-colors"
            >
              <Rss className="w-5 h-5" />
            </a>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Every recent change to an AWS Managed IAM Policy, newest first, with
            the actions added and removed named in full. AWS reissues a policy
            version for a Resource or Condition edit more often than for a
            permission change, so a change with no action delta is normal and says
            so rather than implying nothing happened.
          </p>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            {stats.total.toLocaleString("en-US")} changes between{" "}
            {formatDay(stats.oldest)} and {formatDay(stats.newest)}.{" "}
            {stats.discoveries.toLocaleString("en-US")} named something never seen
            anywhere in the archive before, and{" "}
            {stats.permissionsManagement.toLocaleString("en-US")} added a
            permissions management action. Older changes are in each policy&apos;s
            own version history, back to 2019.
          </p>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            These land in real time in the{" "}
            <a
              href="/feeds/iam-policies.xml"
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              IAM policies RSS feed
            </a>{" "}
            and by email via{" "}
            <Link
              href="/subscribe"
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              digests
            </Link>
            .
          </p>
        </div>
      </div>

      <ChangeTimeline
        initialChanges={changes.slice(0, SEED_ROWS)}
        total={stats.total}
      />
    </div>
  );
}

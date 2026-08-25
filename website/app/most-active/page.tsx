import Link from "next/link";
import type { Metadata } from "next";
import RelatedPages from "@/components/RelatedPages";

export const metadata: Metadata = {
  title: "Most Active AWS Managed IAM Policies",
  description:
    "AWS Managed IAM Policies ranked by number of modifications. See which policies change the most frequently.",
  alternates: {
    canonical: "https://iamtrail.com/most-active",
  },
};

async function getSummaryData() {
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(process.cwd(), "public/data/summary.json");
  if (!fs.existsSync(dataPath)) return null;
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

export default async function MostActivePage() {
  const summaryData = await getSummaryData();

  if (!summaryData) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">No data available.</p>
      </div>
    );
  }

  const { policies } = summaryData;
  const sorted = [...policies]
    .sort(
      (a: any, b: any) => (b.versionsCount || 0) - (a.versionsCount || 0)
    )
    .slice(0, 50);

  const maxVersions = sorted[0]?.versionsCount || 1;

  return (
    <div className="space-y-8">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Most Active Policies
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Top 50 AWS Managed IAM Policies ranked by number of modifications
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
            Ranked by version count
          </h2>
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
            {sorted.length} policies
          </span>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sorted.map((policy: any, idx: number) => {
            const barWidth = Math.max(
              (policy.versionsCount / maxVersions) * 100,
              2
            );
            return (
              <Link
                key={policy.name}
                href={`/policies/${encodeURIComponent(policy.name)}`}
                className="block px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 text-right text-xs font-mono text-zinc-400 dark:text-zinc-500 flex-shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                      {policy.name}
                    </p>
                    <div className="mt-1.5 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 dark:bg-red-400 rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
                    {policy.versionsCount} versions
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <RelatedPages current="/most-active" />
    </div>
  );
}

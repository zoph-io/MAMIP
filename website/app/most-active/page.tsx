import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Most Active AWS Managed IAM Policies",
  description:
    "AWS Managed IAM Policies ranked by number of modifications. See which policies change the most frequently.",
  alternates: {
    canonical: "https://mamip.zoph.io/most-active",
  },
};

const basePath =
  process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "";

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
        <p className="text-slate-600 dark:text-slate-400">No data available.</p>
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
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center py-8">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
          Most Active Policies
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Top 50 AWS Managed IAM Policies ranked by number of modifications
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Ranked by version count
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {sorted.length} policies
          </span>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {sorted.map((policy: any, idx: number) => {
            const barWidth = Math.max(
              (policy.versionsCount / maxVersions) * 100,
              2
            );
            return (
              <Link
                key={policy.name}
                href={`${basePath}/policies/${encodeURIComponent(policy.name)}`}
                className="block px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 text-right text-sm font-mono text-slate-400 dark:text-slate-500 flex-shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {policy.name}
                    </p>
                    <div className="mt-1.5 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 dark:bg-blue-400 rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                    {policy.versionsCount} versions
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import RelatedPages from "@/components/RelatedPages";

export const metadata: Metadata = {
  title: "Deprecated AWS Managed IAM Policies",
  description:
    "Complete list of deprecated AWS Managed IAM Policies with deprecation dates. Track which policies have been removed from AWS.",
  alternates: {
    canonical: "https://iamtrail.com/deprecated",
  },
};

async function getSummaryData() {
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(process.cwd(), "public/data/summary.json");
  if (!fs.existsSync(dataPath)) return null;
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

export default async function DeprecatedPage() {
  const summaryData = await getSummaryData();

  if (!summaryData) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">No data available.</p>
      </div>
    );
  }

  const { deprecated } = summaryData;
  const items = Object.entries(deprecated)
    .map(([name, date]) => ({ name, date: date as string }))
    .sort((a, b) => {
      if (a.date === "Unknown" && b.date === "Unknown") return 0;
      if (a.date === "Unknown") return 1;
      if (b.date === "Unknown") return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Deprecated Policies
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {items.length} AWS Managed IAM Policies that have been removed
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
            Sorted by deprecation date, newest first ({items.length})
          </h2>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.map((item) => (
            <Link
              key={item.name}
              href={`/policies/${encodeURIComponent(item.name)}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                  {item.name}
                </p>
              </div>
              <span className="ml-4 flex-shrink-0 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                {item.date !== "Unknown" ? item.date : "Unknown"}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <RelatedPages current="/deprecated" />
    </div>
  );
}

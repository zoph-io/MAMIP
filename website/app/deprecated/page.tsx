import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deprecated AWS Managed IAM Policies",
  description:
    "Complete list of deprecated AWS Managed IAM Policies with deprecation dates. Track which policies have been removed from AWS.",
  alternates: {
    canonical: "https://mamip.zoph.io/deprecated",
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

export default async function DeprecatedPage() {
  const summaryData = await getSummaryData();

  if (!summaryData) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-600 dark:text-slate-400">No data available.</p>
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

  const withDate = items.filter((i) => i.date !== "Unknown");
  const withoutDate = items.filter((i) => i.date === "Unknown");

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center py-8">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
          Deprecated Policies
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          {items.length} AWS Managed IAM Policies that have been removed
        </p>
      </div>

      {withDate.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              With known deprecation date ({withDate.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {withDate.map((item) => (
              <Link
                key={item.name}
                href={`${basePath}/policies/${encodeURIComponent(item.name)}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {item.name}
                  </p>
                </div>
                <span className="ml-4 flex-shrink-0 text-sm text-slate-500 dark:text-slate-400">
                  {item.date}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {withoutDate.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Unknown deprecation date ({withoutDate.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {withoutDate
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((item) => (
                <Link
                  key={item.name}
                  href={`${basePath}/policies/${encodeURIComponent(item.name)}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {item.name}
                    </p>
                  </div>
                  <span className="ml-4 flex-shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    Unknown
                  </span>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import RelatedPages from "@/components/RelatedPages";

export const metadata: Metadata = {
  title: "Brand New (v1) AWS Managed IAM Policies",
  description:
    "Recently created AWS Managed IAM Policies still at version 1. Spot upcoming AWS services and features early.",
  alternates: {
    canonical: "https://iamtrail.com/brand-new",
  },
};

async function getSummaryData() {
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(process.cwd(), "public/data/summary.json");
  if (!fs.existsSync(dataPath)) return null;
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

export default async function BrandNewPage() {
  const summaryData = await getSummaryData();

  if (!summaryData) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">No data available.</p>
      </div>
    );
  }

  const { stats } = summaryData;
  const windowDays = stats.brandNewWindowDays || 90;
  const brandNew = (stats.brandNew || []).sort(
    (a: any, b: any) =>
      new Date(b.createDate || 0).getTime() -
      new Date(a.createDate || 0).getTime(),
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Brand New Policies (v1)
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {brandNew.length} new v1 AWS Managed IAM Policies created in the last{" "}
          {windowDays} days - spot upcoming services early
        </p>
      </div>

      {brandNew.length > 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
              Created in the last {windowDays} days ({brandNew.length})
            </h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {brandNew.map((policy: any) => (
              <Link
                key={policy.name}
                href={`/policies/${encodeURIComponent(policy.name)}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                    {policy.name}
                  </p>
                  <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {policy.versionId}
                  </p>
                </div>
                <span className="ml-4 flex-shrink-0 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                  {policy.createDate
                    ? new Date(policy.createDate).toLocaleDateString()
                    : "-"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-zinc-600 dark:text-zinc-400 text-sm">
            No brand new (v1) policies detected right now.
          </p>
        </div>
      )}

      <RelatedPages current="/brand-new" />
    </div>
  );
}

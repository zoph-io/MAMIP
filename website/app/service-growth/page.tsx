import type { Metadata } from "next";
import RelatedPages from "@/components/RelatedPages";

export const metadata: Metadata = {
  title: "AWS Service Growth Timeline",
  description:
    "See when new AWS IAM service namespaces first appeared in managed policies. Track the growth of the AWS ecosystem over time.",
  alternates: {
    canonical: "https://iamtrail.com/service-growth",
  },
};

async function getSummaryData() {
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(process.cwd(), "public/data/summary.json");
  if (!fs.existsSync(dataPath)) return null;
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

export default async function ServiceGrowthPage() {
  const summaryData = await getSummaryData();

  if (!summaryData) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">No data available.</p>
      </div>
    );
  }

  const serviceGrowth: Record<string, string[]> =
    summaryData.stats.serviceGrowth || {};
  const years = Object.keys(serviceGrowth).sort();
  const totalServices = years.reduce(
    (sum, y) => sum + serviceGrowth[y].length,
    0
  );
  const maxPerYear = Math.max(
    ...years.map((y) => serviceGrowth[y].length),
    1
  );

  return (
    <div className="space-y-8">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          AWS Service Growth Timeline
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl">
          When new IAM service namespaces first appeared in AWS managed policies
          - tracking the growth of the AWS ecosystem
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs font-mono text-zinc-500 dark:text-zinc-400">
          <span>
            <strong className="text-zinc-900 dark:text-white">
              {totalServices}
            </strong>{" "}
            service namespaces
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">|</span>
          <span>
            <strong className="text-zinc-900 dark:text-white">
              {years.length}
            </strong>{" "}
            years of data
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {years.map((year) => {
          const services = serviceGrowth[year];
          const barWidth = Math.max(
            (services.length / maxPerYear) * 100,
            4
          );
          const isRecent =
            parseInt(year) >= new Date().getFullYear() - 2;

          return (
            <div
              key={year}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
            >
              <div className="px-5 py-3 flex items-center gap-4">
                <h2
                  className={`text-xl font-bold font-mono tabular-nums flex-shrink-0 ${
                    isRecent
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-900 dark:text-white"
                  }`}
                >
                  {year}
                </h2>
                <div className="flex-1">
                  <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isRecent
                          ? "bg-red-500 dark:bg-red-400"
                          : "bg-zinc-400 dark:bg-zinc-600"
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`text-xs font-mono font-medium flex-shrink-0 ${
                    isRecent
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  +{services.length} new
                </span>
              </div>
              <div className="px-5 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {services.map((svc) => (
                    <span
                      key={svc}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${
                        isRecent
                          ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-800"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <RelatedPages current="/service-growth" />
    </div>
  );
}

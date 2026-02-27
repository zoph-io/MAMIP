import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AWS Service Growth Timeline",
  description:
    "See when new AWS IAM service namespaces first appeared in managed policies. Track the growth of the AWS ecosystem over time.",
  alternates: {
    canonical: "https://mamip.zoph.io/service-growth",
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
        <p className="text-slate-600 dark:text-slate-400">No data available.</p>
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
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center py-8">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
          AWS Service Growth Timeline
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          When new IAM service namespaces first appeared in AWS managed policies
          - tracking the growth of the AWS ecosystem
        </p>
        <div className="mt-4 inline-flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span>
            <strong className="text-slate-900 dark:text-white">
              {totalServices}
            </strong>{" "}
            service namespaces
          </span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span>
            <strong className="text-slate-900 dark:text-white">
              {years.length}
            </strong>{" "}
            years of data
          </span>
        </div>
      </div>

      <div className="space-y-6">
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
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              <div className="px-6 py-4 flex items-center gap-4">
                <h2
                  className={`text-2xl font-bold tabular-nums flex-shrink-0 ${
                    isRecent
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-900 dark:text-white"
                  }`}
                >
                  {year}
                </h2>
                <div className="flex-1">
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isRecent
                          ? "bg-blue-500 dark:bg-blue-400"
                          : "bg-slate-400 dark:bg-slate-500"
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`text-sm font-medium flex-shrink-0 ${
                    isRecent
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  +{services.length} new
                </span>
              </div>
              <div className="px-6 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {services.map((svc) => (
                    <span
                      key={svc}
                      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono ${
                        isRecent
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
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
    </div>
  );
}

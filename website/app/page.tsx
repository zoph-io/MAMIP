import StatsCard from "@/components/StatsCard";
import PolicyList from "@/components/PolicyList";
import Link from "next/link";

// Get base path based on deployment target
const basePath =
  process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "";

async function getSummaryData() {
  try {
    const fs = require("fs");
    const path = require("path");
    const dataPath = path.join(process.cwd(), "public/data/summary.json");

    if (!fs.existsSync(dataPath)) {
      return null;
    }

    const data = fs.readFileSync(dataPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading summary data:", error);
    return null;
  }
}

export default async function Home() {
  const summaryData = await getSummaryData();

  if (!summaryData) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">📊</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          No Data Available
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Run{" "}
          <code className="px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded">
            npm run generate-data
          </code>{" "}
          to generate the policy data.
        </p>
      </div>
    );
  }

  const { stats, deprecated } = summaryData;
  const deprecatedCount = Object.keys(deprecated).length;

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-12">
        <div className="flex justify-center mb-6">
          <img
            src={`${basePath}/zoph-logo.png`}
            alt="zoph.io"
            className="h-20 w-auto dark:brightness-110"
          />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-2">
          AWS Managed Policy Changes Archive
        </h1>
        <span className="inline-block px-3 py-1 text-sm font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full mb-4">
          Unofficial
        </span>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto mb-4">
          Track every change to AWS Managed IAM Policies with full version
          history.
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-500">
          A service by{" "}
          <a
            href="https://zoph.io"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            zoph.io
          </a>{" "}
          — AWS Cloud Advisory Boutique
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Policies"
          value={stats.totalPolicies.toLocaleString()}
          description="Active AWS Managed Policies"
          icon="📋"
        />
        <StatsCard
          title="Brand New (v1)"
          value={stats.brandNew?.length || 0}
          description="New AWS services/features"
          icon="🆕"
        />
        <StatsCard
          title="Deprecated"
          value={deprecatedCount.toLocaleString()}
          description="Removed from AWS"
          icon="🗑️"
        />
        <StatsCard
          title="Most Active"
          value={stats.mostModified[0]?.versionsCount || 0}
          description={`${stats.mostModified[0]?.name.substring(0, 20)}...`}
          icon="📈"
        />
      </div>

      {/* Brand New Policies Spotlight */}
      {stats.brandNew && stats.brandNew.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-700 rounded-2xl p-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,black)]"></div>
          <div className="relative">
            <div className="flex items-center space-x-3 mb-4">
              <span className="text-4xl">🆕</span>
              <div>
                <h3 className="text-2xl font-bold">Brand New Policies (v1)</h3>
                <p className="text-emerald-100">
                  Spot upcoming AWS services early — {stats.brandNew.length} new
                  policies detected
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
              {stats.brandNew.slice(0, 6).map((policy: any) => (
                <Link
                  key={policy.name}
                  href={`${basePath}/policies/${encodeURIComponent(
                    policy.name
                  )}`}
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg p-4 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-50">
                        {policy.name}
                      </p>
                      <p className="text-xs text-emerald-100 mt-1">
                        Version {policy.versionId} • Created{" "}
                        {policy.createDate
                          ? new Date(policy.createDate).toLocaleDateString()
                          : "recently"}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5 text-emerald-200 flex-shrink-0 ml-2 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700 dark:from-blue-700 dark:via-blue-600 dark:to-blue-800 rounded-2xl p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,black)]"></div>
        <div className="relative flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold mb-2">Browse All Policies</h3>
            <p className="text-blue-100">
              Search, filter, and explore {stats.totalPolicies} AWS Managed IAM
              Policies
            </p>
          </div>
          <Link
            href={`${basePath}/policies`}
            className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 hover:shadow-lg transition-all transform hover:scale-105"
          >
            Explore →
          </Link>
        </div>
      </div>

      {/* Policy Lists Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PolicyList
          title="📅 Recently Updated"
          policies={stats.recentlyUpdated}
          showVersions={true}
        />
        <PolicyList
          title="🔥 Most Modified"
          policies={stats.mostModified}
          showVersions={true}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PolicyList
          title="🆕 Newest Policies"
          policies={stats.newest}
          showVersions={false}
        />
        <PolicyList
          title="⏳ Oldest Policies"
          policies={stats.oldest}
          showVersions={false}
        />
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="group bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all">
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform inline-block">
            📢
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
            Stay Updated
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Follow{" "}
            <a
              href="https://bsky.app/profile/mamip.bsky.social"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium hover:underline transition-colors"
            >
              @mamip.bsky.social
            </a>{" "}
            for real-time policy updates
          </p>
        </div>

        <div className="group bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all">
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform inline-block">
            🔍
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
            Version History
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Every policy change is tracked in git with full version history and
            diffs
          </p>
        </div>

        <div className="group bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all">
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform inline-block">
            ⚡
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
            Open Source
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            View the source on{" "}
            <a
              href="https://github.com/z0ph/MAMIP"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium hover:underline transition-colors"
            >
              GitHub
            </a>{" "}
            and contribute
          </p>
        </div>
      </div>
    </div>
  );
}

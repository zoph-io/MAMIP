import StatsCard from "@/components/StatsCard";
import ChangeCard from "@/components/ChangeCard";
import PolicyList from "@/components/PolicyList";
import type { PolicyChange } from "@/lib/changes";
import PolicyAgeChart from "@/components/PolicyAgeChart";
import SeasonalityChart from "@/components/SeasonalityChart";
import ReinventPulseChart from "@/components/ReinventPulseChart";
import VersionDistributionChart from "@/components/VersionDistributionChart";
import VelocityChart from "@/components/VelocityChart";
import Link from "next/link";
import {
  FileText,
  Sparkles,
  Trash2,
  TrendingUp,
  Ruler,
  Layers,
  ChevronRight,
  Globe,
  History,
  Key,
} from "lucide-react";

const ENDPOINT_CHANGE_BADGE: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  new_region: {
    label: "New Region",
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  new_service: {
    label: "New Service",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
  },
  service_expansion: {
    label: "Expansion",
    color: "text-indigo-700 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    border: "border-indigo-200 dark:border-indigo-800",
  },
  removed_region: {
    label: "Removed",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
  },
};

async function getEndpointsSummary() {
  try {
    const fs = require("fs");
    const path = require("path");
    const dataPath = path.join(
      process.cwd(),
      "public/data/endpoints-summary.json"
    );
    if (!fs.existsSync(dataPath)) return null;
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    return null;
  }
}

async function getRecentChanges() {
  try {
    const fs = require("fs");
    const path = require("path");
    const dataPath = path.join(process.cwd(), "public/data/changes.json");
    if (!fs.existsSync(dataPath)) return null;
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    return {
      changes: (data.changes || []).slice(0, 6) as PolicyChange[],
      total: data.stats?.total ?? 0,
    };
  } catch {
    return null;
  }
}

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
  const endpointsData = await getEndpointsSummary();
  const recentChanges = await getRecentChanges();

  if (!summaryData) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 font-mono">
          No Data Available
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          Run{" "}
          <code className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded font-mono text-sm">
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
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="py-12 border-b border-zinc-100 dark:border-zinc-800">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-4xl md:text-5xl font-extrabold font-mono text-zinc-900 dark:text-white tracking-tight">
              IAMTrail
            </h1>
            <span className="inline-block px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded">
              Unofficial
            </span>
          </div>
          <p className="text-lg md:text-xl text-zinc-900 dark:text-white leading-relaxed">
            AWS silently updates Managed IAM policies all the time.
            <br />
            <span className="text-red-600 dark:text-red-400 font-semibold">We catch every single change.</span>
          </p>
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            Full version history and diffs for{" "}
            <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{stats.totalPolicies}</span>{" "}
            AWS Managed IAM Policies, archived since 2019.
            <span className="text-zinc-300 dark:text-zinc-700"> | </span>
            A service by{" "}
            <a
              href="https://zoph.io"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-zinc-700 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              zoph.io
            </a>
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/policies">
          <StatsCard
            title="Total Policies"
            value={stats.totalPolicies.toLocaleString()}
            description="Active AWS Managed Policies"
            icon={<FileText className="w-8 h-8" />}
          />
        </Link>
        <Link href="/brand-new">
          <StatsCard
            title="Brand New (v1)"
            value={stats.brandNew?.length || 0}
            description="New AWS services/features"
            icon={<Sparkles className="w-8 h-8" />}
          />
        </Link>
        <Link href="/deprecated">
          <StatsCard
            title="Deprecated"
            value={deprecatedCount.toLocaleString()}
            description="Removed from AWS"
            icon={<Trash2 className="w-8 h-8" />}
          />
        </Link>
        <Link href="/most-active">
          <StatsCard
            title="Most Active"
            value={stats.mostModified[0]?.versionsCount || 0}
            description={`${stats.mostModified[0]?.name.substring(0, 20)}...`}
            icon={<TrendingUp className="w-8 h-8" />}
          />
        </Link>
      </div>

      {/* Latest Changes */}
      {recentChanges && recentChanges.changes.length > 0 && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
              <History className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
              <div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Latest Changes
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  What AWS changed most recently, and exactly which actions moved
                </p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {recentChanges.changes.map((change) => (
              <ChangeCard
                key={`${change.sha}:${change.policyName}`}
                change={change}
                compact
              />
            ))}
          </div>
          <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <Link
              href="/changes"
              className="inline-flex items-center gap-1 text-sm font-medium font-mono text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            >
              View all {recentChanges.total.toLocaleString()} recent changes
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Brand New Policies Spotlight */}
      {stats.brandNew && stats.brandNew.length > 0 && (
        <div className="border border-red-200 dark:border-red-900/50 rounded-lg overflow-hidden">
          <div className="px-6 py-4 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50">
            <div className="flex items-center space-x-3">
              <Sparkles className="w-5 h-5 text-red-600 dark:text-red-400" />
              <div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-red-700 dark:text-red-400">
                  Brand New Policies (v1)
                </h3>
                <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5">
                  Spot upcoming AWS services early - {stats.brandNew.length} new
                  policies detected
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-100 dark:divide-zinc-800">
            {stats.brandNew.slice(0, 6).map((policy: any) => (
              <Link
                key={policy.name}
                href={`/policies/${encodeURIComponent(policy.name)}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                    {policy.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                    {policy.versionId} / {policy.createDate
                      ? new Date(policy.createDate).toLocaleDateString()
                      : "recently"}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 flex-shrink-0 ml-2 group-hover:text-red-500 transition-colors" />
              </Link>
            ))}
          </div>
          {stats.brandNew.length > 6 && (
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <Link
                href="/brand-new"
                className="inline-flex items-center gap-1 text-sm font-medium font-mono text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                View all {stats.brandNew.length} new policies
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Subscribe CTA */}
      <div className="border border-zinc-900 dark:border-zinc-100 rounded-lg p-6 bg-zinc-900 dark:bg-zinc-100">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-mono font-semibold text-green-400 dark:text-green-600 uppercase tracking-widest">
                Free - No account needed
              </span>
            </div>
            <h3 className="text-lg font-bold font-mono text-white dark:text-zinc-900">
              Get notified when policies change
            </h3>
            <p className="text-sm text-zinc-400 dark:text-zinc-600 mt-1">
              Daily or weekly email digests with inline diffs. Pick specific policies or track them all.
            </p>
          </div>
          <Link
            href="/subscribe"
            className="px-5 py-2.5 bg-red-600 text-white rounded font-mono font-semibold text-sm hover:bg-red-700 transition-colors flex-shrink-0"
          >
            Subscribe
          </Link>
        </div>
      </div>

      {/* Endpoint Signals */}
      {endpointsData && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
              <Globe className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
              <div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Endpoint Signals
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {endpointsData.currentState.totalRegions} regions,{" "}
                  {endpointsData.currentState.partitions.find((p: any) => p.partition === "aws")?.serviceCount || endpointsData.currentState.totalServices} services tracked from botocore
                </p>
              </div>
            </div>
          </div>
          {endpointsData.recentChanges.length > 0 ? (
            <>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {endpointsData.recentChanges
                  .slice(0, 3)
                  .flatMap((record: any) =>
                    record.changes.slice(0, 5).map((change: any, cIdx: number) => ({
                      ...change,
                      detected_at: record.detected_at,
                      key: `${record.detected_at}-${cIdx}`,
                    }))
                  )
                  .slice(0, 5)
                  .map((change: any) => {
                    const badge = ENDPOINT_CHANGE_BADGE[change.type] || {
                      label: change.type,
                      color: "text-zinc-600 dark:text-zinc-400",
                      bg: "bg-zinc-50 dark:bg-zinc-800",
                      border: "border-zinc-200 dark:border-zinc-700",
                    };
                    const regions = change.new_regions || change.removed_regions;
                    return (
                      <div
                        key={change.key}
                        className="px-5 py-3 flex items-center gap-3"
                      >
                        <span
                          className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium ${badge.bg} ${badge.color} border ${badge.border}`}
                        >
                          {badge.label}
                        </span>
                        {change.service ? (
                          <span className="flex items-center gap-2 min-w-0">
                            <code className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200 flex-shrink-0">
                              {change.service}
                            </code>
                            {regions && regions.length > 0 && (
                              <span className="flex flex-wrap gap-1 min-w-0">
                                {regions.slice(0, 3).map((r: string) => (
                                  <span
                                    key={r}
                                    className={`text-[10px] font-mono px-1 py-0.5 rounded ${
                                      change.new_regions
                                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                                        : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                                    }`}
                                  >
                                    {r}
                                  </span>
                                ))}
                                {regions.length > 3 && (
                                  <span className="text-[10px] font-mono text-zinc-400">
                                    +{regions.length - 3}
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                            {change.description}
                          </span>
                        )}
                        <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0 ml-auto font-mono">
                          {change.partition}
                        </span>
                      </div>
                    );
                  })}
              </div>
              <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <Link
                  href="/endpoints"
                  className="inline-flex items-center gap-1 text-sm font-medium font-mono text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                >
                  View all endpoint changes
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </>
          ) : (
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                No recent changes detected
              </span>
              <Link
                href="/endpoints"
                className="inline-flex items-center gap-1 text-sm font-medium font-mono text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                Explore endpoints
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Policy Age Histogram + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {stats.policiesByYear && (
            <PolicyAgeChart policiesByYear={stats.policiesByYear} />
          )}
        </div>
        <div className="space-y-4">
          <Link href="/largest-policies">
            <StatsCard
              title="Largest Policy"
              value={`${stats.largestByActionCount?.[0]?.actionCount || 0} actions`}
              description={
                stats.largestByActionCount?.[0]?.name.substring(0, 25) +
                  "..." || "N/A"
              }
              icon={<Ruler className="w-8 h-8" />}
            />
          </Link>
          <Link href="/service-growth">
            <StatsCard
              title="AWS Services Tracked"
              value={
                stats.serviceGrowth
                  ? Object.values(
                      stats.serviceGrowth as Record<string, string[]>,
                    ).reduce((sum, arr) => sum + arr.length, 0)
                  : 0
              }
              description="IAM service namespaces over time"
              icon={<Layers className="w-8 h-8" />}
            />
          </Link>
          <StatsCard
            title="IAM Actions (literals)"
            value={
              typeof stats.uniqueLiteralActionCount === "number"
                ? stats.uniqueLiteralActionCount.toLocaleString()
                : "~14,055"
            }
            description="Distinct action strings in managed policies (no wildcards)"
            icon={<Key className="w-8 h-8" />}
          />
        </div>
      </div>

      {/* Velocity + Version Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {stats.yearlyVelocity && (
          <VelocityChart
            yearlyVelocity={stats.yearlyVelocity}
            bulkDaysExcluded={stats.bulkDaysExcluded}
          />
        )}
        {stats.versionDistribution && (
          <VersionDistributionChart
            versionDistribution={stats.versionDistribution}
            topVersionPolicies={stats.topVersionPolicies || []}
          />
        )}
      </div>

      {/* Seasonality + re:Invent Pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {stats.changesByMonth && (
            <SeasonalityChart changesByMonth={stats.changesByMonth} />
          )}
        </div>
        {stats.reinventPulse && (
          <ReinventPulseChart reinventPulse={stats.reinventPulse} />
        )}
      </div>

      {/* Policy Lists Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PolicyList
          title="Recently Updated"
          policies={stats.recentlyUpdated}
          showVersions={true}
        />
        {stats.volatileThisYear && stats.volatileThisYear.length > 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
                Most Volatile (Trailing 12 Months)
              </h3>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {stats.volatileThisYear.map(
                (p: { name: string; changesThisYear: number }) => (
                  <Link
                    key={p.name}
                    href={`/policies/${encodeURIComponent(p.name)}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="text-sm text-zinc-900 dark:text-white truncate mr-3">
                      {p.name}
                    </span>
                    <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      {p.changesThisYear} changes
                    </span>
                  </Link>
                ),
              )}
            </div>
          </div>
        ) : (
          <PolicyList
            title="Newest Policies"
            policies={stats.newest}
            showVersions={false}
          />
        )}
      </div>

      {stats.volatileThisYear && stats.volatileThisYear.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PolicyList
            title="Newest Policies"
            policies={stats.newest}
            showVersions={false}
          />
          <PolicyList
            title="Oldest Policies"
            policies={stats.oldest}
            showVersions={false}
          />
        </div>
      )}
    </div>
  );
}

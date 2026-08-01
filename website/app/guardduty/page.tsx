import StatsCard from "@/components/StatsCard";
import GuardDutyFeed from "@/components/GuardDutyFeed";
import RelatedPages from "@/components/RelatedPages";
import { Shield, Sparkles, Globe, Clock, Rss } from "lucide-react";

async function getGuardDutyData() {
  try {
    const fs = require("fs");
    const path = require("path");
    const dataPath = path.join(
      process.cwd(),
      "public/data/guardduty-summary.json"
    );

    if (!fs.existsSync(dataPath)) {
      return null;
    }

    const data = fs.readFileSync(dataPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading GuardDuty data:", error);
    return null;
  }
}

function formatRelativeDate(iso: string) {
  const now = new Date();
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export default async function GuardDutyPage() {
  const data = await getGuardDutyData();

  if (!data) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 font-mono">
          No Data Available
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          Run the{" "}
          <code className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded font-mono text-sm">
            import-mgda-gists.py
          </code>{" "}
          script or wait for new GuardDuty announcements to populate data.
        </p>
      </div>
    );
  }

  const { stats, announcements } = data;
  const latestDate =
    announcements.length > 0 ? announcements[0].detected_at : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              GuardDuty Announcements
            </h1>
            <a
              href="/feeds/guardduty.xml"
              title="Subscribe via RSS"
              className="text-zinc-400 hover:text-orange-500 dark:text-zinc-500 dark:hover:text-orange-400 transition-colors"
            >
              <Rss className="w-5 h-5" />
            </a>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Tracking AWS{" "}
            <a
              href="https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_sns.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-red-600 dark:text-red-400 hover:underline"
            >
              GuardDuty SNS announcements
            </a>{" "}
            - new findings, feature updates, region launches, and service
            changes detected automatically. Public alerts also go to{" "}
            <a
              href="https://bsky.app/profile/iamtrail.bsky.social"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              Bluesky
            </a>{" "}
            and the{" "}
            <a
              href="/feeds/guardduty.xml"
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              GuardDuty RSS feed
            </a>
            .
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Announcements"
          value={stats.total}
          description="Since tracking began"
          icon={<Shield className="w-8 h-8" />}
        />
        <StatsCard
          title="New Findings"
          value={
            (stats.typeCounts?.NEW_FINDINGS || 0) +
            (stats.typeCounts?.UPDATED_FINDINGS || 0)
          }
          description="New + updated findings"
          icon={<Shield className="w-8 h-8" />}
        />
        <StatsCard
          title="Features"
          value={stats.typeCounts?.NEW_FEATURES || 0}
          description="New capabilities"
          icon={<Sparkles className="w-8 h-8" />}
        />
        <StatsCard
          title="Latest"
          value={latestDate ? formatRelativeDate(latestDate) : "N/A"}
          description={
            latestDate
              ? new Date(latestDate).toLocaleDateString()
              : "Monitoring active"
          }
          icon={<Clock className="w-8 h-8" />}
        />
      </div>

      {/* Announcement feed */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
          Announcement History
        </h2>
        <GuardDutyFeed announcements={announcements} />
      </div>

      <RelatedPages current="/guardduty" />
    </div>
  );
}

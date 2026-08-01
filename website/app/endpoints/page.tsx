import StatsCard from "@/components/StatsCard";
import EndpointChangeFeed from "@/components/EndpointChangeFeed";
import EndpointInsights from "@/components/EndpointInsights";
import PartitionExplorer from "@/components/PartitionExplorer";
import RelatedPages from "@/components/RelatedPages";
import {
  Globe,
  Server,
  Network,
  Clock,
  Activity,
  MapPin,
  Layers,
  CalendarDays,
  Rss,
} from "lucide-react";

async function getEndpointsData() {
  try {
    const fs = require("fs");
    const path = require("path");
    const dataPath = path.join(
      process.cwd(),
      "public/data/endpoints-summary.json"
    );

    if (!fs.existsSync(dataPath)) {
      return null;
    }

    const data = fs.readFileSync(dataPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading endpoints data:", error);
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

function trackingDuration(since: string | null) {
  if (!since) return null;
  const start = new Date(since);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    now.getMonth() -
    start.getMonth();
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}mo` : `${years} years`;
}

export default async function EndpointsPage() {
  const data = await getEndpointsData();

  if (!data) {
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
          to generate the endpoints data.
        </p>
      </div>
    );
  }

  const { currentState, recentChanges, changeStats } = data;
  const latestChange =
    recentChanges.length > 0 ? recentChanges[0].detected_at : null;

  const awsPartition = currentState.partitions.find(
    (p: any) => p.partition === "aws"
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              AWS Endpoint Changes
            </h1>
            <a
              href="/feeds/endpoints.xml"
              title="Subscribe via RSS"
              className="text-zinc-400 hover:text-orange-500 dark:text-zinc-500 dark:hover:text-orange-400 transition-colors"
            >
              <Rss className="w-5 h-5" />
            </a>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Tracking changes in botocore&apos;s{" "}
            <a
              href="https://github.com/boto/botocore/blob/develop/botocore/data/endpoints.json"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-red-600 dark:text-red-400 hover:underline"
            >
              endpoints.json
            </a>{" "}
            - new regions, new services, and endpoint expansions detected
            automatically every 6 hours.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Regions"
          value={currentState.totalRegions}
          description="Across all partitions"
          icon={<Globe className="w-8 h-8" />}
        />
        <StatsCard
          title="Services"
          value={awsPartition?.serviceCount || currentState.totalServices}
          description={
            awsPartition ? "In aws partition" : "Across all partitions"
          }
          icon={<Server className="w-8 h-8" />}
        />
        <StatsCard
          title="Partitions"
          value={currentState.totalPartitions}
          description="aws, aws-cn, aws-us-gov, ..."
          icon={<Network className="w-8 h-8" />}
        />
        <StatsCard
          title="Latest Change"
          value={latestChange ? formatRelativeDate(latestChange) : "N/A"}
          description={
            latestChange
              ? new Date(latestChange).toLocaleDateString()
              : "Monitoring active"
          }
          icon={<Clock className="w-8 h-8" />}
        />
      </div>

      {changeStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            title="Changes Tracked"
            value={changeStats.totalChangeItems.toLocaleString()}
            description={`${changeStats.totalRecords} detection events`}
            icon={<Activity className="w-8 h-8" />}
          />
          <StatsCard
            title="Services Expanded"
            value={changeStats.uniqueServices}
            description="Unique services observed"
            icon={<Layers className="w-8 h-8" />}
          />
          <StatsCard
            title="Regions Covered"
            value={changeStats.uniqueRegions}
            description="Regions with expansions"
            icon={<MapPin className="w-8 h-8" />}
          />
          <StatsCard
            title="Tracking Since"
            value={
              changeStats.trackingSince
                ? trackingDuration(changeStats.trackingSince) || "N/A"
                : "N/A"
            }
            description={
              changeStats.trackingSince
                ? new Date(changeStats.trackingSince).toLocaleDateString(
                    "en-US",
                    { month: "short", year: "numeric" }
                  )
                : "Monitoring active"
            }
            icon={<CalendarDays className="w-8 h-8" />}
          />
        </div>
      )}

      {/* Insights */}
      {changeStats && (
        <div>
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-4">
            Insights
          </h2>
          <EndpointInsights stats={changeStats} />
        </div>
      )}

      {/* Change feed + Partition explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
            Change History
          </h2>
          <EndpointChangeFeed changes={recentChanges} />
        </div>
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-4">
            Current State
          </h2>
          <PartitionExplorer partitions={currentState.partitions} />
        </div>
      </div>

      <RelatedPages current="/endpoints" />
    </div>
  );
}

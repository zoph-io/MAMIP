import Link from "next/link";
import type { Metadata } from "next";
import DiscoveryExplorer, {
  type ActionDiscovery,
  type ServiceDiscovery,
} from "@/components/DiscoveryExplorer";
import { TELEGRAM_URL } from "@/lib/social";

export const metadata: Metadata = {
  title: "New AWS Service Discoveries in IAM",
  description:
    "IAM actions and service prefixes appearing for the first time in AWS managed policies. Often the earliest public sign of an unannounced AWS service or feature.",
  alternates: {
    canonical: "https://iamtrail.com/discoveries",
  },
};

// Enough rows to fill the first screen and give crawlers the recent sightings;
// the client swaps in the full set for search and paging.
const SEED_ROWS = 30;

type DiscoveriesFile = {
  archiveStart: string;
  stats: {
    totalNewServices: number;
    totalNewActions: number;
    servicesSinceStart: number;
  };
  services: ServiceDiscovery[];
  actions: ActionDiscovery[];
};

async function getDiscoveries(): Promise<DiscoveriesFile | null> {
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(process.cwd(), "public/data/discoveries.json");
  if (!fs.existsSync(dataPath)) return null;
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

export default async function DiscoveriesPage() {
  const data = await getDiscoveries();

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">
          No discovery data available. Run{" "}
          <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
            automation/scripts/build_action_registry.py
          </code>{" "}
          then regenerate the site data.
        </p>
      </div>
    );
  }

  const { services, actions, stats, archiveStart } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Discoveries
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          IAM actions and service prefixes appearing for the first time anywhere
          in the AWS managed policy archive. AWS usually ships the IAM component
          of a service before the SDK and the docs, so a brand-new prefix is
          often the earliest public sign of something unannounced.
        </p>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          {stats.totalNewServices} service prefixes and{" "}
          {stats.totalNewActions.toLocaleString("en-US")} actions have appeared
          since tracking began on {archiveStart}. A further{" "}
          {stats.servicesSinceStart} prefixes were already present at that point,
          so they have no discoverable first sighting and are excluded here.
        </p>
        {TELEGRAM_URL ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            These land in real time on the read-only{" "}
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              Telegram channel
            </a>{" "}
            and by email via the{" "}
            <Link
              href="/subscribe"
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              discoveries topic
            </Link>
            .
          </p>
        ) : null}
      </div>

      <DiscoveryExplorer
        initialServices={services.slice(0, SEED_ROWS)}
        initialActions={actions.slice(0, SEED_ROWS)}
        totalServices={stats.totalNewServices}
        totalActions={stats.totalNewActions}
      />

      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Dates are the earliest appearance in an AWS managed policy tracked here,
        not official AWS launch dates. Actions are matched case-insensitively, as
        IAM does, and wildcards such as{" "}
        <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
          s3:*
        </code>{" "}
        are excluded because they name no concrete action. For a year-by-year
        view of the same namespace growth, see the{" "}
        <Link
          href="/service-growth"
          className="text-red-600 dark:text-red-400 hover:underline"
        >
          service growth timeline
        </Link>
        .
      </p>
    </div>
  );
}

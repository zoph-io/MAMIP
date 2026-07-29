import Link from "next/link";
import type { Metadata } from "next";
import { Radar, Sparkles } from "lucide-react";
import { iamActionToSlug } from "@/lib/actionSlug";
import { TELEGRAM_URL } from "@/lib/social";

export const metadata: Metadata = {
  title: "New AWS Service Discoveries in IAM",
  description:
    "IAM actions and service prefixes appearing for the first time in AWS managed policies. Often the earliest public sign of an unannounced AWS service or feature.",
  alternates: {
    canonical: "https://iamtrail.com/discoveries",
  },
};

type ServiceDiscovery = {
  prefix: string;
  firstSeen: string;
  firstPolicy: string;
  actionCount: number;
};

type ActionDiscovery = {
  action: string;
  firstSeen: string;
  firstPolicy: string;
  hasPage: boolean;
};

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

function PolicyLink({ name }: { name: string }) {
  if (!name) return <span className="text-zinc-500">unknown</span>;
  return (
    <Link
      href={`/policies/${encodeURIComponent(name)}`}
      className="text-red-600 dark:text-red-400 hover:underline"
    >
      {name}
    </Link>
  );
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

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <Radar className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
            New service prefixes
          </h2>
          <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 ml-auto">
            {services.length < stats.totalNewServices
              ? `${services.length} most recent`
              : `all ${services.length}`}
          </span>
        </div>
        {services.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {services.map((s) => (
              <div
                key={s.prefix}
                className="flex items-start justify-between gap-4 px-5 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium text-zinc-900 dark:text-white break-all">
                    {s.prefix}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {s.actionCount}{" "}
                    {s.actionCount === 1 ? "action" : "actions"} to date, first
                    seen in <PolicyLink name={s.firstPolicy} />
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                  {s.firstSeen}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No new service prefixes recorded yet.
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
            New actions on existing services
          </h2>
          <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 ml-auto">
            {actions.length < stats.totalNewActions
              ? `${actions.length} most recent of ${stats.totalNewActions.toLocaleString("en-US")}`
              : `all ${actions.length}`}
          </span>
        </div>
        {actions.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {actions.map((a) => (
              <div
                key={a.action}
                className="flex items-start justify-between gap-4 px-5 py-3"
              >
                <div className="flex-1 min-w-0">
                  {a.hasPage ? (
                    <Link
                      href={`/actions/${iamActionToSlug(a.action)}`}
                      className="text-sm font-mono text-red-600 dark:text-red-400 hover:underline break-all"
                    >
                      {a.action}
                    </Link>
                  ) : (
                    <p className="text-sm font-mono text-zinc-900 dark:text-white break-all">
                      {a.action}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    first seen in <PolicyLink name={a.firstPolicy} />
                    {a.hasPage ? "" : " - no longer in any tracked policy"}
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                  {a.firstSeen}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No new actions recorded yet.
          </p>
        )}
      </div>

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

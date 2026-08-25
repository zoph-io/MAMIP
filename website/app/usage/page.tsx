import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  ListOrdered,
  Mail,
  UserCheck,
} from "lucide-react";
import StatsCard from "@/components/StatsCard";
import UsageBreakdown from "@/components/UsageBreakdown";
import RelatedPages from "@/components/RelatedPages";

const SITE = "https://iamtrail.com";

function loadUsageData(): UsageStats {
  try {
    const fs = require("fs");
    const path = require("path");
    const p = path.join(process.cwd(), "public/data/usage-stats.json");
    if (!fs.existsSync(p)) return { available: false, generatedAt: null };
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { available: false, generatedAt: null };
  }
}

interface UsageStats {
  available: boolean;
  generatedAt: string | null;
  displaySubscriberCount?: number | null;
  confirmedCountExact?: number | null;
  daysActive?: number | null;
  totalSend?: number | null;
  last30DaysSend?: number | null;
  launchDate?: string;
  reason?: string;
  frequency?: { daily: number; weekly: number; instant: number };
  topics?: { iam_policies: number; endpoints: number; guardduty: number };
  allPoliciesSubscribers?: number;
  narrowSubscribers?: number;
  topNarrowPolicies?: { name: string; count: number }[];
  signupsByMonth?: { month: string; count: number }[];
}

export const metadata: Metadata = {
  title: "Notification usage - IAMTrail",
  description:
    "Aggregate, privacy-preserving usage statistics for IAMTrail email notification subscriptions. No personal data.",
  alternates: { canonical: `${SITE}/usage` },
  openGraph: {
    siteName: "IAMTrail",
    title: "Notification usage | IAMTrail",
    description: "How subscribers use IAMTrail email notifications. Aggregate stats only.",
    url: `${SITE}/usage`,
    images: ["/social.png"],
  },
};

const TOPIC_LABELS: Record<string, string> = {
  iam_policies: "IAM policies",
  endpoints: "Endpoints",
  guardduty: "GuardDuty",
};

const FREQ_ORDER = [
  { key: "daily" as const, label: "Daily" },
  { key: "weekly" as const, label: "Weekly" },
  { key: "instant" as const, label: "Instant" },
];

export default function UsagePage() {
  const d = loadUsageData();

  const freq = d.frequency;
  const freqItems =
    d.available && freq
      ? FREQ_ORDER.map((x) => ({
          label: x.label,
          count: freq[x.key] ?? 0,
          color: "",
        }))
      : [];

  const top = d.topics;
  const topicItems =
    d.available && top
      ? (["iam_policies", "endpoints", "guardduty"] as const).map((key) => ({
          label: TOPIC_LABELS[key],
          count: top[key] ?? 0,
          color: "",
        }))
      : [];

  return (
    <div className="space-y-10">
      <div className="py-8 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Notification usage
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl">
          Aggregate, privacy-preserving statistics about how people use
          IAMTrail email notifications. Numbers are regenerated when the site
          is deployed; they are not a live stream.
        </p>
        {d.available && d.generatedAt && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            As of {new Date(d.generatedAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            .
          </p>
        )}
        {!d.available && (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800 rounded-lg px-3 py-2 max-w-2xl">
            Usage data was not available at build time (this often happens
            in CI when AWS credentials are not configured). The site still
            builds: deploy from an environment with AWS access, or add{" "}
            <code className="text-xs font-mono">public/data/usage-stats.json</code> before{" "}
            <code className="text-xs font-mono">npm run build</code>
            {d.reason ? ` (${d.reason})` : ""}
          </p>
        )}
      </div>

      {d.available && (
        <section
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          aria-label="Key metrics"
        >
          <StatsCard
            title="Confirmed subscribers"
            value={d.displaySubscriberCount ?? d.confirmedCountExact ?? 0}
            description={
              (d.confirmedCountExact !== undefined && d.confirmedCountExact! < 50
                ? "Rounded to the nearest 5 to protect individual privacy. "
                : "") + "Excludes unconfirmed sign-ups."
            }
            icon={<UserCheck className="w-8 h-8" />}
          />
          <StatsCard
            title="Emails sent (total)"
            value={d.totalSend ?? 0}
            description="All outbound mail from the IAMTrail notification sender (SES) since launch."
            icon={<Mail className="w-8 h-8" />}
          />
          <StatsCard
            title="Emails sent (last 30 days)"
            value={d.last30DaysSend ?? 0}
            description="Includes digests, instant policy alerts, and transactional mail from the same sender."
            icon={<BarChart3 className="w-8 h-8" />}
          />
          <StatsCard
            title="Active days (notifications)"
            value={d.daysActive ?? 0}
            description={`Since public launch on ${(d.launchDate || "").slice(0, 10)}. One running count per calendar day.`}
            icon={<Calendar className="w-8 h-8" />}
          />
        </section>
      )}

      {d.available && (freq || top) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {freq && (
            <UsageBreakdown
              title="Digest schedule"
              description="How many confirmed subscribers chose each email cadence. Instant applies to IAM change alerts; other topics can still be daily or weekly."
              footnote="Each confirmed subscriber is in exactly one frequency group."
              items={freqItems}
            />
          )}
          {top && (
            <UsageBreakdown
              title="Notification topics"
              description="Subscribers can enable IAM policy changes, endpoint updates, and GuardDuty announcements. Missing topic lists default to IAM policies, matching the subscription form."
              footnote="A subscriber can enable more than one topic, so the topic row sums are often higher than the subscriber count."
              items={topicItems}
            />
          )}
        </div>
      )}

      {d.available &&
        d.allPoliciesSubscribers != null &&
        d.narrowSubscribers != null && (
          <section
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6"
            aria-labelledby="policy-prefs-heading"
          >
            <div className="flex items-start gap-3">
              <ListOrdered className="w-5 h-5 text-red-600/70 dark:text-red-400/70 flex-shrink-0 mt-0.5" />
              <div>
                <h2
                  id="policy-prefs-heading"
                  className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-2"
                >
                  Policy selection
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {d.narrowSubscribers} confirmed {d.narrowSubscribers === 1 ? "subscriber" : "subscribers"}{" "}
                  chose specific policy names. Most people subscribe to all
                  policies.
                </p>
                <p className="mt-1 text-sm font-mono text-zinc-800 dark:text-zinc-200">
                  All managed policies: {d.allPoliciesSubscribers} subscribers
                </p>
                {d.topNarrowPolicies && d.topNarrowPolicies.length > 0 && (
                  <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                    {d.topNarrowPolicies.map((row) => (
                      <li
                        key={row.name}
                        className="flex flex-wrap items-baseline justify-between gap-2"
                      >
                        <Link
                          href={`/policies/${row.name}`}
                          className="text-red-600 dark:text-red-400 hover:underline font-mono"
                        >
                          {row.name}
                        </Link>
                        <span className="text-zinc-500 text-xs">
                          {row.count} subscribers (shown when count is 2+)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {d.topNarrowPolicies?.length === 0 && d.narrowSubscribers > 0 && (
                  <p className="mt-2 text-xs text-zinc-500">
                    When two or more subscribers share the same narrow
                    selection, the policy is listed here.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

      {d.available && d.signupsByMonth && d.signupsByMonth.length > 0 && (
        <section
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6"
          aria-labelledby="signups-heading"
        >
          <h2
            id="signups-heading"
            className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-4"
          >
            New confirmed sign-ups by month
          </h2>
          <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            {d.signupsByMonth.map((m) => (
              <li
                key={m.month}
                className="flex justify-between max-w-sm font-mono text-xs"
              >
                <span>{m.month}</span>
                <span>
                  {m.count} {m.count === 1 ? "subscriber" : "subscribers"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl space-y-2">
        <p>
          <strong className="text-zinc-800 dark:text-zinc-200">Privacy</strong>{" "}
          - this page only shows totals and other aggregates. Email addresses
          and management tokens are never included in the published JSON.
        </p>
        <p>
          <strong className="text-zinc-800 dark:text-zinc-200">Subscribe</strong>{" "}
          - want these updates?{" "}
          <Link
            href="/subscribe"
            className="text-red-600 dark:text-red-400 font-medium inline-flex items-center gap-1 hover:underline"
          >
            Get email notifications
            <ArrowRight className="w-4 h-4" />
          </Link>
        </p>
      </section>

      <RelatedPages current="/usage" />
    </div>
  );
}

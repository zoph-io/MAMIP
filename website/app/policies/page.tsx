"use client";

import { Suspense, useState, useMemo, useEffect, useRef } from "react";
import { Rss } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { iamActionToSlug } from "@/lib/actionSlug";

interface Policy {
  name: string;
  lastModified: string;
  createDate: string | null;
  versionsCount: number;
  versionId: string | null;
}

type ActionEntry = {
  actionAllowPolicies?: string[];
  actionDenyPolicies?: string[];
  notActionPolicies?: string[];
};

type ActionIndex = { actions: Record<string, ActionEntry> };

/**
 * A query naming a service is asking about permissions, not about file names.
 * "s3:" or "kms:Decrypt" means "which policies grant this", which the policy
 * name filter can never answer.
 */
function looksLikeActionQuery(q: string): boolean {
  return q.includes(":");
}

/** Actions whose name contains the query, capped so the banner stays readable. */
const MAX_LISTED_ACTIONS = 12;

function PoliciesContent() {
  const searchParams = useSearchParams();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [sortBy, setSortBy] = useState<"name" | "modified" | "versions">(
    "modified"
  );
  const [loading, setLoading] = useState(true);
  const [actionIndex, setActionIndex] = useState<ActionIndex | null>(null);
  const [actionIndexState, setActionIndexState] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");

  useEffect(() => {
    async function loadPolicies() {
      try {
        const response = await fetch("/data/summary.json");
        const data = await response.json();
        setPolicies(data.policies);
      } catch (error) {
        console.error("Error loading policies:", error);
      } finally {
        setLoading(false);
      }
    }
    loadPolicies();
  }, []);

  const isActionQuery = looksLikeActionQuery(searchTerm.trim());

  // Fetched only once someone actually asks an action question, so the common
  // case of browsing by name never pays for the index. The ref, rather than the
  // status, is what guards the fetch: keying the effect on its own state made
  // the state change re-run the effect, whose cleanup then cancelled the very
  // request it had just started.
  const actionIndexRequested = useRef(false);
  useEffect(() => {
    if (!isActionQuery || actionIndexRequested.current) return;
    actionIndexRequested.current = true;
    setActionIndexState("loading");
    fetch("/data/action-index.json")
      .then((r) => r.json())
      .then((data) => {
        setActionIndex(data);
        setActionIndexState("ready");
      })
      .catch(() => setActionIndexState("failed"));
  }, [isActionQuery]);

  // Keep the URL shareable, and make the SearchAction in the site's structured
  // data true: it has always advertised /policies?q=.
  useEffect(() => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get("q") || "";
    if (current === searchTerm) return;
    if (searchTerm) url.searchParams.set("q", searchTerm);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [searchTerm]);

  const actionMatch = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!isActionQuery || !actionIndex?.actions) return null;

    const matchedActions: string[] = [];
    const policyNames = new Set<string>();
    for (const [action, entry] of Object.entries(actionIndex.actions)) {
      if (!action.toLowerCase().includes(q)) continue;
      matchedActions.push(action);
      for (const name of entry.actionAllowPolicies || []) policyNames.add(name);
      for (const name of entry.actionDenyPolicies || []) policyNames.add(name);
      for (const name of entry.notActionPolicies || []) policyNames.add(name);
    }
    matchedActions.sort();
    return { matchedActions, policyNames };
  }, [actionIndex, searchTerm, isActionQuery]);

  const filteredAndSortedPolicies = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const filtered = policies.filter((policy) => {
      if (!q) return true;
      if (policy.name.toLowerCase().includes(q)) return true;
      return actionMatch ? actionMatch.policyNames.has(policy.name) : false;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "versions":
          return b.versionsCount - a.versionsCount;
        case "modified":
        default:
          return (
            new Date(b.lastModified).getTime() -
            new Date(a.lastModified).getTime()
          );
      }
    });
  }, [policies, searchTerm, sortBy, actionMatch]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays}d ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;

    const months =
      (now.getFullYear() - date.getFullYear()) * 12 +
      (now.getMonth() - date.getMonth());
    if (months < 12) return `${months}mo ago`;

    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) return `${years}y ago`;
    return `${years}y ${remainingMonths}m ago`;
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-zinc-300 border-t-red-600 rounded-full mb-4"></div>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm font-mono">
          Loading policies...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="py-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            All Policies
          </h1>
          <a
            href="/feeds/iam-policies.xml"
            title="Subscribe via RSS"
            className="text-zinc-400 hover:text-orange-500 dark:text-zinc-500 dark:hover:text-orange-400 transition-colors"
          >
            <Rss className="w-5 h-5" />
          </a>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Browse {policies.length} AWS Managed IAM Policies by name, or search an
          IAM action to find every policy that grants it.
        </p>
      </div>

      {/* Search and Filter */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-4 w-4 text-zinc-400"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm font-mono"
                placeholder="Search a policy name or an action like kms:Decrypt"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="modified">Recently Modified</option>
              <option value="name">Name (A-Z)</option>
              <option value="versions">Most Versions</option>
            </select>
          </div>
        </div>
        <div className="mt-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">
          Showing {filteredAndSortedPolicies.length} of {policies.length}{" "}
          policies
          {isActionQuery && actionIndexState === "loading"
            ? " - loading the action index"
            : null}
          {isActionQuery && actionIndexState === "failed"
            ? " - the action index failed to load, matching policy names only"
            : null}
        </div>

        {actionMatch && actionMatch.matchedActions.length > 0 ? (
          <div className="mt-3 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {actionMatch.matchedActions.length.toLocaleString()} matching{" "}
              {actionMatch.matchedActions.length === 1 ? "action" : "actions"}
            </span>{" "}
            in {actionMatch.policyNames.size.toLocaleString()}{" "}
            {actionMatch.policyNames.size === 1 ? "policy" : "policies"}:{" "}
            {actionMatch.matchedActions
              .slice(0, MAX_LISTED_ACTIONS)
              .map((action, i) => (
                <span key={action}>
                  {i > 0 ? ", " : ""}
                  <Link
                    href={`/actions/${iamActionToSlug(action)}`}
                    className="font-mono text-red-600 dark:text-red-400 hover:underline"
                  >
                    {action}
                  </Link>
                </span>
              ))}
            {actionMatch.matchedActions.length > MAX_LISTED_ACTIONS
              ? ` and ${(
                  actionMatch.matchedActions.length - MAX_LISTED_ACTIONS
                ).toLocaleString()} more`
              : ""}
          </div>
        ) : null}

        {actionMatch && actionMatch.matchedActions.length === 0 ? (
          <div className="mt-3 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
            No literal IAM action matches this query. Wildcards such as{" "}
            <code className="font-mono">s3:*</code> are not indexed, since they
            name no concrete action.
          </div>
        ) : null}
      </div>

      {/* Policies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredAndSortedPolicies.map((policy) => (
          <Link
            key={policy.name}
            href={`/policies/${encodeURIComponent(policy.name)}`}
            className="group bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 hover:border-red-300 dark:hover:border-red-800 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-sm text-zinc-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors line-clamp-2">
                {policy.name}
              </h3>
              <svg
                className="w-4 h-4 text-zinc-300 dark:text-zinc-600 flex-shrink-0 ml-2 group-hover:text-red-500 transition-colors"
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
            <div className="space-y-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              <div className="flex items-center justify-between">
                <span>Last modified</span>
                <span className="font-medium">
                  {getRelativeTime(policy.lastModified)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Versions</span>
                <span className="font-medium">{policy.versionsCount}</span>
              </div>
              {policy.createDate && (
                <div className="flex items-center justify-between">
                  <span>Created</span>
                  <span className="font-medium">
                    {formatDate(policy.createDate)}
                  </span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {filteredAndSortedPolicies.length === 0 && (
        <div className="text-center py-16">
          <h3 className="text-lg font-semibold font-mono text-zinc-900 dark:text-white mb-2">
            No policies found
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Try a policy name, or an IAM action such as{" "}
            <code className="font-mono text-xs">iam:PassRole</code>.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PoliciesPage() {
  return (
    <Suspense>
      <PoliciesContent />
    </Suspense>
  );
}

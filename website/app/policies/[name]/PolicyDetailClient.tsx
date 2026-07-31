"use client";

import { useState, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Shield } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import createElement from "react-syntax-highlighter/dist/esm/create-element";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { isLiteralIamActionString } from "@/lib/iamActionPattern";
import { iamActionToSlug } from "@/lib/actionSlug";
import type { PolicyChange } from "@/lib/changes";
import ChangeCard from "@/components/ChangeCard";

function transformIAMActionTextNodes(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((n) => transformIAMActionTextNodes(n));
  }
  if (!node || typeof node !== "object") return node;
  const n = node as {
    type?: string;
    value?: string;
    children?: unknown[];
    tagName?: string;
    properties?: Record<string, unknown>;
  };
  if (n.type === "text") {
    const v = n.value;
    if (typeof v !== "string") return node;
    // Prism JSON "string" tokens are one text node including quotes: "s3:GetObject"
    let inner: string | undefined;
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
      try {
        const parsed = JSON.parse(v) as unknown;
        if (typeof parsed === "string") inner = parsed;
      } catch {
        /* not valid JSON string literal */
      }
    }
    const action = inner !== undefined && isLiteralIamActionString(inner) ? inner : null;
    if (action) {
      return {
        type: "element",
        tagName: "span",
        properties: {
          // create-element expects className as an array; omitting it breaks join()
          className: [],
          style: { display: "contents" },
        },
        children: [
          { type: "text", value: '"' },
          {
            type: "element",
            tagName: "a",
            properties: {
              href: `/actions/${iamActionToSlug(action)}/`,
              className: ["iamtrail-action-link"],
              style: {
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                color: "inherit",
              },
            },
            children: [{ type: "text", value: action }],
          },
          { type: "text", value: '"' },
        ],
      };
    }
    if (isLiteralIamActionString(v)) {
      return {
        type: "element",
        tagName: "a",
        properties: {
          href: `/actions/${iamActionToSlug(v)}/`,
          className: ["iamtrail-action-link"],
          style: {
            textDecoration: "underline",
            textUnderlineOffset: "2px",
            color: "inherit",
          },
        },
        children: [{ type: "text", value: v }],
      };
    }
    return node;
  }
  if (n.children?.length) {
    return {
      ...n,
      children: transformIAMActionTextNodes(n.children) as typeof n.children,
    };
  }
  return node;
}

interface PolicyVersion {
  hash: string;
  date: string;
  message: string;
  author: string;
  /**
   * What this version actually changed. Absent for versions older than the
   * archive replay window in data/policy-change-deltas.json, which is why the
   * row says "no recorded delta" rather than implying nothing changed.
   */
  delta?: PolicyChange;
}

interface PathfindingOverlap {
  pathId: string;
  pathName: string;
  category: string;
  pathfindingUrl: string;
}

interface PolicyData {
  name: string;
  createDate: string | null;
  versionId: string | null;
  lastModified: string;
  versionsCount: number;
  size: number;
  actionCount?: number;
  history: PolicyVersion[];
  content: any;
  deprecation?: {
    date: string;
    lifespan: string | null;
  } | null;
  securitySignals?: {
    accessAnalyzerFindingCount: number;
    pathfindingOverlaps: PathfindingOverlap[];
  };
}

/** ReadOnlyAccess is 115 versions deep; the rest of the archive is far shorter. */
const VERSIONS_PAGE_SIZE = 20;

export default function PolicyDetailClient({
  policyName,
}: {
  policyName: string;
}) {
  const decodedName = decodeURIComponent(policyName);
  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [visibleVersions, setVisibleVersions] = useState(VERSIONS_PAGE_SIZE);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    async function loadPolicy() {
      try {
        const response = await fetch(
          `/data/${encodeURIComponent(decodedName)}.json`
        );
        if (!response.ok) {
          throw new Error("Policy not found");
        }
        const data = await response.json();
        setPolicy(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load policy");
      } finally {
        setLoading(false);
      }
    }
    loadPolicy();
  }, [decodedName]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const iamActionRenderer = useCallback(
    ({
      rows,
      stylesheet,
      useInlineStyles,
    }: {
      rows: Parameters<typeof createElement>[0]["node"][];
      stylesheet: Record<string, CSSProperties>;
      useInlineStyles: boolean;
    }) =>
      rows.map((row, i) =>
        createElement({
          node: transformIAMActionTextNodes(row) as Parameters<
            typeof createElement
          >[0]["node"],
          stylesheet,
          useInlineStyles,
          key: `code-segment-${i}`,
        })
      ),
    []
  );

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
    }

    const months =
      (now.getFullYear() - date.getFullYear()) * 12 +
      (now.getMonth() - date.getMonth());
    if (months < 12) {
      return `${months} month${months !== 1 ? "s" : ""} ago`;
    }

    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) {
      return `${years} year${years !== 1 ? "s" : ""} ago`;
    }
    return `${years}y ${remainingMonths}m ago`;
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-zinc-300 border-t-red-600 rounded-full mb-4"></div>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm font-mono">Loading policy...</p>
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="text-center py-16">
        <h1 className="text-xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Policy Not Found
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          {error || "The requested policy could not be found."}
        </p>
        <Link
          href="/policies"
          className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded font-mono text-sm hover:bg-red-700 transition-colors"
        >
          Back to Policies
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
        <Link
          href="/"
          className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          Home
        </Link>
        <span>/</span>
        <Link
          href="/policies"
          className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          Policies
        </Link>
        <span>/</span>
        <span className="text-zinc-900 dark:text-white truncate">
          {policy.name}
        </span>
      </nav>

      {/* Deprecation banner */}
      {policy.deprecation && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-5 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Deprecated
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {policy.deprecation.date !== "Unknown"
                ? `Removed from AWS on ${policy.deprecation.date}`
                : "Removed from AWS (date unknown)"}
              {policy.deprecation.lifespan &&
                ` - Active for ${policy.deprecation.lifespan}`}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-4">
          {policy.name}
        </h1>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">
              Last Modified
            </p>
            <p className="text-sm font-medium text-zinc-900 dark:text-white">
              {getRelativeTime(policy.lastModified)}
            </p>
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              {formatDate(policy.lastModified)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">
              Version
            </p>
            <p className="text-sm font-medium font-mono text-zinc-900 dark:text-white">
              {policy.versionId || "N/A"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">
              Total Versions
            </p>
            <p className="text-sm font-medium font-mono text-zinc-900 dark:text-white">
              {policy.versionsCount}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">
              Created
            </p>
            <p className="text-sm font-medium text-zinc-900 dark:text-white">
              {policy.createDate
                ? new Date(policy.createDate).toLocaleDateString()
                : "N/A"}
            </p>
          </div>
          {policy.actionCount !== undefined && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">
                Actions
              </p>
              <p className="text-sm font-medium font-mono text-zinc-900 dark:text-white">
                {policy.actionCount}
              </p>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <Link
            href={`/subscribe?policy=${encodeURIComponent(policy.name)}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded font-mono text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <Bell className="w-4 h-4" />
            Subscribe to updates
          </Link>
        </div>
      </div>

      {policy.securitySignals &&
        (policy.securitySignals.accessAnalyzerFindingCount > 0 ||
          policy.securitySignals.pathfindingOverlaps.length > 0) && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded flex-shrink-0">
                <Shield className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
              </div>
              <div className="space-y-3 min-w-0 flex-1">
                <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
                  Security signals
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Summary of static signals from the{" "}
                  <Link
                    href="/findings"
                    className="text-red-600 dark:text-red-400 hover:underline font-medium"
                  >
                    security findings
                  </Link>{" "}
                  page. Path overlap is action-level coverage in this JSON only,
                  not proof of escalation in your account.
                </p>
                {policy.securitySignals.accessAnalyzerFindingCount > 0 && (
                  <div>
                    <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 mb-1">
                      AWS Access Analyzer
                    </p>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">
                      {policy.securitySignals.accessAnalyzerFindingCount}{" "}
                      finding
                      {policy.securitySignals.accessAnalyzerFindingCount !== 1
                        ? "s"
                        : ""}{" "}
                      on this policy.{" "}
                      <Link
                        href="/findings"
                        className="text-red-600 dark:text-red-400 hover:underline font-mono text-xs"
                      >
                        View on Security findings
                      </Link>
                    </p>
                  </div>
                )}
                {policy.securitySignals.pathfindingOverlaps.length > 0 && (
                  <div>
                    <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 mb-2">
                      pathfinding.cloud (documented paths)
                    </p>
                    <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                      {policy.securitySignals.pathfindingOverlaps.map((o) => (
                        <li key={o.pathId}>
                          <a
                            href={o.pathfindingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-mono text-violet-600 dark:text-violet-400 hover:underline"
                          >
                            {o.pathId}
                          </a>
                          <span className="text-zinc-500 dark:text-zinc-400 text-xs ml-2">
                            {o.category}
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-400 text-xs block truncate">
                            {o.pathName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Policy Content */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
            Policy Document
          </h2>
          <a
            href={`https://github.com/zoph-io/IAMTrail/blob/master/policies/${policy.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-red-600 dark:text-red-400 hover:underline"
          >
            View on GitHub
          </a>
        </div>
        <div className="overflow-hidden">
          <SyntaxHighlighter
            language="json"
            style={isDark ? vscDarkPlus : vs}
            showLineNumbers={true}
            wrapLines={true}
            renderer={iamActionRenderer}
            customStyle={{
              margin: 0,
              borderRadius: 0,
              fontSize: "0.8rem",
              lineHeight: "1.5",
              background: isDark ? "#18181b" : "#fafafa",
            }}
            lineNumberStyle={{
              minWidth: "3.5em",
              paddingRight: "1em",
              color: isDark ? "#52525b" : "#a1a1aa",
              userSelect: "none",
              textAlign: "right",
            }}
            codeTagProps={{
              style: {
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              },
            }}
          >
            {JSON.stringify(policy.content, null, 2)}
          </SyntaxHighlighter>
        </div>
      </div>

      {/* Version History */}
      {policy.history && policy.history.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
              Version History ({policy.history.length} recorded)
            </h2>
            <a
              href={`https://github.com/zoph-io/IAMTrail/commits/master/policies/${policy.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-red-600 dark:text-red-400 hover:underline"
            >
              Raw history
            </a>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {policy.history.slice(0, visibleVersions).map((version) =>
              version.delta ? (
                <ChangeCard
                  key={version.hash}
                  change={version.delta}
                  hidePolicyName
                />
              ) : (
                <div key={version.hash} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-900 dark:text-white">
                        {version.message}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        No recorded action delta - this version predates the
                        change index.{" "}
                        <a
                          href={`https://github.com/zoph-io/IAMTrail/commit/${version.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 dark:text-red-400 hover:underline"
                        >
                          View the raw diff
                        </a>
                        .
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                        {getRelativeTime(version.date)}
                      </p>
                      <a
                        href={`https://github.com/zoph-io/IAMTrail/commit/${version.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                      >
                        {version.hash.substring(0, 7)}
                      </a>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
          {policy.history.length > visibleVersions && (
            <button
              onClick={() => setVisibleVersions((n) => n + VERSIONS_PAGE_SIZE)}
              className="w-full px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              Load more ({policy.history.length - visibleVersions} older{" "}
              {policy.history.length - visibleVersions === 1
                ? "version"
                : "versions"}
              )
            </button>
          )}
        </div>
      )}
    </div>
  );
}

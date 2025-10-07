"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";

// Get base path based on deployment target
const basePath = process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "";

interface PolicyVersion {
  hash: string;
  date: string;
  message: string;
  author: string;
}

interface PolicyData {
  name: string;
  createDate: string | null;
  versionId: string | null;
  lastModified: string;
  versionsCount: number;
  size: number;
  history: PolicyVersion[];
  content: any;
}

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

  // Detect dark mode
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
        const basePath = process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "";
        const response = await fetch(
          `${basePath}/data/${encodeURIComponent(decodedName)}.json`
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

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
    return `${Math.floor(diffInDays / 365)} years ago`;
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin text-6xl mb-4">⏳</div>
        <p className="text-slate-600 dark:text-slate-400">Loading policy...</p>
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Policy Not Found
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          {error || "The requested policy could not be found."}
        </p>
        <Link
          href={`${basePath}/policies`}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          ← Back to Policies
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
        <Link
          href={`${basePath}/`}
          className="hover:text-slate-900 dark:hover:text-white"
        >
          Home
        </Link>
        <span>/</span>
        <Link
          href={`${basePath}/policies`}
          className="hover:text-slate-900 dark:hover:text-white"
        >
          Policies
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-white truncate">
          {policy.name}
        </span>
      </nav>

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
          {policy.name}
        </h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              Last Modified
            </p>
            <p className="font-medium text-slate-900 dark:text-white">
              {getRelativeTime(policy.lastModified)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatDate(policy.lastModified)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              Version
            </p>
            <p className="font-medium text-slate-900 dark:text-white">
              {policy.versionId || "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              Total Versions
            </p>
            <p className="font-medium text-slate-900 dark:text-white">
              {policy.versionsCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              Created
            </p>
            <p className="font-medium text-slate-900 dark:text-white">
              {policy.createDate
                ? new Date(policy.createDate).toLocaleDateString()
                : "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* Policy Content */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Policy Document
          </h2>
          <a
            href={`https://github.com/z0ph/MAMIP/blob/master/policies/${policy.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View on GitHub →
          </a>
        </div>
        <div className="overflow-hidden">
          <SyntaxHighlighter
            language="json"
            style={isDark ? vscDarkPlus : vs}
            showLineNumbers={true}
            wrapLines={true}
            customStyle={{
              margin: 0,
              borderRadius: 0,
              fontSize: "0.875rem",
              lineHeight: "1.5",
              background: isDark ? "#1e293b" : "#f8fafc",
            }}
            lineNumberStyle={{
              minWidth: "3.5em",
              paddingRight: "1em",
              color: isDark ? "#64748b" : "#94a3b8",
              userSelect: "none",
              textAlign: "right",
            }}
            codeTagProps={{
              style: {
                fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
              },
            }}
          >
            {JSON.stringify(policy.content, null, 2)}
          </SyntaxHighlighter>
        </div>
      </div>

      {/* Version History */}
      {policy.history && policy.history.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Version History ({policy.versionsCount} total)
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {policy.history.map((version) => (
              <div
                key={version.hash}
                className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                        {version.hash.substring(0, 7)}
                      </span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {version.author}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-500">
                        {getRelativeTime(version.date)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-900 dark:text-white">
                      {version.message}
                    </p>
                  </div>
                  <a
                    href={`https://github.com/z0ph/MAMIP/commit/${version.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 text-blue-600 dark:text-blue-400 hover:underline text-sm"
                  >
                    View diff →
                  </a>
                </div>
              </div>
            ))}
          </div>
          {policy.versionsCount > policy.history.length && (
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 text-center">
              <a
                href={`https://github.com/z0ph/MAMIP/commits/master/policies/${policy.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View all {policy.versionsCount} versions on GitHub →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

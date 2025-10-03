"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";

interface Policy {
  name: string;
  lastModified: string;
  createDate: string | null;
  versionsCount: number;
  versionId: string | null;
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "modified" | "versions">(
    "modified"
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPolicies() {
      try {
        const basePath = process.env.NODE_ENV === "production" ? "/MAMIP" : "";
        const response = await fetch(`${basePath}/data/summary.json`);
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

  const filteredAndSortedPolicies = useMemo(() => {
    let filtered = policies.filter((policy) =>
      policy.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
  }, [policies, searchTerm, sortBy]);

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
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}mo ago`;
    return `${Math.floor(diffInDays / 365)}y ago`;
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin text-6xl mb-4">⏳</div>
        <p className="text-slate-600 dark:text-slate-400">
          Loading policies...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          All Policies
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Browse and search {policies.length} AWS Managed IAM Policies
        </p>
      </div>

      {/* Search and Filter */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-slate-400"
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
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search policies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="modified">Recently Modified</option>
              <option value="name">Name (A-Z)</option>
              <option value="versions">Most Versions</option>
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Showing {filteredAndSortedPolicies.length} of {policies.length}{" "}
          policies
        </div>
      </div>

      {/* Policies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAndSortedPolicies.map((policy) => (
          <Link
            key={policy.name}
            href={`${
              process.env.NODE_ENV === "production" ? "/MAMIP" : ""
            }/policies/${encodeURIComponent(policy.name)}`}
            className="group bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-600 transition-all transform hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                {policy.name}
              </h3>
              <svg
                className="w-5 h-5 text-slate-400 flex-shrink-0 ml-2 group-hover:text-blue-500 transition-colors"
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
            <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
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
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            No policies found
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            Try adjusting your search term
          </p>
        </div>
      )}
    </div>
  );
}

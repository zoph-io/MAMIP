"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import RelatedPages from "@/components/RelatedPages";

type AccessAnalyzerFindingType =
  | "ERROR"
  | "SECURITY_WARNING"
  | "WARNING"
  | "SUGGESTION";

interface AccessAnalyzerFinding {
  source: "access_analyzer";
  findingType: AccessAnalyzerFindingType;
  findingDetails: string;
  issueCode: string;
  learnMoreLink: string;
}

interface PathfindingFinding {
  source: "pathfinding";
  findingType: "DOCUMENTED_PATH";
  findingDetails: string;
  issueCode: string;
  learnMoreLink: string;
  pathId: string;
  pathName: string;
  pathCategory: string;
}

interface PolicyAccessAnalyzerRow {
  name: string;
  findings: AccessAnalyzerFinding[];
}

interface PolicyPathfindingRow {
  name: string;
  findings: PathfindingFinding[];
}

interface FindingsData {
  lastUpdated: string;
  totalPoliciesAnalyzed: number;
  accessAnalyzer: {
    policiesWithFindings: number;
    totalFindingRows: number;
    byType: Record<string, number>;
    policies: PolicyAccessAnalyzerRow[];
  };
  pathfinding: {
    attribution: string;
    catalogLastUpdated: string | null;
    pathsInCatalog: number;
    policiesWithOverlaps: number;
    totalOverlaps: number;
    byCategory: Record<string, number>;
    policies: PolicyPathfindingRow[];
  };
}

type SourceTab = "access_analyzer" | "pathfinding";

const SEVERITY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; sortOrder: number }
> = {
  ERROR: {
    label: "Error",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    sortOrder: 0,
  },
  SECURITY_WARNING: {
    label: "Security Warning",
    color: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-800",
    sortOrder: 1,
  },
  WARNING: {
    label: "Warning",
    color: "text-yellow-700 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    border: "border-yellow-200 dark:border-yellow-800",
    sortOrder: 2,
  },
  SUGGESTION: {
    label: "Suggestion",
    color: "text-zinc-600 dark:text-zinc-400",
    bg: "bg-zinc-50 dark:bg-zinc-800",
    border: "border-zinc-200 dark:border-zinc-700",
    sortOrder: 3,
  },
  DOCUMENTED_PATH: {
    label: "Documented path",
    color: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    sortOrder: 4,
  },
};

function SeverityBadge({ type }: { type: string }) {
  const config = SEVERITY_CONFIG[type] || SEVERITY_CONFIG.SUGGESTION;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${config.bg} ${config.color} border ${config.border}`}
    >
      {config.label}
    </span>
  );
}

function isLegacyFindingsData(raw: unknown): raw is {
  policies: {
    name: string;
    findings: {
      findingType: string;
      findingDetails: string;
      issueCode: string;
      learnMoreLink: string;
    }[];
  }[];
  byType: Record<string, number>;
  policiesWithFindings: number;
} {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    Array.isArray(o.policies) &&
    o.accessAnalyzer === undefined &&
    o.pathfinding === undefined
  );
}

function normalizeFindingsPayload(raw: unknown): FindingsData | null {
  if (!raw || typeof raw !== "object") return null;
  if (isLegacyFindingsData(raw)) {
    const byType = raw.byType || {};
    return {
      lastUpdated:
        (raw as { lastUpdated?: string }).lastUpdated ||
        new Date().toISOString().split("T")[0],
      totalPoliciesAnalyzed:
        (raw as { totalPoliciesAnalyzed?: number }).totalPoliciesAnalyzed || 0,
      accessAnalyzer: {
        policiesWithFindings: raw.policiesWithFindings || 0,
        totalFindingRows: Object.values(byType).reduce(
          (a: number, b) => a + (typeof b === "number" ? b : 0),
          0
        ),
        byType,
        policies: raw.policies.map((p) => ({
          name: p.name,
          findings: p.findings.map((f) => ({
            source: "access_analyzer" as const,
            findingType: f.findingType as AccessAnalyzerFindingType,
            findingDetails: f.findingDetails,
            issueCode: f.issueCode,
            learnMoreLink: f.learnMoreLink,
          })),
        })),
      },
      pathfinding: {
        attribution: "",
        catalogLastUpdated: null,
        pathsInCatalog: 0,
        policiesWithOverlaps: 0,
        totalOverlaps: 0,
        byCategory: {},
        policies: [],
      },
    };
  }
  return raw as FindingsData;
}

export default function FindingsPage() {
  const [data, setData] = useState<FindingsData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [pathCategoryFilter, setPathCategoryFilter] = useState<string>("ALL");
  const [sourceTab, setSourceTab] = useState<SourceTab>("access_analyzer");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFindings() {
      try {
        const response = await fetch("/data/findings.json");
        const json = await response.json();
        setData(normalizeFindingsPayload(json));
      } catch (error) {
        console.error("Error loading findings:", error);
      } finally {
        setLoading(false);
      }
    }
    loadFindings();
  }, []);

  const pathCategories = useMemo(() => {
    if (!data) return [] as string[];
    return Object.keys(data.pathfinding.byCategory || {}).sort();
  }, [data]);

  const filteredPolicies = useMemo(() => {
    if (!data) return [];

    if (sourceTab === "access_analyzer") {
      return data.accessAnalyzer.policies
        .map((policy) => {
          const matchedFindings = policy.findings.filter((f) => {
            const matchesSeverity =
              severityFilter === "ALL" || f.findingType === severityFilter;
            const matchesSearch =
              searchTerm === "" ||
              policy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              f.issueCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
              f.findingDetails.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesSeverity && matchesSearch;
          });
          if (matchedFindings.length === 0) return null;
          return { ...policy, findings: matchedFindings };
        })
        .filter(Boolean) as PolicyAccessAnalyzerRow[];
    }

    return data.pathfinding.policies
      .map((policy) => {
        const matchedFindings = policy.findings.filter((f) => {
          const matchesCategory =
            pathCategoryFilter === "ALL" ||
            f.pathCategory === pathCategoryFilter;
          const matchesSearch =
            searchTerm === "" ||
            policy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.issueCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.pathName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.pathId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.findingDetails.toLowerCase().includes(searchTerm.toLowerCase());
          return matchesCategory && matchesSearch;
        });
        if (matchedFindings.length === 0) return null;
        return { ...policy, findings: matchedFindings };
      })
      .filter(Boolean) as PolicyPathfindingRow[];
  }, [data, searchTerm, severityFilter, pathCategoryFilter, sourceTab]);

  const totalFilteredFindings = useMemo(
    () => filteredPolicies.reduce((sum, p) => sum + p.findings.length, 0),
    [filteredPolicies]
  );

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-zinc-300 border-t-red-600 rounded-full mb-4"></div>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm font-mono">
          Loading findings...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">
          No findings data available.
        </p>
      </div>
    );
  }

  const aa = data.accessAnalyzer;
  const pf = data.pathfinding;

  return (
    <div className="space-y-6">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Security findings
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl">
          Signals on AWS managed policies in this archive:{" "}
          <strong className="text-zinc-800 dark:text-zinc-200">
            IAM Access Analyzer
          </strong>{" "}
          validation (AWS tooling) and{" "}
          <strong className="text-zinc-800 dark:text-zinc-200">
            action-level overlap
          </strong>{" "}
          with documented privilege escalation paths from{" "}
          <a
            href="https://pathfinding.cloud/paths/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-600 dark:text-red-400 hover:underline font-medium"
          >
            pathfinding.cloud
          </a>{" "}
          (open source). Path overlap does not prove escalation in your
          account. It only means the published policy JSON allows the IAM
          actions those paths list as required.
        </p>
        <p className="mt-2 text-xs font-mono text-zinc-400 dark:text-zinc-500">
          Last updated: {data.lastUpdated}
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-4"
        role="tablist"
        aria-label="Finding source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={sourceTab === "access_analyzer"}
          onClick={() => {
            setSourceTab("access_analyzer");
            setSeverityFilter("ALL");
          }}
          className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${
            sourceTab === "access_analyzer"
              ? "bg-red-600 text-white"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          AWS Access Analyzer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sourceTab === "pathfinding"}
          onClick={() => {
            setSourceTab("pathfinding");
            setPathCategoryFilter("ALL");
          }}
          className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${
            sourceTab === "pathfinding"
              ? "bg-violet-600 text-white"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          pathfinding.cloud paths
        </button>
      </div>

      {sourceTab === "access_analyzer" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() =>
              setSeverityFilter(severityFilter === "ERROR" ? "ALL" : "ERROR")
            }
            className={`bg-white dark:bg-zinc-900 rounded-lg border p-4 text-left transition-all hover:border-red-300 dark:hover:border-red-800 ${
              severityFilter === "ERROR"
                ? "ring-2 ring-red-500 border-red-300 dark:border-red-700"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <p className="text-xs font-mono uppercase tracking-wider text-red-600 dark:text-red-400">
              Errors
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              {aa.byType.ERROR || 0}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-500">
              Invalid policy elements
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setSeverityFilter(
                severityFilter === "SECURITY_WARNING" ? "ALL" : "SECURITY_WARNING"
              )
            }
            className={`bg-white dark:bg-zinc-900 rounded-lg border p-4 text-left transition-all hover:border-orange-300 dark:hover:border-orange-800 ${
              severityFilter === "SECURITY_WARNING"
                ? "ring-2 ring-orange-500 border-orange-300 dark:border-orange-700"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <p className="text-xs font-mono uppercase tracking-wider text-orange-600 dark:text-orange-400">
              Security Warnings
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              {aa.byType.SECURITY_WARNING || 0}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-500">
              Potential security risks
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setSeverityFilter(severityFilter === "WARNING" ? "ALL" : "WARNING")
            }
            className={`bg-white dark:bg-zinc-900 rounded-lg border p-4 text-left transition-all hover:border-yellow-300 dark:hover:border-yellow-800 ${
              severityFilter === "WARNING"
                ? "ring-2 ring-yellow-500 border-yellow-300 dark:border-yellow-700"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <p className="text-xs font-mono uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
              Warnings
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              {aa.byType.WARNING || 0}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-500">
              General policy issues
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setSeverityFilter(
                severityFilter === "SUGGESTION" ? "ALL" : "SUGGESTION"
              )
            }
            className={`bg-white dark:bg-zinc-900 rounded-lg border p-4 text-left transition-all hover:border-zinc-300 dark:hover:border-zinc-600 ${
              severityFilter === "SUGGESTION"
                ? "ring-2 ring-zinc-400 border-zinc-300 dark:border-zinc-600"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <p className="text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Suggestions
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              {aa.byType.SUGGESTION || 0}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-500">
              Improvement opportunities
            </p>
          </button>
        </div>
      )}

      {sourceTab === "pathfinding" && (
        <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900 rounded-lg p-4 space-y-2">
          <p className="text-sm text-violet-900 dark:text-violet-200 leading-relaxed">
            {pf.attribution}{" "}
            <a
              href="https://pathfinding.cloud/paths/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Browse paths and visualizations
            </a>
            . Matching uses required IAM actions only (including{" "}
            <code className="text-xs bg-violet-100 dark:bg-violet-900/50 px-1 rounded">
              service:*
            </code>{" "}
            wildcards on Allow, not partial patterns like{" "}
            <code className="text-xs bg-violet-100 dark:bg-violet-900/50 px-1 rounded">
              iam:Get*
            </code>
            ).
          </p>
          <p className="text-xs font-mono text-violet-800/80 dark:text-violet-300/80">
            Catalog paths used: {pf.pathsInCatalog.toLocaleString()}
            {pf.catalogLastUpdated
              ? ` · Latest path update in snapshot: ${pf.catalogLastUpdated}`
              : ""}{" "}
            · Policy-path pairs: {pf.totalOverlaps.toLocaleString()}
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
        <span>
          <strong className="text-zinc-900 dark:text-white">
            {data.totalPoliciesAnalyzed.toLocaleString()}
          </strong>{" "}
          policies in archive
        </span>
        {sourceTab === "access_analyzer" ? (
          <>
            <span>
              <strong className="text-zinc-900 dark:text-white">
                {aa.policiesWithFindings}
              </strong>{" "}
              with ≥1 Analyzer finding
            </span>
            <span>
              <strong className="text-zinc-900 dark:text-white">
                {aa.totalFindingRows}
              </strong>{" "}
              Analyzer rows
            </span>
          </>
        ) : (
          <>
            <span>
              <strong className="text-zinc-900 dark:text-white">
                {pf.policiesWithOverlaps}
              </strong>{" "}
              policies with ≥1 path overlap
            </span>
            <span>
              <strong className="text-zinc-900 dark:text-white">
                {pf.totalOverlaps}
              </strong>{" "}
              overlaps
            </span>
          </>
        )}
      </div>

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
                placeholder={
                  sourceTab === "access_analyzer"
                    ? "Search policy, issue code, or description..."
                    : "Search policy, path id, path name, or description..."
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          {sourceTab === "access_analyzer" ? (
            <div>
              <select
                className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <option value="ALL">All severities</option>
                <option value="ERROR">Errors</option>
                <option value="SECURITY_WARNING">Security Warnings</option>
                <option value="WARNING">Warnings</option>
                <option value="SUGGESTION">Suggestions</option>
              </select>
            </div>
          ) : (
            <div>
              <select
                className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                value={pathCategoryFilter}
                onChange={(e) => setPathCategoryFilter(e.target.value)}
              >
                <option value="ALL">All path categories</option>
                {pathCategories.map((c) => (
                  <option key={c} value={c}>
                    {c} ({pf.byCategory[c] || 0})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="mt-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">
          Showing {totalFilteredFindings} row
          {totalFilteredFindings !== 1 ? "s" : ""} across{" "}
          {filteredPolicies.length} polic
          {filteredPolicies.length !== 1 ? "ies" : "y"}
        </div>
      </div>

      <div className="space-y-3">
        {sourceTab === "access_analyzer" &&
          (filteredPolicies as PolicyAccessAnalyzerRow[]).map((policy) => (
            <div
              key={policy.name}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex-shrink-0">
                    AWS
                  </span>
                  <Link
                    href={`/policies/${encodeURIComponent(policy.name)}`}
                    className="text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:underline transition-colors truncate"
                  >
                    {policy.name}
                  </Link>
                </div>
                <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                  {policy.findings.length} finding
                  {policy.findings.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {policy.findings
                  .sort(
                    (a, b) =>
                      (SEVERITY_CONFIG[a.findingType]?.sortOrder ?? 99) -
                      (SEVERITY_CONFIG[b.findingType]?.sortOrder ?? 99)
                  )
                  .map((finding, idx) => (
                    <div key={idx} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <SeverityBadge type={finding.findingType} />
                        <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {finding.issueCode}
                        </code>
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {finding.findingDetails}
                      </p>
                      {finding.learnMoreLink && (
                        <a
                          href={finding.learnMoreLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center mt-2 text-xs font-mono text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:underline transition-colors"
                        >
                          Learn more (AWS)
                          <svg
                            className="w-3 h-3 ml-1"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}

        {sourceTab === "pathfinding" &&
          (filteredPolicies as PolicyPathfindingRow[]).map((policy) => (
            <div
              key={policy.name}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-violet-500 flex-shrink-0">
                    pathfinding
                  </span>
                  <Link
                    href={`/policies/${encodeURIComponent(policy.name)}`}
                    className="text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:underline transition-colors truncate"
                  >
                    {policy.name}
                  </Link>
                </div>
                <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                  {policy.findings.length} path
                  {policy.findings.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {policy.findings.map((finding, idx) => (
                  <div key={idx} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <SeverityBadge type={finding.findingType} />
                      <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {finding.pathId}
                      </code>
                      <span className="text-xs font-mono text-zinc-500">
                        {finding.pathCategory}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 font-mono">
                      {finding.pathName}
                    </p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mt-1">
                      {finding.findingDetails}
                    </p>
                    {finding.learnMoreLink && (
                      <a
                        href={finding.learnMoreLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center mt-2 text-xs font-mono text-violet-600 dark:text-violet-400 hover:underline transition-colors"
                      >
                        View path and visualization
                        <svg
                          className="w-3 h-3 ml-1"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      {filteredPolicies.length === 0 && (
        <div className="text-center py-16">
          <h3 className="text-lg font-semibold font-mono text-zinc-900 dark:text-white mb-2">
            No rows match your filters
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Try another tab, search term, or filter
          </p>
        </div>
      )}

      <RelatedPages current="/findings" />
    </div>
  );
}

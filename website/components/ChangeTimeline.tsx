"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import ChangeCard from "@/components/ChangeCard";
import { isDiscovery, type PolicyChange } from "@/lib/changes";

const PAGE_SIZE = 25;

type Filter = "all" | "discoveries" | "permissions";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All changes" },
  { id: "discoveries", label: "Discoveries" },
  { id: "permissions", label: "Permissions management" },
];

/**
 * Renders from props first so the page paints and indexes without the network,
 * then swaps in the whole file once it arrives. Searching and filtering need
 * every change, and the full timeline is too heavy to inline in the HTML.
 */
export default function ChangeTimeline({
  initialChanges,
  total,
}: {
  initialChanges: PolicyChange[];
  total: number;
}) {
  const [changes, setChanges] = useState(initialChanges);
  const [loaded, setLoaded] = useState(initialChanges.length >= total);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    fetch("/data/changes.json")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setChanges(data.changes);
        setLoaded(true);
      })
      // Keep the server-rendered rows, but say so: a search box that silently
      // covers only the newest changes is worse than one that admits its range.
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  const q = query.trim().toLowerCase();

  const matched = useMemo(() => {
    return changes.filter((c) => {
      if (filter === "discoveries" && !isDiscovery(c)) return false;
      if (filter === "permissions" && c.permissionsManagement.length === 0) {
        return false;
      }
      if (!q) return true;
      if (c.policyName.toLowerCase().includes(q)) return true;
      if (c.services.some((s) => s.includes(q))) return true;
      return [...c.actionsAdded, ...c.actionsRemoved].some((a) =>
        a.toLowerCase().includes(q)
      );
    });
  }, [changes, q, filter]);

  const reset = (fn: () => void) => {
    fn();
    setVisible(PAGE_SIZE);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search a policy, service or action..."
            value={query}
            onChange={(e) => reset(() => setQuery(e.target.value))}
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none font-mono"
          />
          {query ? (
            <button
              onClick={() => reset(() => setQuery(""))}
              className="text-xs font-mono text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-zinc-100 dark:border-zinc-800">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => reset(() => setFilter(f.id))}
              className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                filter === f.id
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs font-mono text-zinc-500 dark:text-zinc-400">
            {matched.length.toLocaleString("en-US")}{" "}
            {matched.length === 1 ? "change" : "changes"}
            {loaded
              ? ""
              : failed
                ? " - the full timeline failed to load, showing the most recent only"
                : " - loading the full timeline"}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        {matched.length > 0 ? (
          <>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {matched.slice(0, visible).map((c) => (
                <ChangeCard key={`${c.sha}:${c.policyName}`} change={c} />
              ))}
            </div>
            {matched.length > visible ? (
              <button
                onClick={() => setVisible((n) => n + PAGE_SIZE)}
                className="w-full px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                Load more ({(matched.length - visible).toLocaleString("en-US")}{" "}
                remaining)
              </button>
            ) : null}
          </>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No change matches this filter.
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Radar, Search, Sparkles } from "lucide-react";
import { iamActionToSlug } from "@/lib/actionSlug";

export type ServiceDiscovery = {
  prefix: string;
  firstSeen: string;
  firstPolicy: string;
  actionCount: number;
};

export type ActionDiscovery = {
  action: string;
  firstSeen: string;
  firstPolicy: string;
  hasPage: boolean;
};

const PAGE_SIZE = 30;

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

function LoadMore({
  remaining,
  onClick,
}: {
  remaining: number;
  onClick: () => void;
}) {
  if (remaining <= 0) return null;
  return (
    <button
      onClick={onClick}
      className="w-full px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
    >
      Load more ({remaining.toLocaleString("en-US")} remaining)
    </button>
  );
}

/**
 * The lists are rendered from props first, so the page paints and indexes without
 * waiting on the network, then swapped for the full file once it arrives. Only
 * the first rows ship in the HTML; searching thousands of sightings needs the
 * whole set, which is too heavy to inline.
 */
export default function DiscoveryExplorer({
  initialServices,
  initialActions,
  totalServices,
  totalActions,
}: {
  initialServices: ServiceDiscovery[];
  initialActions: ActionDiscovery[];
  totalServices: number;
  totalActions: number;
}) {
  const [services, setServices] = useState(initialServices);
  const [actions, setActions] = useState(initialActions);
  const [loaded, setLoaded] = useState(
    initialServices.length >= totalServices &&
      initialActions.length >= totalActions
  );
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleServices, setVisibleServices] = useState(PAGE_SIZE);
  const [visibleActions, setVisibleActions] = useState(PAGE_SIZE);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    fetch("/data/discoveries.json")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setServices(data.services);
        setActions(data.actions);
        setLoaded(true);
      })
      // Keep the server-rendered rows on failure, but say so: otherwise the
      // search box would quietly cover only the newest sightings.
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  const q = query.trim().toLowerCase();

  const matchedServices = useMemo(() => {
    if (!q) return services;
    return services.filter(
      (s) =>
        s.prefix.toLowerCase().includes(q) ||
        s.firstPolicy.toLowerCase().includes(q)
    );
  }, [services, q]);

  const matchedActions = useMemo(() => {
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.action.toLowerCase().includes(q) ||
        a.firstPolicy.toLowerCase().includes(q)
    );
  }, [actions, q]);

  const onSearch = (value: string) => {
    setQuery(value);
    setVisibleServices(PAGE_SIZE);
    setVisibleActions(PAGE_SIZE);
  };

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search a prefix, action or policy..."
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none font-mono"
          />
          {query ? (
            <button
              onClick={() => onSearch("")}
              className="text-xs font-mono text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 text-xs font-mono text-zinc-500 dark:text-zinc-400">
          {matchedServices.length.toLocaleString("en-US")} service{" "}
          {matchedServices.length === 1 ? "prefix" : "prefixes"} and{" "}
          {matchedActions.length.toLocaleString("en-US")}{" "}
          {matchedActions.length === 1 ? "action" : "actions"}
          {q ? " match" : ""}
          {loaded
            ? ""
            : failed
              ? " - the full index failed to load, searching the most recent only"
              : " - loading the full index"}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <Radar className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
            New service prefixes
          </h2>
          <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 ml-auto">
            {Math.min(visibleServices, matchedServices.length).toLocaleString(
              "en-US"
            )}{" "}
            of {matchedServices.length.toLocaleString("en-US")}
          </span>
        </div>
        {matchedServices.length > 0 ? (
          <>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {matchedServices.slice(0, visibleServices).map((s) => (
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
            <LoadMore
              remaining={matchedServices.length - visibleServices}
              onClick={() => setVisibleServices((n) => n + PAGE_SIZE)}
            />
          </>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No service prefix matches {query}.
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
            {Math.min(visibleActions, matchedActions.length).toLocaleString(
              "en-US"
            )}{" "}
            of {matchedActions.length.toLocaleString("en-US")}
          </span>
        </div>
        {matchedActions.length > 0 ? (
          <>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {matchedActions.slice(0, visibleActions).map((a) => (
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
            <LoadMore
              remaining={matchedActions.length - visibleActions}
              onClick={() => setVisibleActions((n) => n + PAGE_SIZE)}
            />
          </>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No action matches {query}.
          </p>
        )}
      </div>
    </div>
  );
}

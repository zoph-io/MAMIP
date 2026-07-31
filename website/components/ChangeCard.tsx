"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Minus, Plus, Sparkles } from "lucide-react";
import { iamActionToSlug } from "@/lib/actionSlug";
import { isDiscovery, relativeDay, type PolicyChange } from "@/lib/changes";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  added: {
    label: "new policy",
    className:
      "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  },
  removed: {
    label: "policy removed",
    className:
      "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  },
  modified: {
    label: "updated",
    className:
      "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
  },
};

/** Linked when the action still exists somewhere, since only those have a page. */
function ActionList({ actions }: { actions: string[] }) {
  return (
    <span className="font-mono text-xs break-all">
      {actions.map((action, i) => (
        <span key={action}>
          {i > 0 ? ", " : ""}
          <Link
            href={`/actions/${iamActionToSlug(action)}`}
            className="hover:underline"
          >
            {action}
          </Link>
        </span>
      ))}
    </span>
  );
}

function Callout({
  tone,
  title,
  actions,
}: {
  tone: "discovery" | "permissions";
  title: string;
  actions: string[];
}) {
  const className =
    tone === "discovery"
      ? "bg-orange-50/70 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50 text-orange-800 dark:text-orange-300"
      : "bg-violet-50/70 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900/50 text-violet-800 dark:text-violet-300";
  return (
    <div className={`rounded border px-3 py-2 text-xs ${className}`}>
      <span className="font-semibold">{title}</span>
      {actions.length > 0 ? (
        <>
          {": "}
          <ActionList actions={actions} />
        </>
      ) : null}
    </div>
  );
}

/**
 * One change, rendered from the strings generate-data.js already produced.
 *
 * `compact` drops the expandable action lists for the homepage, where the point
 * is to show that the archive is moving rather than to audit a single diff.
 * `hidePolicyName` is for a policy's own version history, where repeating the
 * name on every row says nothing.
 */
export default function ChangeCard({
  change,
  compact = false,
  hidePolicyName = false,
}: {
  change: PolicyChange;
  compact?: boolean;
  hidePolicyName?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = STATUS_BADGE[change.status] || STATUS_BADGE.modified;
  const { phrases } = change;
  const hasActionLists =
    change.actionsAdded.length > 0 || change.actionsRemoved.length > 0;

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isDiscovery(change) ? (
              <Sparkles className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
            ) : null}
            {hidePolicyName ? null : (
              <Link
                href={`/policies/${encodeURIComponent(change.policyName)}`}
                className="text-sm font-medium text-zinc-900 dark:text-white hover:text-red-600 dark:hover:text-red-400 transition-colors break-all"
              >
                {change.policyName}
              </Link>
            )}
            {change.versionId ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                {change.versionId}
              </span>
            ) : null}
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {phrases.summary}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
            {relativeDay(change.date)}
          </p>
          <a
            href={change.commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
          >
            {change.sha.slice(0, 7)}
          </a>
        </div>
      </div>

      {phrases.newService || phrases.newActions || phrases.permissionsManagement ? (
        <div className="mt-3 space-y-1.5">
          {phrases.newService ? (
            <Callout
              tone="discovery"
              title={phrases.newService}
              actions={[]}
            />
          ) : null}
          {phrases.newActions ? (
            <Callout
              tone="discovery"
              title={phrases.newActions}
              actions={change.newActions}
            />
          ) : null}
          {phrases.permissionsManagement ? (
            <Callout
              tone="permissions"
              title={phrases.permissionsManagement}
              actions={change.permissionsManagement}
            />
          ) : null}
        </div>
      ) : null}

      {!compact && hasActionLists ? (
        <div className="mt-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-mono text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            {expanded ? "Hide actions" : "Show actions"}
          </button>
          {expanded ? (
            <div className="mt-2 space-y-2">
              {change.actionsAdded.length > 0 ? (
                <div className="flex items-start gap-2">
                  <Plus className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="text-zinc-700 dark:text-zinc-300">
                    <ActionList actions={change.actionsAdded} />
                  </div>
                </div>
              ) : null}
              {change.actionsRemoved.length > 0 ? (
                <div className="flex items-start gap-2">
                  <Minus className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
                  <div className="text-zinc-700 dark:text-zinc-300">
                    <ActionList actions={change.actionsRemoved} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

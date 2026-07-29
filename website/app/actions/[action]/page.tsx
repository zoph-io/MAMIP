import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookMarked, CalendarClock } from "lucide-react";
import {
  getActionDetail,
  getActionIndex,
  getServiceFirstSighting,
} from "@/lib/loadActionIndex";
import type { ActionDetail, FirstSighting } from "@/lib/loadActionIndex";
import {
  getActionDefinition,
  getActionDefinitionsMeta,
} from "@/lib/loadActionDefinitions";
import type { ActionDefinitionRow } from "@/lib/loadActionDefinitions";
import { iamActionToSlug, iamSlugToAction } from "@/lib/actionSlug";

const LIST_CAP = 30;

function accessLevelBadgeClass(level: string): string {
  const l = level.toLowerCase();
  if (l.includes("write") || l.includes("permissions"))
    return "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border-amber-200 dark:border-amber-800";
  if (l.includes("read") || l.includes("list") || l.includes("search"))
    return "bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 border-blue-200 dark:border-blue-800";
  if (l.includes("tagging"))
    return "bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200 border-violet-200 dark:border-violet-800";
  return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700";
}

function ActionReferenceCard({ def }: { def: ActionDefinitionRow }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <BookMarked className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
        <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
          Action reference
        </h2>
        <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 ml-auto">
          SAR-style (unofficial)
        </span>
      </div>
      <div className="px-5 py-4 space-y-4">
        {def.serviceName ? (
          <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
            Service:{" "}
            <span className="text-zinc-900 dark:text-white">{def.serviceName}</span>
          </p>
        ) : null}
        {def.accessLevel ? (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Access level
            </p>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${accessLevelBadgeClass(def.accessLevel)}`}
            >
              {def.accessLevel}
            </span>
          </div>
        ) : null}
        {def.description ? (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Description
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {def.description}
            </p>
          </div>
        ) : null}
        {def.resourceTypes.length > 0 ? (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Resource types
              {def.resourceTypes.length >= LIST_CAP
                ? ` (first ${LIST_CAP})`
                : null}
            </p>
            <ul className="text-xs font-mono text-zinc-600 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
              {def.resourceTypes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {def.dependentActions.length > 0 ? (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Dependent actions
              {def.dependentActions.length >= LIST_CAP
                ? ` (first ${LIST_CAP})`
                : null}
            </p>
            <ul className="text-xs font-mono text-zinc-600 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
              {def.dependentActions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FirstSeenCard({
  action,
  detail,
  service,
}: {
  action: string;
  detail: ActionDetail;
  service: FirstSighting | null;
}) {
  const prefix = action.split(":", 1)[0];

  // Same day as its whole service prefix means this action was part of the batch
  // that introduced the service, which is often AWS shipping the IAM component
  // ahead of the announcement. Never true for the 2019 import, where the date is
  // only the archive's floor.
  const introducedService =
    !!service &&
    !service.sinceStart &&
    !detail.sinceStart &&
    !!detail.firstSeen &&
    service.firstSeen === detail.firstSeen;

  // The service line only earns its place when it differs from the action's.
  const showService =
    !!service && !introducedService && service.firstSeen !== detail.firstSeen;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
        <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
          First seen
        </h2>
        <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 ml-auto">
          From archive history
        </span>
      </div>
      <div className="px-5 py-4 space-y-4">
        {detail.firstSeen ? (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              This action
            </p>
            {detail.sinceStart ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Already present when the archive began, on{" "}
                <span className="font-mono text-zinc-900 dark:text-white">
                  {detail.firstSeen}
                </span>
              </p>
            ) : (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-mono text-zinc-900 dark:text-white">
                  {detail.firstSeen}
                </span>
                {detail.firstPolicy ? (
                  <>
                    {" in "}
                    <Link
                      href={`/policies/${encodeURIComponent(detail.firstPolicy)}`}
                      className="font-mono text-red-600 dark:text-red-400 hover:underline"
                    >
                      {detail.firstPolicy}
                    </Link>
                  </>
                ) : null}
              </p>
            )}
            {introducedService ? (
              <p className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border-amber-200 dark:border-amber-800">
                Introduced the {prefix} service prefix
              </p>
            ) : null}
          </div>
        ) : null}
        {showService ? (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Service prefix{" "}
              {/* normal-case, since IAM prefixes are lowercase and the label is not */}
              <span className="normal-case text-zinc-700 dark:text-zinc-300">
                {prefix}
              </span>
            </p>
            {service.sinceStart ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Already present when the archive began
              </p>
            ) : (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-mono text-zinc-900 dark:text-white">
                  {service.firstSeen}
                </span>
                {service.firstPolicy ? (
                  <>
                    {" in "}
                    <Link
                      href={`/policies/${encodeURIComponent(service.firstPolicy)}`}
                      className="font-mono text-red-600 dark:text-red-400 hover:underline"
                    >
                      {service.firstPolicy}
                    </Link>
                  </>
                ) : null}
              </p>
            )}
          </div>
        ) : null}
        <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500">
          Earliest appearance in any AWS managed policy tracked here, not an
          official AWS launch date. Matched case-insensitively, as IAM does.
        </p>
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(process.cwd(), "public/data/action-index.json");
  if (!fs.existsSync(dataPath)) {
    console.warn("action-index.json missing; no /actions/* static params");
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  return Object.keys(raw.actions).map((action: string) => ({
    action: iamActionToSlug(action),
  }));
}

export async function generateMetadata(props: {
  params: Promise<{ action: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  let action: string;
  try {
    action = iamSlugToAction(params.action);
  } catch {
    action = params.action;
  }
  const slug = params.action;
  const def = getActionDefinition(action);
  let description = `Managed IAM policies that reference the ${action} action as a literal string (wildcards excluded). Unofficial data from IAMTrail.`;
  if (def?.description?.trim()) {
    const s = def.description.trim();
    const short = s.length > 118 ? `${s.slice(0, 115)}...` : s;
    description = `${short} Appearances in managed policies on IAMTrail (unofficial).`;
  }
  return {
    title: `${action} - IAM actions in AWS managed policies`,
    description,
    alternates: {
      canonical: `https://iamtrail.com/actions/${slug}`,
    },
    openGraph: {
      siteName: "IAMTrail",
      title: `${action} | IAMTrail`,
      description,
      url: `https://iamtrail.com/actions/${slug}`,
      images: ["/social.png"],
    },
  };
}

function PolicyLinks({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-zinc-500 dark:text-zinc-400">None</span>;
  }
  return (
    <ul className="space-y-1 text-sm font-mono">
      {names.map((name) => (
        <li key={name}>
          <Link
            href={`/policies/${encodeURIComponent(name)}`}
            className="text-red-600 dark:text-red-400 hover:underline"
          >
            {name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ActionDetailPage(props: {
  params: Promise<{ action: string }>;
}) {
  const params = await props.params;
  let action: string;
  try {
    action = iamSlugToAction(params.action);
  } catch {
    notFound();
  }
  const detail = getActionDetail(action);
  if (!detail) {
    notFound();
  }

  const idx = getActionIndex();
  const sarDef = getActionDefinition(action);
  const defsMeta = getActionDefinitionsMeta();
  const serviceSighting = getServiceFirstSighting(action);
  const allowN = detail.actionAllowPolicies.length;
  const denyN = detail.actionDenyPolicies.length;
  const notN = detail.notActionPolicies.length;
  const union = new Set([
    ...detail.actionAllowPolicies,
    ...detail.actionDenyPolicies,
    ...detail.notActionPolicies,
  ]);

  return (
    <div className="space-y-6">
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
        <span className="text-zinc-900 dark:text-white truncate">{action}</span>
      </nav>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2 break-all">
          {action}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Literal appearances in AWS managed IAM policies. Statements that use
          wildcards (for example{" "}
          <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
            s3:*
          </code>
          ) are not counted here. This is not an IAM authorization simulation.
        </p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-[10px] font-mono uppercase text-zinc-500">
              Policies (any)
            </p>
            <p className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
              {union.size}
            </p>
          </div>
          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-[10px] font-mono uppercase text-zinc-500">
              Allow (Action)
            </p>
            <p className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
              {allowN}
            </p>
          </div>
          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-[10px] font-mono uppercase text-zinc-500">
              Deny (Action)
            </p>
            <p className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
              {denyN}
            </p>
          </div>
          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-[10px] font-mono uppercase text-zinc-500">
              NotAction
            </p>
            <p className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
              {notN}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
          {idx.stats.policiesWithWildcardActions} policies include at least one
          wildcard action string (any service). Index regenerated on every
          deploy.
        </p>
      </div>

      {detail.firstSeen || serviceSighting ? (
        <FirstSeenCard
          action={action}
          detail={detail}
          service={serviceSighting}
        />
      ) : null}

      {sarDef ? <ActionReferenceCard def={sarDef} /> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
              Allow (Action)
            </h2>
          </div>
          <div className="px-5 py-4 max-h-[28rem] overflow-y-auto">
            <PolicyLinks names={detail.actionAllowPolicies} />
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
              Deny (Action)
            </h2>
          </div>
          <div className="px-5 py-4 max-h-[28rem] overflow-y-auto">
            <PolicyLinks names={detail.actionDenyPolicies} />
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white">
              NotAction
            </h2>
          </div>
          <div className="px-5 py-4 max-h-[28rem] overflow-y-auto">
            <PolicyLinks names={detail.notActionPolicies} />
          </div>
        </div>
      </div>

      {defsMeta ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-5 py-4">
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Thanks to{" "}
            <a
              href="https://github.com/iann0036"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 dark:text-red-400 font-medium hover:underline"
            >
              Ian McKay
            </a>{" "}
            for{" "}
            <a
              href={defsMeta.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 dark:text-red-400 font-medium hover:underline"
            >
              iam-dataset
            </a>{" "}
            ({defsMeta.sourceLicense}), structured data derived from the AWS
            Service Authorization Reference. Not maintained by AWS and not
            guaranteed current. IAMTrail&apos;s managed policy archive is
            separate.
          </p>
          <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 mt-2">
            Definitions bundle regenerated on every deploy
          </p>
        </div>
      ) : null}
    </div>
  );
}

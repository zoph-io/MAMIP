"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, X } from "lucide-react";
import RelatedPages from "@/components/RelatedPages";

const ACCOUNT_ID_LENGTH = 12;
const MIN_DIGITS = 3;
const MAX_LOOKUPS = 200;

interface KnownAccount {
  name: string;
  source?: string[];
  type?: string;
  accounts: string[];
  enabled?: boolean;
}

interface SearchResult {
  name: string;
  type?: string;
  accountId: string;
  sources: string[];
}

interface LookupGroup {
  query: string;
  matches: SearchResult[];
}

function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count === 1 ? singular : pluralForm || `${singular}s`}`;
}

/**
 * Pull account IDs out of whatever the visitor pasted. Every run of digits is a
 * candidate, so a CSV column, a newline-separated list and a full role ARN all
 * parse without asking anyone to clean up their clipboard first.
 */
function parseAccountIds(raw: string) {
  const ids: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const run of raw.match(/\d+/g) || []) {
    if (run.length > ACCOUNT_ID_LENGTH) {
      skipped++;
      continue;
    }
    if (run.length < MIN_DIGITS || seen.has(run)) continue;
    seen.add(run);
    ids.push(run);
  }

  return {
    ids: ids.slice(0, MAX_LOOKUPS),
    skipped,
    truncated: ids.length > MAX_LOOKUPS,
  };
}

export default function AccountsPage() {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<KnownAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/known-accounts.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load accounts data");
        return res.json();
      })
      .then((data) => {
        setAccounts(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const { ids, skipped, truncated } = useMemo(
    () => parseAccountIds(query),
    [query]
  );

  const groups = useMemo<LookupGroup[]>(() => {
    if (ids.length === 0) return [];

    const byQuery = new Map<string, SearchResult[]>(ids.map((id) => [id, []]));
    // A complete ID can only ever match itself, so it costs a set lookup rather
    // than a substring test against every account in the dataset.
    const complete = new Set(ids.filter((id) => id.length === ACCOUNT_ID_LENGTH));
    const partials = ids.filter((id) => id.length < ACCOUNT_ID_LENGTH);

    for (const entry of accounts) {
      for (const accountId of entry.accounts) {
        const matched: string[] = [];
        if (complete.has(accountId)) matched.push(accountId);
        for (const partial of partials) {
          if (accountId.includes(partial)) matched.push(partial);
        }
        if (matched.length === 0) continue;

        const result: SearchResult = {
          name: entry.name,
          type: entry.type,
          accountId,
          sources: entry.source || [],
        };
        for (const key of matched) byQuery.get(key)?.push(result);
      }
    }

    return ids.map((id) => ({ query: id, matches: byQuery.get(id) || [] }));
  }, [ids, accounts]);

  const totalAccounts = useMemo(() => {
    return accounts.reduce((sum, entry) => sum + entry.accounts.length, 0);
  }, [accounts]);

  const identified = groups.filter((group) => group.matches.length > 0).length;
  const unknown = groups.length - identified;
  const searched = ids.length > 0;
  const rows = Math.min(Math.max(query.split("\n").length, 3), 12);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          AWS Account Lookup
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl">
          Found unknown account IDs in your CloudTrail logs, S3 bucket policies,
          or IAM trust relationships? Paste one or a whole list here to identify
          the owners.
        </p>
      </div>

      {/* Search Box */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <label htmlFor="account-search" className="sr-only">
          AWS Account IDs
        </label>
        <div className="relative">
          <div className="absolute left-4 top-3.5 pointer-events-none">
            <Search className="h-4 w-4 text-zinc-400" />
          </div>
          <textarea
            id="account-search"
            placeholder="Paste one or more AWS Account IDs, one per line (e.g. 464622532012)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={rows}
            spellCheck={false}
            className="w-full pl-12 pr-10 py-3 text-base font-mono leading-6 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all resize-y"
            autoFocus
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear"
              className="absolute right-3 top-3 p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!loading && (
          <p className="mt-3 text-xs font-mono text-zinc-400 dark:text-zinc-500 text-center">
            {searched && (
              <span className="text-zinc-500 dark:text-zinc-400">
                {plural(ids.length, "account ID")} detected /{" "}
              </span>
            )}
            {accounts.length} vendors / {totalAccounts.toLocaleString()}{" "}
            known account IDs indexed
          </p>
        )}
        {(skipped > 0 || truncated) && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400 text-center">
            {skipped > 0 &&
              `${plural(skipped, "entry", "entries")} skipped, an AWS account ID is 12 digits. `}
            {truncated && `Only the first ${MAX_LOOKUPS} IDs are looked up.`}
          </p>
        )}
      </div>

      {/* Privacy & Security Notice */}
      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <svg className="w-4 h-4 text-zinc-400 dark:text-zinc-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-1.5">
              100% client-side search
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1.5">
              The entire accounts database is loaded into your browser. Your search queries never leave your device and no account IDs are sent to any server.
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Note: as per{" "}
              <a
                href="https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-identifiers.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 dark:text-red-400 hover:underline font-medium"
              >
                AWS documentation
              </a>
              , account IDs &quot;are not considered secret, sensitive, or confidential information.&quot;
            </p>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-zinc-300 border-t-red-600 rounded-full"></div>
          <p className="mt-4 text-zinc-500 dark:text-zinc-400 text-sm font-mono">
            Loading accounts database...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-5 text-center">
          <p className="text-red-700 dark:text-red-300 text-sm">
            Failed to load accounts data. Try refreshing the page.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && searched && (
        <div className="space-y-3">
          <p className="text-xs font-mono font-medium text-zinc-500 dark:text-zinc-400">
            {groups.length === 1
              ? `${plural(groups[0].matches.length, "match", "matches")} found`
              : `${identified} of ${plural(groups.length, "account ID")} identified`}
          </p>

          {groups.map((group) => (
            <div
              key={group.query}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 hover:border-red-300 dark:hover:border-red-800 transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <code
                  className={`px-2 py-0.5 rounded text-sm font-mono font-medium border ${
                    group.matches.length > 0
                      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  {group.query}
                </code>
                {group.matches.length === 0 && (
                  <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                    not in the known accounts database
                  </span>
                )}
                {group.query.length < ACCOUNT_ID_LENGTH &&
                  group.matches.length > 0 && (
                    <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                      partial ID, {plural(group.matches.length, "account")}{" "}
                      matched
                    </span>
                  )}
              </div>

              {group.matches.length > 0 && (
                <div className="mt-3 space-y-3">
                  {group.matches.map((result, idx) => (
                    <div
                      key={`${result.name}-${result.accountId}-${idx}`}
                      className="pt-3 border-t border-zinc-100 dark:border-zinc-800 first:pt-0 first:border-t-0"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                          {result.name}
                        </h3>
                        {result.type && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            {result.type}
                          </span>
                        )}
                        {result.accountId !== group.query && (
                          <code className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded text-xs font-mono border border-zinc-200 dark:border-zinc-700">
                            {result.accountId}
                          </code>
                        )}
                      </div>
                      {result.sources.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {result.sources.map((source, sIdx) => (
                            <a
                              key={sIdx}
                              href={source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs font-mono text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline truncate"
                            >
                              {source}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {unknown > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center">
              <h3 className="text-base font-semibold font-mono text-zinc-900 dark:text-white mb-2">
                {plural(unknown, "account ID")} not found
              </h3>
              <p className="text-zinc-500 dark:text-zinc-500 text-sm">
                Know who owns {unknown === 1 ? "it" : "them"}? Help the
                community by opening a PR.
              </p>
              <a
                href="https://github.com/fwdcloudsec/known_aws_accounts"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-mono font-medium rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                Submit a Pull Request
              </a>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && !searched && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400 text-sm">
            Paste one or more AWS account IDs above to search, one per line.
            Three digits is enough for a partial match.
          </p>
        </div>
      )}

      {/* AWS Trustline */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-1">
              AWS Trustline
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Map and audit third-party trust relationships in your AWS account.
              Trustline analyzes IAM role trust policies and S3 bucket policies,
              then cross-references account IDs against this known accounts
              dataset to identify vendors automatically.
            </p>
          </div>
          <a
            href="https://github.com/zoph-io/aws-trustline"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-mono font-medium rounded transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            View on GitHub
          </a>
        </div>
      </div>

      {/* Contribute CTA */}
      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-1">
              Know a vendor AWS account ID?
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              This is a community-driven dataset. If you know an AWS account ID
              belonging to an AWS service or third-party vendor, contribute it
              by opening a pull request.
            </p>
          </div>
          <a
            href="https://github.com/fwdcloudsec/known_aws_accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-mono font-medium rounded transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            Contribute on GitHub
          </a>
        </div>
      </div>

      {/* Data Attribution */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <div className="flex items-center gap-4">
          <a
            href="https://fwdcloudsec.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <img
              src="https://fwdcloudsec.org/assets/img/logo.svg"
              alt="fwd:cloudsec"
              className="h-8 w-auto dark:invert"
            />
          </a>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Powered by the{" "}
            <a
              href="https://github.com/fwdcloudsec/known_aws_accounts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              fwdcloudsec/known_aws_accounts
            </a>{" "}
            community dataset, maintained by the{" "}
            <a
              href="https://fwdcloudsec.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              fwd:cloudsec
            </a>{" "}
            cloud security community.
          </p>
        </div>
      </div>

      <RelatedPages current="/accounts" />
    </div>
  );
}

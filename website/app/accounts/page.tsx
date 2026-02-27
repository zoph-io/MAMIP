"use client";

import { useState, useEffect, useMemo } from "react";

const basePath =
  process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "";

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

export default function AccountsPage() {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<KnownAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${basePath}/data/known-accounts.json`)
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

  const results = useMemo<SearchResult[]>(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3) return [];

    const matches: SearchResult[] = [];
    for (const entry of accounts) {
      for (const accountId of entry.accounts) {
        if (accountId.includes(trimmed)) {
          matches.push({
            name: entry.name,
            type: entry.type,
            accountId,
            sources: entry.source || [],
          });
        }
      }
    }
    return matches;
  }, [query, accounts]);

  const totalAccounts = useMemo(() => {
    return accounts.reduce((sum, entry) => sum + entry.accounts.length, 0);
  }, [accounts]);

  const searched = query.trim().length >= 3;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center py-8">
        <a
          href="https://fwdcloudsec.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mb-6 hover:opacity-80 transition-opacity"
        >
          <img
            src="https://fwdcloudsec.org/assets/img/logo.svg"
            alt="fwd:cloudsec"
            className="h-32 w-auto mx-auto dark:invert"
          />
        </a>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
          <a
            href="https://fwdcloudsec.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            fwd:cloudsec
          </a>{" "}
          is a non-profit conference on cloud security. At this conference you
          can expect discussions about all the major cloud platforms, both attack
          and defense research, limitations of security features, the pros and
          cons of different security strategies, and generally the types of things
          cloud practitioners want to know, but that don't fit neatly into a
          vendor conference schedule.
        </p>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
          Known AWS Account Lookup
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Search for an AWS account ID to identify its owner. Powered by the{" "}
          <a
            href="https://github.com/fwdcloudsec/known_aws_accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            fwdcloudsec/known_aws_accounts
          </a>{" "}
          community dataset.
        </p>
      </div>

      {/* Search Box */}
      <div className="relative">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <label htmlFor="account-search" className="sr-only">
            AWS Account ID
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
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
              id="account-search"
              type="text"
              inputMode="numeric"
              placeholder="Paste an AWS Account ID (e.g. 464622532012)"
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full pl-12 pr-4 py-4 text-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              maxLength={12}
              autoFocus
            />
          </div>
          {!loading && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-center">
              {accounts.length} vendors &middot; {totalAccounts.toLocaleString()}{" "}
              known account IDs indexed
            </p>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-slate-300 border-t-blue-500 rounded-full"></div>
          <p className="mt-4 text-slate-500 dark:text-slate-400">
            Loading accounts database...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <p className="text-red-700 dark:text-red-300">
            Failed to load accounts data. Try refreshing the page.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && searched && (
        <div className="space-y-4">
          {results.length > 0 ? (
            <>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {results.length} match{results.length !== 1 ? "es" : ""} found
              </p>
              <div className="space-y-3">
                {results.map((result, idx) => (
                  <div
                    key={`${result.accountId}-${idx}`}
                    className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {result.name}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <code className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-sm font-mono font-medium">
                            {result.accountId}
                          </code>
                          {result.type && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              {result.type}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {result.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                          Documentation
                        </p>
                        <div className="space-y-1">
                          {result.sources.map((source, sIdx) => (
                            <a
                              key={sIdx}
                              href={source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline truncate"
                            >
                              {source}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No match found
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Account ID <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-sm font-mono">{query}</code>{" "}
                was not found in the known accounts database.
              </p>
              <p className="text-slate-500 dark:text-slate-500 text-sm mt-4">
                Know who owns this account? Help the community by opening a PR.
              </p>
              <a
                href="https://github.com/fwdcloudsec/known_aws_accounts"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
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

      {/* Empty State / Instructions */}
      {!loading && !error && !searched && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-3">☁️</div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Identify AWS Account Owners
          </h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md mx-auto">
            Enter at least 3 digits of an AWS account ID above to search. Useful
            for identifying vendors in CloudTrail logs, S3 bucket policies, or
            IAM trust relationships.
          </p>
        </div>
      )}

      {/* AWS Trustline */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              AWS Trustline
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            View on GitHub
          </a>
        </div>
      </div>

      {/* Contribute CTA */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-800/50 dark:to-blue-900/20 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              Know a vendor AWS account ID?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              This is a community-driven dataset. If you know an AWS account ID
              belonging to an AWS service or third-party vendor, contribute it
              by opening a pull request.
            </p>
          </div>
          <a
            href="https://github.com/fwdcloudsec/known_aws_accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            Contribute on GitHub
          </a>
        </div>
      </div>

      {/* Data Attribution */}
      <p className="text-center text-xs text-slate-500 dark:text-slate-500 pb-4">
        Account data sourced from{" "}
        <a
          href="https://github.com/fwdcloudsec/known_aws_accounts"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          fwdcloudsec/known_aws_accounts
        </a>
      </p>
    </div>
  );
}

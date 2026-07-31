"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Shield, Globe, Eye, Radar } from "lucide-react";
import { TELEGRAM_URL } from "@/lib/social";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.iamtrail.com";

type Topic = "iam_policies" | "discoveries" | "endpoints" | "guardduty";

const TOPIC_CONFIG: Record<Topic, { label: string; description: string; icon: typeof Shield }> = {
  iam_policies: {
    label: "IAM Policy Changes",
    description: "AWS Managed IAM Policy additions, modifications, and deprecations",
    icon: Shield,
  },
  discoveries: {
    label: "New Service Discoveries",
    description: "Actions and service prefixes never seen in any managed policy before, often the first public sign of an unannounced AWS service",
    icon: Radar,
  },
  endpoints: {
    label: "AWS Endpoint Changes",
    description: "Service and region availability changes from botocore",
    icon: Globe,
  },
  guardduty: {
    label: "GuardDuty Announcements",
    description: "New findings, updated findings, features, and regions",
    icon: Eye,
  },
};

interface Policy {
  name: string;
}

function SubscribeContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const urlError = searchParams.get("error");
  const preselectedPolicy = searchParams.get("policy");

  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "instant">("daily");
  // Discoveries is on by default: it is the one signal nobody else publishes,
  // and leaving it unchecked meant most subscribers never saw a new AWS service
  // land. Arriving with a specific policy in hand is the one narrow intent.
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>(
    preselectedPolicy
      ? ["iam_policies"]
      : ["iam_policies", "discoveries", "endpoints", "guardduty"]
  );
  const [allPolicies, setAllPolicies] = useState(!preselectedPolicy);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>(
    preselectedPolicy ? [preselectedPolicy] : []
  );
  const [policySearch, setPolicySearch] = useState("");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");

  if (status === "already_confirmed") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-4">
          Already confirmed
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          Your subscription is already active. Check your inbox for a previous
          email with your manage link, or request a new one below.
        </p>
        <ResendManageLink />
      </div>
    );
  }

  if (urlError === "invalid_token") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-4">
          Invalid or expired link
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          This confirmation link is no longer valid. It may have expired or
          already been used.
        </p>
        <div className="flex flex-col items-center gap-4">
          <Link
            href="/subscribe"
            className="px-5 py-2.5 bg-red-600 text-white rounded font-mono font-semibold text-sm hover:bg-red-700 transition-colors"
          >
            Subscribe again
          </Link>
          <div className="text-xs text-zinc-400 dark:text-zinc-500">or</div>
          <div className="w-full max-w-sm">
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
              Already subscribed? Get your manage link:
            </p>
            <ResendManageLink />
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    fetch("/data/summary.json")
      .then((res) => res.json())
      .then((data) => setPolicies(data.policies || []))
      .catch(() => {});
  }, []);

  const filteredPolicies = useMemo(() => {
    if (!policySearch.trim()) return policies.slice(0, 50);
    return policies
      .filter((p) =>
        p.name.toLowerCase().includes(policySearch.toLowerCase())
      )
      .slice(0, 50);
  }, [policies, policySearch]);

  const toggleTopic = (topic: Topic) => {
    setSelectedTopics((prev) =>
      prev.includes(topic)
        ? prev.filter((t) => t !== topic)
        : [...prev, topic]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          frequency,
          topics: selectedTopics,
          policies: selectedTopics.includes("iam_policies")
            ? (allPolicies ? ["*"] : selectedPolicies)
            : ["*"],
          company: honeypot,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const togglePolicy = (name: string) => {
    setSelectedPolicies((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const iamSelected = selectedTopics.includes("iam_policies");
  const canSubmit =
    selectedTopics.length > 0 &&
    (iamSelected ? allPolicies || selectedPolicies.length > 0 : true);

  if (success) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-4">
          Check your inbox
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
          We&apos;ve sent a confirmation email to{" "}
          <strong className="text-zinc-900 dark:text-white font-mono">{email}</strong>.
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Click the link in the email to activate your subscription. The link
          expires in 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Subscribe to IAMTrail
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Get notified about AWS Managed IAM Policy changes, endpoint
          availability updates, and GuardDuty announcements.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <label
            htmlFor="email"
            className="block text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-2"
          >
            Email address
          </label>
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0"
            style={{ left: "-9999px" }}
            aria-hidden="true"
          />
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        {/* Topics */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <label className="block text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-3">
            What to subscribe to
          </label>
          <div className="space-y-2">
            {(Object.keys(TOPIC_CONFIG) as Topic[]).map((topic) => {
              const config = TOPIC_CONFIG[topic];
              const Icon = config.icon;
              const checked = selectedTopics.includes(topic);
              return (
                <label
                  key={topic}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    checked
                      ? "border-red-500 bg-red-50/50 dark:bg-red-950/10"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTopic(topic)}
                    className="w-4 h-4 mt-0.5 rounded border-zinc-300 text-red-600 focus:ring-red-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-zinc-900 dark:text-white">
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 ml-6">
                      {config.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
          {selectedTopics.length === 0 && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-mono">
              Select at least one topic.
            </p>
          )}
          {TELEGRAM_URL && (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Prefer no email? Discoveries are also broadcast to a read-only{" "}
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 dark:text-red-400 hover:underline font-medium"
              >
                Telegram channel
              </a>
              .
            </p>
          )}
        </div>

        {/* Frequency */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <label className="block text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-3">
            Notification frequency
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setFrequency("instant")}
              className={`flex-1 py-2.5 px-4 rounded border-2 font-mono font-medium text-sm transition-all ${
                frequency === "instant"
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              Instant
            </button>
            <button
              type="button"
              onClick={() => setFrequency("daily")}
              className={`flex-1 py-2.5 px-4 rounded border-2 font-mono font-medium text-sm transition-all ${
                frequency === "daily"
                  ? "border-red-500 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setFrequency("weekly")}
              className={`flex-1 py-2.5 px-4 rounded border-2 font-mono font-medium text-sm transition-all ${
                frequency === "weekly"
                  ? "border-red-500 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              Weekly (Mondays)
            </button>
          </div>
          {frequency === "instant" && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 font-mono">
              Instant alerts are currently available for IAM Policy changes only
              (checks run every hour, Mon-Fri). Endpoint and GuardDuty
              updates are included in daily/weekly digests.
            </p>
          )}
        </div>

        {/* Policy Selection - only when IAM Policies topic is selected */}
        {iamSelected && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
            <label className="block text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-3">
              Which policies?
            </label>

            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={allPolicies}
                onChange={(e) => setAllPolicies(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">
                All policies
              </span>
              <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                ({policies.length} tracked)
              </span>
            </label>

            {!allPolicies && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={policySearch}
                  onChange={(e) => setPolicySearch(e.target.value)}
                  placeholder="Search policies..."
                  className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />

                {selectedPolicies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {selectedPolicies.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => togglePolicy(name)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-800"
                      >
                        {name}
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredPolicies.map((policy) => (
                    <label
                      key={policy.name}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPolicies.includes(policy.name)}
                        onChange={() => togglePolicy(policy.name)}
                        className="w-4 h-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                        {policy.name}
                      </span>
                    </label>
                  ))}
                  {filteredPolicies.length === 0 && (
                    <p className="px-4 py-3 text-sm text-zinc-500 text-center">
                      No policies match your search
                    </p>
                  )}
                </div>
                <p className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                  {selectedPolicies.length} selected
                  {filteredPolicies.length < policies.length &&
                    ` / Showing ${filteredPolicies.length} of ${policies.length}`}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full py-2.5 px-6 bg-red-600 text-white rounded font-mono font-semibold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Subscribing..." : "Subscribe"}
        </button>

      </form>

      {/* Privacy Notice */}
      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <svg className="w-4 h-4 text-zinc-400 dark:text-zinc-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          <div>
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-2">
              We take your privacy seriously
            </h3>
            <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <li>Your email is used <strong className="text-zinc-700 dark:text-zinc-300">only</strong> to send the notifications you subscribe to.</li>
              <li>We never share, sell, or give your email to third parties.</li>
              <li>No tracking, no marketing, no spam - just the updates you asked for.</li>
              <li>Double opt-in: you must confirm via email before anything is sent.</li>
              <li>Every email includes a one-click unsubscribe link. No account needed.</li>
              <li>Your data is stored in AWS (eu-west-1) and deleted immediately upon unsubscription.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Already subscribed? */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 text-center">
        <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-900 dark:text-white mb-2">
          Already subscribed?
        </h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
          Enter your email to receive a link to manage your subscription.
        </p>
        <ResendManageLink />
      </div>
    </div>
  );
}

function ResendManageLink() {
  const [email, setEmail] = useState("");
  const [resendHoneypot, setResendHoneypot] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API_URL}/resend-manage-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company: resendHoneypot }),
      });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <p className="text-xs font-mono text-green-600 dark:text-green-400">
        If that email is registered, a manage link has been sent.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 max-w-sm mx-auto">
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        value={resendHoneypot}
        onChange={(e) => setResendHoneypot(e.target.value)}
        className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0"
        style={{ left: "-9999px" }}
        aria-hidden="true"
      />
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="flex-1 min-w-0 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
      />
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded text-xs font-mono font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-50 transition-colors"
      >
        {loading ? "..." : "Send"}
      </button>
    </form>
  );
}

export default function SubscribePage() {
  return (
    <Suspense>
      <SubscribeContent />
    </Suspense>
  );
}

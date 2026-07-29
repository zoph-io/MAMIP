"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Shield, Globe, Eye, Radar } from "lucide-react";

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

interface Subscription {
  email: string;
  policies: string[];
  frequency: string;
  topics: Topic[];
  created_at: string;
  updated_at: string;
}

function ManageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const justConfirmed = searchParams.get("confirmed") === "true";
  const actionParam = searchParams.get("action");

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    justConfirmed ? "Subscription confirmed!" : null
  );
  const [unsubscribed, setUnsubscribed] = useState(false);

  const [frequency, setFrequency] = useState<"daily" | "weekly" | "instant">("daily");
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>(["iam_policies"]);
  const [allPolicies, setAllPolicies] = useState(true);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [policySearch, setPolicySearch] = useState("");
  const [policies, setPolicies] = useState<Policy[]>([]);

  useEffect(() => {
    fetch("/data/summary.json")
      .then((res) => res.json())
      .then((data) => setPolicies(data.policies || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("No subscription token provided.");
      return;
    }

    fetch(`${API_URL}/manage/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Subscription not found");
        return res.json();
      })
      .then((data: Subscription) => {
        setSubscription(data);
        setFrequency(data.frequency as "daily" | "weekly" | "instant");
        setSelectedTopics(data.topics || ["iam_policies"]);
        const isAll =
          data.policies.length === 1 && data.policies[0] === "*";
        setAllPolicies(isAll);
        if (!isAll) setSelectedPolicies(data.policies);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (actionParam === "unsubscribe" && subscription && token) {
      handleUnsubscribe();
    }
  }, [actionParam, subscription]);

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

  const togglePolicy = (name: string) => {
    setSelectedPolicies((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const iamSelected = selectedTopics.includes("iam_policies");
  const canSave =
    selectedTopics.length > 0 &&
    (iamSelected ? allPolicies || selectedPolicies.length > 0 : true);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_URL}/manage/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frequency,
          topics: selectedTopics,
          policies: iamSelected
            ? (allPolicies ? ["*"] : selectedPolicies)
            : ["*"],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }

      setSuccess("Subscription updated successfully.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/manage/${token}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to unsubscribe");
      setUnsubscribed(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-zinc-300 border-t-red-600 rounded-full mb-4"></div>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm font-mono">
          Loading subscription...
        </p>
      </div>
    );
  }

  if (unsubscribed) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-4">
          You&apos;ve been unsubscribed
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          You won&apos;t receive any more notifications from IAMTrail.
        </p>
        <Link
          href="/subscribe"
          className="inline-flex items-center px-5 py-2.5 bg-red-600 text-white rounded font-mono font-semibold text-sm hover:bg-red-700 transition-colors"
        >
          Re-subscribe
        </Link>
      </div>
    );
  }

  if (error && !subscription) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-xl font-bold font-mono text-zinc-900 dark:text-white mb-4">
          Invalid or expired link
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">{error}</p>
        <Link
          href="/subscribe"
          className="inline-flex items-center px-5 py-2.5 bg-red-600 text-white rounded font-mono font-semibold text-sm hover:bg-red-700 transition-colors"
        >
          Subscribe
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mb-2">
          Manage Subscription
        </h1>
        {subscription && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Subscribed as{" "}
            <strong className="text-zinc-900 dark:text-white font-mono">
              {subscription.email}
            </strong>
          </p>
        )}
      </div>

      {success && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-sm text-green-700 dark:text-green-300">
            {success}
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

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
          <p className="mt-3 text-xs font-mono text-amber-700 dark:text-amber-400">
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
              </div>
              <p className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                {selectedPolicies.length} selected
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="flex-1 py-2.5 px-6 bg-red-600 text-white rounded font-mono font-semibold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-800/50 rounded-lg p-5">
        <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-red-700 dark:text-red-400 mb-2">
          Unsubscribe
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Stop receiving all notifications from IAMTrail. This action is
          immediate.
        </p>
        <button
          onClick={handleUnsubscribe}
          disabled={saving}
          className="px-4 py-2 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 rounded text-xs font-mono font-medium hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition-colors"
        >
          Unsubscribe
        </button>
      </div>
    </div>
  );
}

export default function ManagePage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-16">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-zinc-300 border-t-red-600 rounded-full mb-4"></div>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm font-mono">Loading...</p>
        </div>
      }
    >
      <ManageContent />
    </Suspense>
  );
}

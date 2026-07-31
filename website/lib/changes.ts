/**
 * One policy change, as written by scripts/generate-data.js into
 * public/data/changes.json and into each per-policy history entry.
 *
 * Every human-readable string arrives pre-rendered in `phrases`, produced by
 * scripts/change-wording.js. Components must not compose their own wording for
 * these concepts: the vocabulary is shared with the notification Lambdas
 * (automation/lambdas/shared/policy_diff.py) and drifts the moment a fourth
 * place starts phrasing it too.
 */
export type ChangePhrases = {
  /** "3 actions added, 1 removed", or the no-delta wording. */
  summary: string;
  /** "New AWS service supportplans", empty when none. */
  newService: string;
  /** "8 never-before-seen actions", empty when none. */
  newActions: string;
  /** "2 permissions management, incl. iam:PassRole", empty when none. */
  permissionsManagement: string;
};

export type PolicyChange = {
  sha: string;
  date: string;
  policyName: string;
  versionId: string | null;
  status: "added" | "removed" | "modified";
  headline: string;
  summary: string;
  phrases: ChangePhrases;
  actionsAdded: string[];
  actionsRemoved: string[];
  newActions: string[];
  newServicePrefixes: string[];
  permissionsManagement: string[];
  services: string[];
  commitUrl: string;
};

export type ChangesFile = {
  schemaVersion: number;
  generatedAt: string;
  stats: {
    total: number;
    discoveries: number;
    permissionsManagement: number;
    oldest: string | null;
    newest: string | null;
  };
  changes: PolicyChange[];
};

/** Names something never seen anywhere in the archive before. */
export function isDiscovery(change: PolicyChange): boolean {
  return (
    change.newActions.length > 0 || change.newServicePrefixes.length > 0
  );
}

export function relativeDay(dateString: string): string {
  const then = new Date(dateString).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

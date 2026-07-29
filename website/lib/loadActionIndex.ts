import fs from "fs";
import path from "path";

/** Earliest appearance anywhere in the archive. Absent for pre-registry builds. */
export type FirstSighting = {
  /** YYYY-MM-DD */
  firstSeen: string;
  firstPolicy: string;
  /**
   * Already present in the archive's first commit, so firstSeen is when tracking
   * began rather than when AWS introduced it.
   */
  sinceStart?: boolean;
};

export type ActionDetail = {
  actionAllowPolicies: string[];
  actionDenyPolicies: string[];
  notActionPolicies: string[];
} & Partial<FirstSighting>;

export type ActionIndexFile = {
  schemaVersion: number;
  generatedAt: string;
  stats: {
    uniqueLiteralActionCount: number;
    policiesWithWildcardActions: number;
    wildcardPoliciesByService?: Record<string, number>;
  };
  effectiveGrantPreview: unknown;
  actions: Record<string, ActionDetail>;
  /** Keyed by lowercased service prefix, for example "nova-act". */
  services?: Record<string, FirstSighting>;
  /** YYYY-MM-DD of the archive's first commit. */
  archiveStart?: string;
};

let cached: ActionIndexFile | null | undefined;

function readIndex(): ActionIndexFile | null {
  if (cached !== undefined) return cached;
  const dataPath = path.join(process.cwd(), "public/data/action-index.json");
  if (!fs.existsSync(dataPath)) {
    cached = null;
    return null;
  }
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    cached = JSON.parse(raw) as ActionIndexFile;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function getActionDetail(action: string): ActionDetail | null {
  const idx = readIndex();
  if (!idx?.actions) return null;
  const detail = idx.actions[action];
  return detail ?? null;
}

/** First appearance of an action's whole service prefix, for example "nova-act". */
export function getServiceFirstSighting(action: string): FirstSighting | null {
  const idx = readIndex();
  const prefix = action.split(":", 1)[0].toLowerCase();
  return idx?.services?.[prefix] ?? null;
}

/** Call only when a matching action detail exists (same backing file). */
export function getActionIndex(): ActionIndexFile {
  const idx = readIndex();
  if (!idx) {
    throw new Error("action-index.json missing; run npm run generate-data");
  }
  return idx;
}

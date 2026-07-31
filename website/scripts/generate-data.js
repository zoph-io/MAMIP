const fs = require("fs");
const path = require("path");
const https = require("https");
const { simpleGit } = require("simple-git");
const yaml = require("js-yaml");
const { generateUsageStats } = require("./generate-usage-stats");
const wording = require("./change-wording");

const REPO_ROOT = path.join(__dirname, "../..");
const POLICIES_DIR = path.join(REPO_ROOT, "policies");
const FINDINGS_DIR = path.join(REPO_ROOT, "findings");
const PATHFINDING_PATHS_JSON = path.join(
  REPO_ROOT,
  "data/pathfinding/paths.json"
);
const ACTION_REGISTRY_JSON = path.join(REPO_ROOT, "data/action-registry.json");
const POLICY_DELTAS_JSON = path.join(
  REPO_ROOT,
  "data/policy-change-deltas.json"
);
const IAM_METADATA_JSON = path.join(REPO_ROOT, "data/iam-metadata.json");
const OUTPUT_DIR = path.join(__dirname, "../public/data");
const PUBLIC_DIR = path.join(__dirname, "../public");
const FEEDS_DIR = path.join(PUBLIC_DIR, "feeds");
const SITE_URL = "https://iamtrail.com";
const GITHUB_REPO = "https://github.com/zoph-io/IAMTrail";
const git = simpleGit(REPO_ROOT);

/** Map legacy git author names to IAMTrail for UI and exports. */
function displayAuthorName(name) {
  if (!name || typeof name !== "string") return name;
  const t = name.trim();
  if (/^mamip\s*bot$/i.test(t)) return "IAMTrail";
  if (/mamip-github-actions/i.test(t)) return "IAMTrail";
  return name;
}

/**
 * First-ever sighting of each IAM action and service prefix, from
 * data/action-registry.json (built by automation/scripts/build_action_registry.py).
 *
 * The registry replays the whole archive, so it knows when an action appeared for
 * the first time anywhere - which the per-policy git history cannot answer, since
 * a prefix new to AWS can arrive inside a policy that has existed since 2019.
 *
 * Keys are lowercased there because IAM matches actions case-insensitively and
 * AWS is inconsistent about it. Returns empty maps when the file is absent, so
 * the site still builds without it.
 *
 * Anything whose first sighting is the archive's own first commit is flagged
 * sinceStart: those actions already existed in 2019 when tracking began, so their
 * date is the archive's floor and says nothing about when AWS shipped them.
 */
function loadActionRegistry() {
  if (!fs.existsSync(ACTION_REGISTRY_JSON)) {
    console.log(
      "   ⚠️  No data/action-registry.json found, action pages will omit first-seen dates"
    );
    return { actions: {}, services: {}, actionLabels: {}, archiveStart: "" };
  }

  const raw = JSON.parse(fs.readFileSync(ACTION_REGISTRY_JSON, "utf8"));
  const entries = Object.entries(raw.entries || {});

  // Derived rather than hardcoded, so a rebased or re-imported archive stays right.
  let baseline = null;
  for (const [, value] of entries) {
    if (!baseline || (value.first_seen_at || "") < baseline.first_seen_at) {
      baseline = value;
    }
  }
  const baselineCommit = baseline ? baseline.first_commit_sha : "";
  const archiveStart = baseline ? baseline.first_seen_at.slice(0, 10) : "";

  const actions = {};
  const services = {};
  // Registry keys are lowercased because IAM is case-insensitive; this keeps the
  // casing AWS shipped, for display. Held apart from the sightings so it does not
  // get spread into every entry of the action index.
  const actionLabels = {};
  let sinceStartCount = 0;
  for (const [key, value] of entries) {
    // Day precision is all an action page shows, and it keeps the index small.
    const firstSeen = (value.first_seen_at || "").slice(0, 10);
    if (!firstSeen) continue;
    const sighting = { firstSeen, firstPolicy: value.first_policy || "" };
    if (value.first_commit_sha && value.first_commit_sha === baselineCommit) {
      sighting.sinceStart = true;
      sinceStartCount++;
    }
    if (key.startsWith("act#")) {
      actions[key.slice(4)] = sighting;
      actionLabels[key.slice(4)] = value.first_action || key.slice(4);
    } else if (key.startsWith("svc#")) {
      services[key.slice(4)] = sighting;
    }
  }
  console.log(
    `   🕵️  Action registry: first-seen for ${Object.keys(actions).length} actions, ` +
      `${Object.keys(services).length} services (${sinceStartCount} present at archive start ${archiveStart})`
  );
  return { actions, services, actionLabels, archiveStart };
}

/**
 * What each recent commit actually changed, from data/policy-change-deltas.json
 * (built by the same archive replay as the action registry).
 *
 * Keyed by "<sha>:<policyName>" because one commit can touch several policies.
 * Returns an empty map when the file is absent, so the feeds fall back to naming
 * the policy rather than failing the build.
 */
function loadPolicyChangeDeltas() {
  if (!fs.existsSync(POLICY_DELTAS_JSON)) {
    console.log(
      "   ⚠️  No data/policy-change-deltas.json found, feeds will omit action changes"
    );
    return new Map();
  }

  const raw = JSON.parse(fs.readFileSync(POLICY_DELTAS_JSON, "utf8"));
  const byCommit = new Map();
  for (const change of raw.changes || []) {
    if (!change.sha || !change.policyName) continue;
    byCommit.set(`${change.sha}:${change.policyName}`, change);
  }
  console.log(`   🧾 Change deltas: ${byCommit.size} recent policy changes`);
  return byCommit;
}

/**
 * Access levels and friendly service names, from data/iam-metadata.json.
 *
 * The same file ships inside the notification Lambdas, so a feed item and a post
 * about the same change describe it in the same words.
 */
function loadIamMetadata() {
  if (!fs.existsSync(IAM_METADATA_JSON)) {
    console.log(
      "   ⚠️  No data/iam-metadata.json found, feeds will show bare service prefixes"
    );
    return { permissionsManagement: new Set(), serviceNames: {} };
  }

  const raw = JSON.parse(fs.readFileSync(IAM_METADATA_JSON, "utf8"));
  return {
    permissionsManagement: new Set(raw.permissionsManagement || []),
    serviceNames: raw.serviceNames || {},
  };
}

function iamActionToSlug(action) {
  return Buffer.from(action, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location).then(resolve, reject);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/** Collect Allow actions from policy JSON (Deny / NotAction-only statements ignored for this signal). */
function extractAllowActionInfo(policyData) {
  const literals = new Set();
  const serviceWildcards = new Set();
  let globalWildcard = false;

  const statements = policyData.PolicyVersion?.Document?.Statement || [];
  const stmtArray = Array.isArray(statements) ? statements : [statements];
  for (const stmt of stmtArray) {
    if (stmt.Effect === "Deny") continue;
    if (!stmt.Action) continue;
    const raw = stmt.Action;
    const actionArray = Array.isArray(raw) ? raw : [raw];
    for (const action of actionArray) {
      if (typeof action !== "string") continue;
      const trimmed = action.trim();
      if (!trimmed) continue;
      if (trimmed === "*" || trimmed === "*:*") {
        globalWildcard = true;
        continue;
      }
      if (trimmed.includes("*")) {
        const m = /^([a-zA-Z0-9.-]+):\*$/.exec(trimmed);
        if (m) {
          serviceWildcards.add(m[1].toLowerCase());
        }
        continue;
      }
      literals.add(trimmed);
    }
  }
  return { literals, serviceWildcards, globalWildcard };
}

function policyAllowsAction(info, permission) {
  if (!permission || typeof permission !== "string") return false;
  if (info.globalWildcard) return true;
  if (info.literals.has(permission)) return true;
  const colon = permission.indexOf(":");
  if (colon <= 0) return false;
  const svc = permission.slice(0, colon).toLowerCase();
  return info.serviceWildcards.has(svc);
}

function pathRequiredPermissionsSatisfied(allowInfo, requiredEntries) {
  if (!Array.isArray(requiredEntries) || requiredEntries.length === 0) {
    return false;
  }
  for (const entry of requiredEntries) {
    const perm =
      typeof entry === "string" ? entry : entry && entry.permission;
    if (!perm || !policyAllowsAction(allowInfo, perm)) {
      return false;
    }
  }
  return true;
}

function pathfindingPathUrl(pathId) {
  return `https://pathfinding.cloud/paths/${encodeURIComponent(pathId)}`;
}

/**
 * Build per-policy git history from a SINGLE `git log --name-only` pass over
 * policies/ instead of spawning one `git log` subprocess per policy
 * (~1,566 sequential spawns, the dominant cost of data generation).
 *
 * Stored history entries are newest-first and capped at the 100 most recent
 * commits per policy (used for the changelog display). Modification counts and
 * first-seen dates are computed UNCAPPED from the same pass so they stay
 * accurate for policies with more than 100 commits, and bulk-reformat days are
 * detected here so every consumer shares one definition.
 *
 * Returns:
 * - historyByPolicy: Map<name, entries[]> (capped at 100, newest-first)
 * - versionsCountByPolicy: Map<name, count> of real modifications (uncapped,
 *   excluding bulk-reformat days)
 * - firstSeenByPolicy: Map<name, ISO date> of the oldest commit (uncapped)
 * - bulkDays: Set<YYYY-MM-DD> of false-positive bulk-reformat days
 */
async function buildPolicyHistory() {
  const MAX_ENTRIES_PER_POLICY = 100;
  const BULK_DAY_THRESHOLD = 50;
  const COMMIT_PREFIX = "__C__";
  // --no-renames matches the previous per-path behavior (no --follow, no
  // false rename/copy detection).
  const raw = await git.raw([
    "log",
    "--no-renames",
    `--format=${COMMIT_PREFIX}%H|%aI|%s|%an`,
    "--name-only",
    "--",
    "policies/",
  ]);
  const historyByPolicy = new Map();
  const daysByPolicy = new Map();
  const firstSeenByPolicy = new Map();
  const commitsByDate = {};
  let current = null;
  for (const line of (raw || "").split("\n")) {
    if (line.startsWith(COMMIT_PREFIX)) {
      const [hash, date, message, author_name] = line
        .slice(COMMIT_PREFIX.length)
        .split("|");
      current = { hash, date, message, author_name };
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (!trimmed.startsWith("policies/")) continue;
    const policyName = trimmed.slice("policies/".length);
    if (!policyName || policyName.includes("/")) continue;

    let entries = historyByPolicy.get(policyName);
    if (!entries) {
      entries = [];
      historyByPolicy.set(policyName, entries);
    }
    if (entries.length < MAX_ENTRIES_PER_POLICY) {
      entries.push(current);
    }

    // Uncapped per-policy day tracking for accurate modification counts.
    const day = new Date(current.date).toISOString().slice(0, 10);
    let days = daysByPolicy.get(policyName);
    if (!days) {
      days = [];
      daysByPolicy.set(policyName, days);
    }
    days.push(day);

    // Log is newest-first, so the last commit seen per policy is its oldest.
    firstSeenByPolicy.set(policyName, current.date);

    // Global per-policy-file changes per day (2019 import excluded, matching
    // the chart-data bulk-day logic).
    if (!day.startsWith("2019-")) {
      commitsByDate[day] = (commitsByDate[day] || 0) + 1;
    }
  }

  // Bulk-reformat days: any day where >= BULK_DAY_THRESHOLD policy files
  // changed (e.g. jq -S key-sorting, invisible character normalization) is
  // treated as false-positive churn rather than real modifications.
  const bulkDays = new Set(
    Object.entries(commitsByDate)
      .filter(([, count]) => count >= BULK_DAY_THRESHOLD)
      .map(([day]) => day)
  );

  // Real modification count per policy: uncapped, excluding bulk-reformat days.
  const versionsCountByPolicy = new Map();
  for (const [policyName, days] of daysByPolicy) {
    let count = 0;
    for (const day of days) {
      if (!bulkDays.has(day)) count++;
    }
    versionsCountByPolicy.set(policyName, count);
  }

  return { historyByPolicy, versionsCountByPolicy, firstSeenByPolicy, bulkDays };
}

function buildPathfindingFindingsForPolicy(allowInfo, catalogPaths) {
  const out = [];
  for (const pathEntry of catalogPaths) {
    const req = pathEntry.permissions?.required;
    if (!pathRequiredPermissionsSatisfied(allowInfo, req)) continue;
    const pathId = pathEntry.id;
    if (!pathId) continue;
    const pathName = pathEntry.name || pathId;
    const category = pathEntry.category || "unknown";
    const url = pathfindingPathUrl(pathId);
    const details = `This managed policy allows every IAM action listed as required for the documented privilege escalation path "${pathName}" (${pathId}, category: ${category}). That is action coverage in this JSON only. It does not mean escalation succeeds in every AWS account: trust policies, resource scope, and other prerequisites still matter. Open the link for the interactive visualization, full technique, and mitigations on pathfinding.cloud.`;
    out.push({
      source: "pathfinding",
      findingType: "DOCUMENTED_PATH",
      issueCode: `PATHFINDING_${String(pathId).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      findingDetails: details,
      learnMoreLink: url,
      pathId,
      pathName,
      pathCategory: category,
    });
  }
  out.sort((a, b) => a.pathId.localeCompare(b.pathId));
  return out;
}

function loadPathfindingCatalogPaths() {
  let catalogPaths = [];
  let catalogLastUpdated = null;
  try {
    if (!fs.existsSync(PATHFINDING_PATHS_JSON)) {
      console.warn(
        `⚠️  No pathfinding catalog at ${PATHFINDING_PATHS_JSON} (see data/pathfinding/README.md)`
      );
      return { catalogPaths, catalogLastUpdated };
    }
    const pfRaw = JSON.parse(fs.readFileSync(PATHFINDING_PATHS_JSON, "utf8"));
    if (!Array.isArray(pfRaw)) {
      console.warn("⚠️  pathfinding paths.json is not an array");
      return { catalogPaths, catalogLastUpdated };
    }
    for (const p of pfRaw) {
      const req = p.permissions?.required;
      if (!Array.isArray(req) || req.length === 0) continue;
      catalogPaths.push(p);
      const lu = p.gitMetadata?.lastUpdated;
      if (
        lu &&
        typeof lu === "string" &&
        (!catalogLastUpdated || lu > catalogLastUpdated)
      ) {
        catalogLastUpdated = lu;
      }
    }
    console.log(
      `🧭 Pathfinding catalog: ${catalogPaths.length} paths with required permissions`
    );
  } catch (e) {
    console.warn("⚠️  Could not load pathfinding catalog:", e.message);
  }
  return { catalogPaths, catalogLastUpdated };
}

async function generatePolicyData() {
  console.log("🔍 Scanning policies directory...");

  // Read all policy files
  const policyFiles = fs
    .readdirSync(POLICIES_DIR)
    .filter((file) => !file.startsWith(".") && file !== "README.md");

  console.log(`📊 Found ${policyFiles.length} policies`);

  const policies = [];
  const errors = [];
  const allCommitEntries = [];
  const uniqueLiteralActions = new Set();
  const actionBuckets = new Map();
  const policiesWithWildcard = new Set();
  const wildcardPoliciesByService = {};
  const pathfindingPoliciesForJson = [];

  const { catalogPaths: pathfindingCatalogPaths, catalogLastUpdated: pathfindingCatalogLastUpdated } =
    loadPathfindingCatalogPaths();

  function actionBucket(action) {
    if (!actionBuckets.has(action)) {
      actionBuckets.set(action, {
        actionAllow: new Set(),
        actionDeny: new Set(),
        notAction: new Set(),
      });
    }
    return actionBuckets.get(action);
  }

  function noteWildcardPolicy(policyName, actionStr) {
    policiesWithWildcard.add(policyName);
    const colon = actionStr.indexOf(":");
    const prefix =
      colon > 0 ? actionStr.slice(0, colon).toLowerCase() : "";
    if (prefix && prefix !== "*") {
      if (!wildcardPoliciesByService[prefix]) {
        wildcardPoliciesByService[prefix] = new Set();
      }
      wildcardPoliciesByService[prefix].add(policyName);
    }
  }

  // Read deprecated policies early so per-policy detail can reference it
  const deprecatedPath = path.join(REPO_ROOT, "DEPRECATED.json");
  let deprecated = {};
  if (fs.existsSync(deprecatedPath)) {
    deprecated = JSON.parse(fs.readFileSync(deprecatedPath, "utf8"));
  }

  function computeLifespan(startISO, endDateStr) {
    if (!startISO || !endDateStr || endDateStr === "Unknown") return null;
    const start = new Date(startISO);
    const end = new Date(endDateStr);
    if (isNaN(start) || isNaN(end) || end <= start) return null;
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    if (months < 0) { years--; months += 12; }
    const parts = [];
    if (years > 0) parts.push(`${years} year${years !== 1 ? "s" : ""}`);
    if (months > 0) parts.push(`${months} month${months !== 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(", ") : "< 1 month";
  }

  console.log("🕘 Building git history (single pass)...");
  const {
    historyByPolicy,
    versionsCountByPolicy,
    firstSeenByPolicy,
    bulkDays,
  } = await buildPolicyHistory();

  for (const policyName of policyFiles) {
    try {
      const policyPath = path.join(POLICIES_DIR, policyName);

      // Read policy content
      const content = fs.readFileSync(policyPath, "utf8");
      let policyData;
      try {
        policyData = JSON.parse(content);
      } catch (e) {
        console.warn(`⚠️  Could not parse JSON for ${policyName}, skipping`);
        continue;
      }

      const logEntries = historyByPolicy.get(policyName) || [];

      for (const entry of logEntries) {
        allCommitEntries.push({
          date: entry.date,
          message: entry.message,
          hash: entry.hash,
          policyName,
        });
      }

      // Get file stats
      const stats = fs.statSync(policyPath);

      // Count actions and extract service prefixes from IAM actions
      let actionCount = 0;
      const servicePrefixes = new Set();
      try {
        const statements =
          policyData.PolicyVersion?.Document?.Statement || [];
        const stmtArray = Array.isArray(statements)
          ? statements
          : [statements];
        for (const stmt of stmtArray) {
          const effect = stmt.Effect === "Deny" ? "Deny" : "Allow";

          if (stmt.Action) {
            const raw = stmt.Action;
            const actionArray = Array.isArray(raw) ? raw : [raw];
            actionCount += actionArray.length;
            for (const action of actionArray) {
              if (typeof action !== "string") continue;
              const prefix = action.split(":")[0];
              if (prefix && prefix !== "*") {
                servicePrefixes.add(prefix.toLowerCase());
              }
              if (action.includes("*")) {
                noteWildcardPolicy(policyName, action);
                continue;
              }
              uniqueLiteralActions.add(action);
              const b = actionBucket(action);
              if (effect === "Deny") b.actionDeny.add(policyName);
              else b.actionAllow.add(policyName);
            }
          }

          if (stmt.NotAction) {
            const raw = stmt.NotAction;
            const actionArray = Array.isArray(raw) ? raw : [raw];
            actionCount += actionArray.length;
            for (const action of actionArray) {
              if (typeof action !== "string") continue;
              const prefix = action.split(":")[0];
              if (prefix && prefix !== "*") {
                servicePrefixes.add(prefix.toLowerCase());
              }
              if (action.includes("*")) {
                noteWildcardPolicy(policyName, action);
                continue;
              }
              uniqueLiteralActions.add(action);
              actionBucket(action).notAction.add(policyName);
            }
          }
        }
      } catch (e) {
        // skip action parsing errors
      }

      const firstSeenDate =
        firstSeenByPolicy.get(policyName) ||
        (logEntries.length > 0
          ? logEntries[logEntries.length - 1].date
          : stats.mtime.toISOString());

      const policy = {
        name: policyName,
        createDate: policyData.PolicyVersion?.CreateDate || null,
        versionId: policyData.PolicyVersion?.VersionId || null,
        lastModified: logEntries.length > 0
          ? logEntries[0].date
          : stats.mtime.toISOString(),
        versionsCount: versionsCountByPolicy.get(policyName) ?? logEntries.length,
        size: stats.size,
        actionCount,
        servicePrefixes: [...servicePrefixes],
        firstSeen: firstSeenDate,
        history: logEntries.slice(0, 10).map((entry) => ({
          hash: entry.hash,
          date: entry.date,
          message: entry.message,
          author: displayAuthorName(entry.author_name),
        })),
      };

      policies.push(policy);

      const allowInfo = extractAllowActionInfo(policyData);
      const pathfindingFindings = buildPathfindingFindingsForPolicy(
        allowInfo,
        pathfindingCatalogPaths
      );
      if (pathfindingFindings.length > 0) {
        pathfindingPoliciesForJson.push({
          name: policyName,
          findings: pathfindingFindings,
        });
      }

      let accessAnalyzerFindingCount = 0;
      try {
        const findingsPath = path.join(FINDINGS_DIR, `${policyName}.json`);
        if (fs.existsSync(findingsPath)) {
          const arr = JSON.parse(fs.readFileSync(findingsPath, "utf8"));
          if (Array.isArray(arr)) {
            accessAnalyzerFindingCount = arr.length;
          }
        }
      } catch {
        /* ignore */
      }

      // Save individual policy with full content
      const policyDetail = {
        ...policy,
        content: policyData,
        deprecation: deprecated[policyName]
          ? {
              date: deprecated[policyName],
              lifespan: computeLifespan(
                policy.createDate || policy.firstSeen,
                deprecated[policyName]
              ),
            }
          : null,
        securitySignals: {
          accessAnalyzerFindingCount,
          pathfindingOverlaps: pathfindingFindings.map((f) => ({
            pathId: f.pathId,
            pathName: f.pathName,
            category: f.pathCategory,
            pathfindingUrl: f.learnMoreLink,
          })),
        },
      };

      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${policyName}.json`),
        JSON.stringify(policyDetail, null, 2)
      );
    } catch (error) {
      errors.push({ policyName, error: error.message });
      console.error(`❌ Error processing ${policyName}:`, error.message);
    }
  }

  // Sort and calculate stats
  policies.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

  // Brand new policies: v1 (never updated by AWS) created within a recent
  // window, so this genuinely spotlights new services/features instead of every
  // old-but-unchanged v1 policy. Tune the window with BRAND_NEW_WINDOW_DAYS.
  const BRAND_NEW_WINDOW_DAYS = 90;
  const brandNewCutoff = new Date();
  brandNewCutoff.setDate(brandNewCutoff.getDate() - BRAND_NEW_WINDOW_DAYS);
  const brandNewPolicies = [...policies]
    .filter(
      (p) =>
        p.versionId === "v1" &&
        p.createDate &&
        new Date(p.createDate) >= brandNewCutoff
    )
    .sort((a, b) => new Date(b.createDate) - new Date(a.createDate));

  const wildcardPoliciesByServiceCounts = {};
  for (const [svc, set] of Object.entries(wildcardPoliciesByService)) {
    wildcardPoliciesByServiceCounts[svc] = set.size;
  }

  const stats = {
    totalPolicies: policies.length,
    uniqueLiteralActionCount: uniqueLiteralActions.size,
    policiesWithWildcardActions: policiesWithWildcard.size,
    wildcardPoliciesByService: wildcardPoliciesByServiceCounts,
    lastUpdate: new Date().toISOString(),
    mostModified: [...policies]
      .sort((a, b) => b.versionsCount - a.versionsCount)
      .slice(0, 10),
    recentlyUpdated: policies.slice(0, 10),
    newest: [...policies]
      .filter((p) => p.createDate)
      .sort((a, b) => new Date(b.createDate) - new Date(a.createDate))
      .slice(0, 10),
    oldest: [...policies]
      .sort((a, b) => new Date(a.lastModified) - new Date(b.lastModified))
      .slice(0, 10),
    brandNew: brandNewPolicies,
    brandNewWindowDays: BRAND_NEW_WINDOW_DAYS,
  };

  // Policies by year (based on first-seen in git)
  const policiesByYear = {};
  for (const p of policies) {
    const year = new Date(p.firstSeen).getFullYear().toString();
    policiesByYear[year] = (policiesByYear[year] || 0) + 1;
  }
  stats.policiesByYear = policiesByYear;

  // Largest policies by action count
  stats.largestByActionCount = [...policies]
    .sort((a, b) => b.actionCount - a.actionCount)
    .slice(0, 20)
    .map((p) => ({ name: p.name, actionCount: p.actionCount }));

  // Service growth: find the earliest year each IAM service prefix appeared
  const serviceFirstSeen = {};
  for (const p of policies) {
    const year = new Date(p.firstSeen).getFullYear();
    for (const svc of p.servicePrefixes) {
      if (!serviceFirstSeen[svc] || year < serviceFirstSeen[svc]) {
        serviceFirstSeen[svc] = year;
      }
    }
  }
  const serviceGrowth = {};
  for (const [svc, year] of Object.entries(serviceFirstSeen)) {
    const yearStr = year.toString();
    if (!serviceGrowth[yearStr]) {
      serviceGrowth[yearStr] = [];
    }
    serviceGrowth[yearStr].push(svc);
  }
  for (const year of Object.keys(serviceGrowth)) {
    serviceGrowth[year].sort();
  }
  stats.serviceGrowth = serviceGrowth;

  // --- New chart data aggregations ---
  // 2019 is always excluded: it's the initial fork/import, not real activity.
  console.log("📈 Computing chart data from git history...");

  // Build a lookup of each policy's first-seen year and date
  const newPoliciesByYear = {};
  const newPoliciesByReinventYear = {};
  for (const p of policies) {
    const d = new Date(p.firstSeen);
    const yr = d.getUTCFullYear();
    if (yr === 2019) continue;
    const yrStr = yr.toString();
    newPoliciesByYear[yrStr] = (newPoliciesByYear[yrStr] || 0) + 1;

    const mo = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    if ((mo === 11 && day >= 15) || (mo === 12 && day <= 15)) {
      newPoliciesByReinventYear[yrStr] =
        (newPoliciesByReinventYear[yrStr] || 0) + 1;
    }
  }

  // Filter commit entries to exclude 2019
  const filteredEntries = allCommitEntries.filter(
    (e) => new Date(e.date).getUTCFullYear() !== 2019
  );

  // Bulk-reformat days (jq -S key-sorting, invisible character normalization,
  // etc. that made every policy appear modified) are detected once, uncapped,
  // in buildPolicyHistory() and reused here so chart data, modification counts,
  // and volatility all share one definition.
  if (bulkDays.size > 0) {
    console.log(
      `   ⚠️  Excluding ${wording.plural(bulkDays.size, "bulk-reformat day")}: ${[...bulkDays].join(", ")}`
    );
  }
  const cleanEntries = filteredEntries.filter(
    (e) => !bulkDays.has(new Date(e.date).toISOString().slice(0, 10))
  );
  const cleanDates = cleanEntries.map((e) => new Date(e.date));

  stats.bulkDaysExcluded = [...bulkDays].sort();

  // Monthly seasonality: aggregate commits by calendar month (01-12)
  const changesByMonth = {};
  for (let m = 1; m <= 12; m++) {
    changesByMonth[String(m).padStart(2, "0")] = 0;
  }
  for (const d of cleanDates) {
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    changesByMonth[mo]++;
  }
  stats.changesByMonth = changesByMonth;

  // re:Invent pulse: Nov 15 - Dec 15 window per year
  const reinventByYear = {};
  for (const e of cleanEntries) {
    const d = new Date(e.date);
    const mo = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const yr = d.getUTCFullYear().toString();
    if ((mo === 11 && day >= 15) || (mo === 12 && day <= 15)) {
      reinventByYear[yr] = (reinventByYear[yr] || 0) + 1;
    }
  }
  const reinventYears = Object.keys(reinventByYear).sort();
  stats.reinventPulse = reinventYears.map((yr) => ({
    year: yr,
    changes: reinventByYear[yr] || 0,
    newPolicies: newPoliciesByReinventYear[yr] || 0,
  }));

  // Version distribution: count policies at each current version
  const versionDist = {};
  for (const p of policies) {
    const v = p.versionId || "unknown";
    versionDist[v] = (versionDist[v] || 0) + 1;
  }
  stats.versionDistribution = versionDist;

  // Top version policies (the most-revised outliers)
  stats.topVersionPolicies = [...policies]
    .map((p) => {
      const num = parseInt((p.versionId || "v0").replace("v", ""), 10) || 0;
      return { name: p.name, version: p.versionId || "v0", versionNumber: num };
    })
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .slice(0, 10);

  // Yearly velocity: total commits per year, with new-launches from firstSeen
  const velocityTotalByYear = {};
  for (const e of cleanEntries) {
    const yr = new Date(e.date).getUTCFullYear().toString();
    velocityTotalByYear[yr] = (velocityTotalByYear[yr] || 0) + 1;
  }
  const velYears = Object.keys(velocityTotalByYear).sort();
  stats.yearlyVelocity = velYears.map((yr) => {
    const total = velocityTotalByYear[yr] || 0;
    const np = newPoliciesByYear[yr] || 0;
    return { year: yr, total, newPolicies: np, updates: total - np };
  });

  // Most volatile this year (trailing 12 months). Counted from cleanEntries
  // (excludes 2019 + bulk-reformat days) so it reflects real changes and is not
  // capped by the truncated per-policy history array.
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const recentChanges = {};
  for (const e of cleanEntries) {
    if (new Date(e.date) >= oneYearAgo) {
      recentChanges[e.policyName] = (recentChanges[e.policyName] || 0) + 1;
    }
  }
  stats.volatileThisYear = Object.entries(recentChanges)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, changesThisYear]) => ({ name, changesThisYear }));

  console.log(
    `   📈 Chart data: ${cleanEntries.length} commit entries (excl. 2019 + ${wording.plural(bulkDays.size, "bulk day")}), ` +
      `${reinventYears.length} re:Invent years, ` +
      `${stats.volatileThisYear.length} volatile policies`
  );

  // deprecated dict was loaded before the per-policy loop

  // IAM action inverse index (literal strings only; wildcards excluded from keys)
  const registry = loadActionRegistry();
  const actionsOut = {};
  for (const action of [...uniqueLiteralActions].sort()) {
    const b = actionBucket(action);
    const sighting = registry.actions[action.toLowerCase()];
    actionsOut[action] = {
      actionAllowPolicies: [...b.actionAllow].sort(),
      actionDenyPolicies: [...b.actionDeny].sort(),
      notActionPolicies: [...b.notAction].sort(),
      ...(sighting || {}),
    };
  }
  const actionIndexPayload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    stats: {
      uniqueLiteralActionCount: uniqueLiteralActions.size,
      policiesWithWildcardActions: policiesWithWildcard.size,
      wildcardPoliciesByService: wildcardPoliciesByServiceCounts,
    },
    effectiveGrantPreview: null,
    actions: actionsOut,
    // Per service prefix rather than repeated on every action, since a prefix
    // arrives only once and thousands of actions can share it.
    services: registry.services,
    archiveStart: registry.archiveStart,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "action-index.json"),
    JSON.stringify(actionIndexPayload)
  );
  console.log(
    `   🔑 Action index: ${uniqueLiteralActions.size} literal actions, ${policiesWithWildcard.size} policies with wildcards`
  );

  // Discoveries feed: first-ever sightings, newest first. A dedicated file rather
  // than the 4.4 MB action index, so the page loads only what it renders. Nothing
  // is capped: the page fetches this file to search it, and a capped file would
  // mean a search box that silently misses older sightings. CloudFront compresses
  // it, and the repetition across dates and policy names compresses well.

  // Actions per prefix, counted from the registry so it reflects the whole
  // archive rather than only the actions still present today.
  const registryActionsByPrefix = {};
  for (const action of Object.keys(registry.actions)) {
    const prefix = action.split(":", 1)[0];
    registryActionsByPrefix[prefix] = (registryActionsByPrefix[prefix] || 0) + 1;
  }

  // Anything present at the 2019 import is excluded throughout: its date is when
  // tracking began, not when AWS introduced it.
  const discoveredServices = Object.entries(registry.services)
    .filter(([, v]) => !v.sinceStart)
    .map(([prefix, v]) => ({
      prefix,
      firstSeen: v.firstSeen,
      firstPolicy: v.firstPolicy,
      actionCount: registryActionsByPrefix[prefix] || 0,
    }))
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  const newServiceDates = new Set(
    discoveredServices.map((s) => `${s.prefix}|${s.firstSeen}`)
  );
  // Canonical casing of actions still present today, which is what the action
  // page slugs are built from. Anything since removed gets no link.
  const currentActionCasing = {};
  for (const action of Object.keys(actionsOut)) {
    currentActionCasing[action.toLowerCase()] = action;
  }
  // Actions that landed on a service prefix that already existed. The ones that
  // arrived with their prefix are already represented by the service entry.
  const discoveredActions = Object.entries(registry.actions)
    .filter(
      ([action, v]) =>
        !v.sinceStart &&
        !newServiceDates.has(`${action.split(":", 1)[0]}|${v.firstSeen}`)
    )
    .map(([action, v]) => ({
      action: currentActionCasing[action] || registry.actionLabels[action] || action,
      firstSeen: v.firstSeen,
      firstPolicy: v.firstPolicy,
      hasPage: Boolean(currentActionCasing[action]),
    }))
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "discoveries.json"),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      archiveStart: registry.archiveStart,
      stats: {
        totalNewServices: discoveredServices.length,
        totalNewActions: discoveredActions.length,
        servicesSinceStart: Object.values(registry.services).filter(
          (v) => v.sinceStart
        ).length,
      },
      services: discoveredServices,
      actions: discoveredActions,
    })
  );
  console.log(
    `   🛰️  Discoveries: ${discoveredServices.length} service prefixes and ` +
      `${discoveredActions.length} actions first seen after ${registry.archiveStart}`
  );

  // SAR-style action definitions (iam-dataset by Ian McKay) intersected with our action keys
  const IAM_DEFINITION_URL =
    "https://raw.githubusercontent.com/iann0036/iam-dataset/main/aws/iam_definition.json";
  const LIST_CAP = 30;
  const attributionText =
    "Action descriptions and access metadata from iam-dataset (Ian McKay, github.com/iann0036/iam-dataset), MIT license. Derived from the AWS Service Authorization Reference; not guaranteed current.";

  function slimPrivilegeRecord(serviceName, priv) {
    const resourceTypes = [];
    const dependentActions = [];
    const seenR = new Set();
    const seenD = new Set();
    for (const rt of priv.resource_types || []) {
      if (resourceTypes.length < LIST_CAP) {
        const t = (rt.resource_type && String(rt.resource_type).trim()) || "";
        if (t && !seenR.has(t)) {
          seenR.add(t);
          resourceTypes.push(t);
        }
      }
      const deps = rt.dependent_actions || [];
      const depArr = Array.isArray(deps) ? deps : [deps];
      for (const da of depArr) {
        if (dependentActions.length >= LIST_CAP) break;
        if (typeof da === "string" && da && !seenD.has(da)) {
          seenD.add(da);
          dependentActions.push(da);
        }
      }
      if (resourceTypes.length >= LIST_CAP && dependentActions.length >= LIST_CAP)
        break;
    }
    return {
      description: priv.description || "",
      accessLevel: priv.access_level || "",
      serviceName: serviceName || "",
      resourceTypes,
      dependentActions,
    };
  }

  console.log("🔎 Fetching iam-dataset (iam_definition.json)...");
  let actionDefinitionsOut = {
    schemaVersion: 1,
    source: "iam-dataset",
    sourceUrl: "https://github.com/iann0036/iam-dataset",
    sourceLicense: "MIT",
    attribution: attributionText,
    generatedAt: new Date().toISOString(),
    definitions: {},
  };
  try {
    const iamDefRaw = await fetchUrl(IAM_DEFINITION_URL);
    const iamDef = JSON.parse(iamDefRaw);
    const lookupByActionLower = {};
    if (Array.isArray(iamDef)) {
      for (const svc of iamDef) {
        const prefix = (svc.prefix && String(svc.prefix)) || "";
        const serviceName = (svc.service_name && String(svc.service_name)) || "";
        if (!prefix) continue;
        for (const priv of svc.privileges || []) {
          const p = priv.privilege && String(priv.privilege);
          if (!p) continue;
          const canonical = `${prefix}:${p}`;
          lookupByActionLower[canonical.toLowerCase()] = slimPrivilegeRecord(
            serviceName,
            priv
          );
        }
      }
    }
    const definitions = {};
    for (const actionKey of Object.keys(actionsOut)) {
      const row = lookupByActionLower[actionKey.toLowerCase()];
      if (row) definitions[actionKey] = row;
    }
    actionDefinitionsOut.definitions = definitions;
    const matched = Object.keys(definitions).length;
    console.log(
      `   📚 Action definitions: ${matched} of ${Object.keys(actionsOut).length} indexed actions matched iam-dataset`
    );
  } catch (err) {
    console.warn("⚠️  Could not build action definitions:", err.message);
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "action-definitions.json"),
    JSON.stringify(actionDefinitionsOut)
  );

  // Write summary data
  const summary = {
    stats,
    policies: policies.map((p) => ({
      name: p.name,
      lastModified: p.lastModified,
      createDate: p.createDate,
      versionsCount: p.versionsCount,
      versionId: p.versionId,
      actionCount: p.actionCount,
    })),
    deprecated,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  // Fetch known AWS accounts from fwdcloudsec community
  console.log("🔎 Fetching known AWS accounts...");
  try {
    const yamlText = await fetchUrl(
      "https://raw.githubusercontent.com/fwdcloudsec/known_aws_accounts/main/accounts.yaml"
    );
    const accounts = yaml.load(yamlText);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "known-accounts.json"),
      JSON.stringify(accounts, null, 2)
    );
    console.log(`   🏢 Known accounts entries: ${accounts.length}`);
  } catch (err) {
    console.warn("⚠️  Could not fetch known AWS accounts:", err.message);
  }

  // Aggregate findings from Access Analyzer validation + pathfinding overlaps
  console.log("🔎 Aggregating security findings (Access Analyzer + pathfinding)...");
  try {
    const findingsFiles = fs
      .readdirSync(FINDINGS_DIR)
      .filter((f) => f.endsWith(".json"));

    const byType = { ERROR: 0, SECURITY_WARNING: 0, WARNING: 0, SUGGESTION: 0 };
    const accessAnalyzerPolicies = [];

    for (const file of findingsFiles) {
      try {
        const raw = JSON.parse(
          fs.readFileSync(path.join(FINDINGS_DIR, file), "utf8")
        );
        const policyName = file.replace(/\.json$/, "");
        const stripped = raw.map((f) => ({
          source: "access_analyzer",
          findingType: f.findingType,
          findingDetails: f.findingDetails,
          issueCode: f.issueCode,
          learnMoreLink: f.learnMoreLink,
        }));
        for (const f of stripped) {
          if (byType[f.findingType] !== undefined) byType[f.findingType]++;
        }
        accessAnalyzerPolicies.push({ name: policyName, findings: stripped });
      } catch (e) {
        // skip unparseable findings files
      }
    }

    accessAnalyzerPolicies.sort((a, b) => a.name.localeCompare(b.name));

    const accessAnalyzerWithAny = accessAnalyzerPolicies.filter(
      (p) => p.findings.length > 0
    ).length;
    const accessAnalyzerFindingTotal = Object.values(byType).reduce(
      (a, b) => a + b,
      0
    );

    pathfindingPoliciesForJson.sort((a, b) => a.name.localeCompare(b.name));
    const pathfindingByCategory = {};
    let pathfindingOverlapTotal = 0;
    for (const pol of pathfindingPoliciesForJson) {
      for (const f of pol.findings) {
        const c = f.pathCategory || "unknown";
        pathfindingByCategory[c] = (pathfindingByCategory[c] || 0) + 1;
        pathfindingOverlapTotal++;
      }
    }

    const findingsData = {
      lastUpdated: new Date().toISOString().split("T")[0],
      totalPoliciesAnalyzed: policies.length,
      accessAnalyzer: {
        policiesWithFindings: accessAnalyzerWithAny,
        totalFindingRows: accessAnalyzerFindingTotal,
        byType,
        policies: accessAnalyzerPolicies,
      },
      pathfinding: {
        attribution:
          "Path definitions from pathfinding.cloud (Apache-2.0, open source by Datadog). IAMTrail matches required IAM actions only.",
        catalogLastUpdated: pathfindingCatalogLastUpdated,
        pathsInCatalog: pathfindingCatalogPaths.length,
        policiesWithOverlaps: pathfindingPoliciesForJson.length,
        totalOverlaps: pathfindingOverlapTotal,
        byCategory: pathfindingByCategory,
        policies: pathfindingPoliciesForJson,
      },
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "findings.json"),
      JSON.stringify(findingsData, null, 2)
    );
    console.log(
      `   🛡️  Access Analyzer: ${accessAnalyzerWithAny} policies with ≥1 finding, ${accessAnalyzerFindingTotal} rows`
    );
    console.log(
      `   🧭 Pathfinding overlaps: ${pathfindingPoliciesForJson.length} policies, ${pathfindingOverlapTotal} policy-path pairs`
    );
  } catch (err) {
    console.warn("⚠️  Could not aggregate findings:", err.message);
  }

  // Generate sitemap.xml
  console.log("🗺️  Generating sitemap.xml...");
  const today = new Date().toISOString().split("T")[0];
  const sitemapEntries = [
    { loc: "/", priority: "1.0", changefreq: "daily" },
    { loc: "/policies/", priority: "0.9", changefreq: "daily" },
    { loc: "/findings/", priority: "0.8", changefreq: "daily" },
    { loc: "/deprecated/", priority: "0.7", changefreq: "weekly" },
    { loc: "/most-active/", priority: "0.7", changefreq: "weekly" },
    { loc: "/accounts/", priority: "0.7", changefreq: "weekly" },
    { loc: "/largest-policies/", priority: "0.7", changefreq: "weekly" },
    { loc: "/service-growth/", priority: "0.7", changefreq: "weekly" },
    { loc: "/discoveries/", priority: "0.8", changefreq: "daily" },
    { loc: "/endpoints/", priority: "0.8", changefreq: "daily" },
    { loc: "/guardduty/", priority: "0.8", changefreq: "daily" },
    { loc: "/feeds/", priority: "0.5", changefreq: "weekly" },
    { loc: "/about/", priority: "0.5", changefreq: "monthly" },
  ];
  policies.forEach((p) => {
    sitemapEntries.push({
      loc: `/policies/${encodeURIComponent(p.name)}/`,
      priority: "0.6",
      changefreq: "weekly",
    });
  });
  for (const action of Object.keys(actionsOut).sort()) {
    sitemapEntries.push({
      loc: `/actions/${iamActionToSlug(action)}/`,
      priority: "0.5",
      changefreq: "weekly",
    });
  }
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries
  .map(
    (e) => `  <url>
    <loc>${SITE_URL}${e.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;
  fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemapXml);
  console.log(`   🗺️  Sitemap entries: ${sitemapEntries.length}`);

  console.log("✅ Data generation complete!");
  console.log(`   📁 Policies processed: ${policies.length}`);
  console.log(`   ⚠️  Errors: ${errors.length}`);
  console.log(`   📊 Output directory: ${OUTPUT_DIR}`);

  return { policies, allCommitEntries, discoveredServices, discoveredActions };
}

const GUARDDUTY_DIR = path.join(REPO_ROOT, "data/guardduty");

async function generateGuardDutyData() {
  console.log("\n🛡️  Generating GuardDuty announcements data...");

  if (!fs.existsSync(GUARDDUTY_DIR)) {
    console.log("   ⚠️  No data/guardduty/ found, skipping GuardDuty data generation");
    return { announcements: [] };
  }

  const files = fs
    .readdirSync(GUARDDUTY_DIR)
    .filter((f) => f.endsWith(".json") && f !== "import-summary.json")
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log("   ⚠️  No GuardDuty announcement files found");
    return { announcements: [] };
  }

  const announcements = [];
  const typeCounts = {};

  for (const file of files) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(GUARDDUTY_DIR, file), "utf8")
      );
      const type = data.type || "UNKNOWN";
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      announcements.push({
        type,
        detected_at: data.detected_at || "",
        description: data.description || "",
        short_description: data.short_description || "",
        link: data.link || "",
        gist_url: data.gist_url || "",
      });
    } catch (e) {
      console.warn(`   ⚠️  Could not parse ${file}: ${e.message}`);
    }
  }

  announcements.sort(
    (a, b) => new Date(b.detected_at) - new Date(a.detected_at)
  );

  const summary = {
    lastUpdated: new Date().toISOString(),
    stats: {
      total: announcements.length,
      typeCounts,
    },
    announcements,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "guardduty-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(
    `   🛡️  GuardDuty: ${announcements.length} announcements (${Object.entries(typeCounts)
      .map(([t, c]) => `${t}: ${c}`)
      .join(", ")})`
  );

  return { announcements };
}

const ENDPOINTS_PATH = path.join(REPO_ROOT, "data/endpoints.json");
const ENDPOINT_CHANGES_DIR = path.join(REPO_ROOT, "data/endpoint-changes");

async function generateEndpointsData() {
  console.log("\n🌐 Generating endpoints data...");

  if (!fs.existsSync(ENDPOINTS_PATH)) {
    console.log("   ⚠️  No data/endpoints.json found, skipping endpoints data generation");
    return { allChangeRecords: [] };
  }

  const endpointsRaw = JSON.parse(fs.readFileSync(ENDPOINTS_PATH, "utf8"));
  const partitions = endpointsRaw.partitions || [];

  let totalRegions = 0;
  let totalServices = 0;
  const partitionSummaries = [];

  for (const p of partitions) {
    const regions = Object.entries(p.regions || {}).map(([code, info]) => ({
      code,
      name: info.description || code,
    }));
    regions.sort((a, b) => a.code.localeCompare(b.code));

    const services = Object.entries(p.services || {}).map(([id, svc]) => {
      const endpoints = Object.keys(svc.endpoints || {});
      const nonFipsEndpoints = endpoints.filter(
        (e) =>
          !e.startsWith("fips-") &&
          e !== "aws-global" &&
          e !== "aws-cn-global" &&
          e !== "aws-us-gov-global"
      );
      return {
        id,
        endpointCount: endpoints.length,
        regionCount: nonFipsEndpoints.length,
        isRegionalized: svc.isRegionalized !== false,
      };
    });
    services.sort((a, b) => a.id.localeCompare(b.id));

    totalRegions += regions.length;
    totalServices += services.length;

    partitionSummaries.push({
      partition: p.partition,
      partitionName: p.partitionName,
      dnsSuffix: p.dnsSuffix,
      regionCount: regions.length,
      serviceCount: services.length,
      regions,
      services,
    });
  }

  let allChangeRecords = [];
  if (fs.existsSync(ENDPOINT_CHANGES_DIR)) {
    const changeFiles = fs
      .readdirSync(ENDPOINT_CHANGES_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    for (const file of changeFiles) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(ENDPOINT_CHANGES_DIR, file), "utf8")
        );
        allChangeRecords.push(data);
      } catch (e) {
        console.warn(`   ⚠️  Could not parse ${file}: ${e.message}`);
      }
    }
  }

  const changeTypeCounts = {};
  const partitionCounts = {};
  const monthlyActivity = {};
  const serviceCounts = {};
  const regionCounts = {};
  const newRegionTimeline = [];

  for (const record of allChangeRecords) {
    const month = record.detected_at.slice(0, 7);
    monthlyActivity[month] = (monthlyActivity[month] || 0) + 1;

    for (const c of record.changes) {
      changeTypeCounts[c.type] = (changeTypeCounts[c.type] || 0) + 1;
      partitionCounts[c.partition] = (partitionCounts[c.partition] || 0) + 1;

      if (c.service) {
        serviceCounts[c.service] = (serviceCounts[c.service] || 0) + 1;
      }
      if (c.new_regions) {
        for (const r of c.new_regions) {
          regionCounts[r] = (regionCounts[r] || 0) + 1;
        }
      }
      if (c.type === "new_region") {
        newRegionTimeline.push({
          region: c.id,
          partition: c.partition,
          detected_at: record.detected_at,
          description: c.description,
        });
      }
    }
  }

  const topServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const topRegions = Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const sortedMonths = Object.entries(monthlyActivity)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));

  newRegionTimeline.sort(
    (a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()
  );

  const endpointsSummary = {
    lastUpdated: new Date().toISOString(),
    currentState: {
      totalRegions,
      totalServices,
      totalPartitions: partitions.length,
      partitions: partitionSummaries,
    },
    changeStats: {
      totalRecords: allChangeRecords.length,
      totalChangeItems: allChangeRecords.reduce(
        (s, r) => s + r.changes.length,
        0
      ),
      uniqueServices: Object.keys(serviceCounts).length,
      uniqueRegions: Object.keys(regionCounts).length,
      changeTypeCounts,
      partitionCounts,
      monthlyActivity: sortedMonths,
      topServices,
      topRegions,
      newRegionTimeline,
      trackingSince: allChangeRecords.length > 0
        ? allChangeRecords[allChangeRecords.length - 1].detected_at
        : null,
    },
    recentChanges: allChangeRecords,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "endpoints-summary.json"),
    JSON.stringify(endpointsSummary, null, 2)
  );

  console.log(
    `   🌐 Endpoints: ${totalRegions} regions, ${totalServices} services across ${partitions.length} partitions, ${wording.plural(allChangeRecords.length, "change record")}`
  );

  return { allChangeRecords };
}

// Ensure output directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(FEEDS_DIR)) {
  fs.mkdirSync(FEEDS_DIR, { recursive: true });
}

function toRFC2822(dateStr) {
  return new Date(dateStr).toUTCString();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Stable, guid-safe form of an arbitrary string. */
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Truncate at the nearest word boundary, falling back to a hard cut if no
 * good break is available. Used for RSS titles so feed readers don't show
 * sentences clipped mid-word.
 */
function smartTruncate(text, max) {
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  const sliced = collapsed.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  const cutoff = lastSpace > max * 0.6 ? lastSpace : max;
  return `${sliced.slice(0, cutoff).replace(/[.,;:!?\-]+$/, "")}...`;
}

/**
 * A deploy runs on every push to policies/, so a reader polling hourly is never
 * ahead of the data. Six hours, the previous value, told readers to poll far
 * less often than the feed actually changes.
 */
const FEED_TTL_MINUTES = 60;

/**
 * An item's guid is only a permalink when it genuinely is a URL. Declaring
 * isPermaLink="true" on a synthetic string invites readers to resolve it.
 */
function isUrl(value) {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function buildRSSFeed(channel, items) {
  const itemsXml = items
    .map((item) => {
      const categories = (item.categories || [])
        .map((c) => `\n      <category>${escapeXml(c)}</category>`)
        .join("");
      const enclosure = item.enclosure
        ? `\n      <enclosure url="${escapeXml(item.enclosure.url)}" length="${item.enclosure.length}" type="${escapeXml(item.enclosure.type)}" />`
        : "";
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="${isUrl(item.guid) ? "true" : "false"}">${escapeXml(item.guid)}</guid>
      <pubDate>${toRFC2822(item.date)}</pubDate>${categories}${enclosure}
      <description><![CDATA[${item.description}]]></description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${toRFC2822(new Date().toISOString())}</lastBuildDate>
    <ttl>${FEED_TTL_MINUTES}</ttl>
    <atom:link href="${escapeXml(channel.feedUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}

/**
 * The per-policy Open Graph card, when it has already been rendered.
 *
 * generate-og runs after this script, so a policy AWS created today has no image
 * on the first build. RSS requires a byte length on an enclosure, so an image we
 * cannot measure is simply left out rather than guessed at.
 */
function policyEnclosure(policyName) {
  const file = path.join(PUBLIC_DIR, "policies", policyName, "opengraph.png");
  try {
    return {
      url: `${SITE_URL}/policies/${encodeURIComponent(policyName)}/opengraph.png`,
      length: fs.statSync(file).size,
      type: "image/png",
    };
  } catch {
    return null;
  }
}

/** "iam:PassRole, s3:GetObject and 4 more", so a description names names. */
function listActions(actions, cap = 12) {
  const shown = actions.slice(0, cap).map((a) => escapeXml(a));
  const extra = actions.length - shown.length;
  const body = shown.join(", ");
  return extra > 0 ? `${body} and ${extra} more` : body;
}

/**
 * What a single policy change actually did, in words and then in detail.
 *
 * Falls back to naming the policy when no delta is available, which happens for
 * a commit older than the window data/policy-change-deltas.json covers.
 */
function describePolicyChange(policyName, delta, meta) {
  const policyUrl = `${SITE_URL}/policies/${encodeURIComponent(policyName)}/`;
  const link = `<a href="${policyUrl}">${escapeXml(policyName)}</a>`;

  if (!delta) {
    return `<p>${link} was updated.</p>`;
  }

  const added = delta.actionsAdded || [];
  const removed = delta.actionsRemoved || [];
  const escalations = added.filter((a) =>
    meta.permissionsManagement.has(a.toLowerCase())
  );
  const parts = [];

  const version = delta.versionId ? ` (${escapeXml(delta.versionId)})` : "";
  parts.push(
    `<p>${link}${version}: ${escapeXml(
      wording.actionDeltaPhrase(added, removed)
    )}.</p>`
  );

  if (delta.newServicePrefixes && delta.newServicePrefixes.length) {
    const named = delta.newServicePrefixes
      .map((p) => escapeXml(serviceLabel(p, meta)))
      .join(", ");
    parts.push(
      `<p><strong>${escapeXml(
        wording.sentence(wording.newServicePhrase(delta.newServicePrefixes))
      )}</strong>: ${named}. Never seen in any AWS managed policy before.</p>`
    );
  }

  const newActions = (delta.newActions || []).filter(
    (a) =>
      !(delta.newServicePrefixes || []).includes(a.split(":", 1)[0].toLowerCase())
  );
  if (newActions.length) {
    parts.push(
      `<p><strong>${escapeXml(
        wording.sentence(wording.neverBeforeSeen(newActions.length))
      )}</strong>: ${listActions(newActions)}</p>`
    );
  }

  if (escalations.length) {
    parts.push(
      `<p><strong>Permissions management</strong>: ${listActions(
        escalations
      )}</p>`
    );
  }

  if (added.length) {
    parts.push(`<p>Actions added: ${listActions(added)}</p>`);
  }
  if (removed.length) {
    parts.push(`<p>Actions removed: ${listActions(removed)}</p>`);
  }

  return parts.join("");
}

/** "Amazon Bedrock (bedrock)", or the bare prefix when iam-dataset has no name. */
function serviceLabel(prefix, meta) {
  const name = meta.serviceNames[prefix];
  return name ? `${name} (${prefix})` : prefix;
}

/**
 * Collapse same-day, same-service action sightings into one entry.
 *
 * AWS lands a service's actions in a single policy commit, so the ungrouped feed
 * was 48 near-identical odb items in a row and nothing else fit on the page. One
 * item per service per day says the same thing and leaves room for the rest.
 */
function groupDiscoveredActions(actions) {
  const groups = new Map();
  for (const entry of actions) {
    const prefix = entry.action.split(":", 1)[0].toLowerCase();
    const key = `${entry.firstSeen}|${prefix}`;
    if (!groups.has(key)) {
      groups.set(key, {
        prefix,
        firstSeen: entry.firstSeen,
        actions: [],
        policies: new Set(),
        hasPage: {},
      });
    }
    const group = groups.get(key);
    group.actions.push(entry.action);
    group.policies.add(entry.firstPolicy);
    group.hasPage[entry.action] = entry.hasPage;
  }
  for (const group of groups.values()) group.actions.sort();
  return [...groups.values()];
}

/** The headline for one policy change, leading with the strongest signal. */
function policyChangeTitle(policyName, delta) {
  if (!delta) return `${policyName} updated`;

  if (delta.newServicePrefixes && delta.newServicePrefixes.length) {
    return `${policyName}: ${wording.newServicePhrase(
      delta.newServicePrefixes
    )}`;
  }
  if (delta.newActions && delta.newActions.length) {
    return `${policyName}: ${wording.neverBeforeSeen(delta.newActions.length)}`;
  }
  if (delta.status === "added") {
    const count = (delta.actionsAdded || []).length;
    return `New policy: ${policyName} (${wording.plural(count, "action")})`;
  }
  if (delta.status === "removed") {
    return `Policy removed: ${policyName}`;
  }

  const suffix = delta.versionId ? ` (${delta.versionId})` : "";
  return `${policyName}: ${wording.actionDeltaPhrase(
    delta.actionsAdded,
    delta.actionsRemoved
  )}${suffix}`;
}

/**
 * Recount an endpoint change record rather than trusting its stored summary.
 *
 * botocore ships the same service in several partitions at once, so counting
 * rows reported "5 new services" for three. Counting distinct identifiers per
 * change type is what a reader means by "new service", and recomputing here
 * fixes the records already committed as well as the ones still to come.
 */
function summarizeEndpointChanges(record) {
  const changes = record.changes || [];
  if (!changes.length) return record.summary || "endpoint changes detected";

  const LABELS = [
    ["new_partition", "new partition"],
    ["new_region", "new region"],
    ["removed_region", "removed region"],
    ["new_service", "new service"],
    ["removed_service", "removed service"],
    ["service_expansion", "service expansion"],
    ["service_contraction", "service contraction"],
    ["region_updated", "region rename"],
    ["removed_partition", "removed partition"],
  ];

  const distinct = {};
  for (const c of changes) {
    (distinct[c.type] = distinct[c.type] || new Set()).add(
      c.id || c.service || c.description || ""
    );
  }

  const parts = [];
  for (const [type, label] of LABELS) {
    if (distinct[type]) parts.push(wording.plural(distinct[type].size, label));
  }
  for (const type of Object.keys(distinct)) {
    if (!LABELS.some(([t]) => t === type)) {
      parts.push(wording.plural(distinct[type].size, type.replace(/_/g, " ")));
    }
  }
  return parts.join(", ") || "endpoint changes detected";
}

/**
 * One line per endpoint change, naming the partition.
 *
 * Without it the same service arriving in aws-iso and aws-iso-b renders as the
 * identical bullet twice, which reads like a bug in the feed.
 */
function describeEndpointChange(change) {
  const partition = change.partition ? ` [${escapeXml(change.partition)}]` : "";
  return `<li>${escapeXml(change.description || change.id || "")}${partition}</li>`;
}

function generateRSSFeeds(policyData, endpointsData, guarddutyData) {
  console.log("\n📡 Generating RSS feeds...");

  const MAX_ITEMS = 50;
  const deltas = loadPolicyChangeDeltas();
  const meta = loadIamMetadata();

  // --- IAM Policies feed ---
  // Grouped by commit, because dropping every entry that repeats a hash would
  // silently discard the other policies a multi-policy commit touched.
  const byCommit = new Map();
  for (const entry of policyData.allCommitEntries || []) {
    if (!byCommit.has(entry.hash)) {
      byCommit.set(entry.hash, {
        hash: entry.hash,
        date: entry.date,
        policyNames: [],
      });
    }
    byCommit.get(entry.hash).policyNames.push(entry.policyName);
  }

  const policyItems = [...byCommit.values()]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, MAX_ITEMS)
    .map((commit) => {
      const names = commit.policyNames;
      const changes = names.map((name) => ({
        name,
        delta: deltas.get(`${commit.hash}:${name}`),
      }));
      const commitUrl = `${GITHUB_REPO}/commit/${commit.hash}`;

      const title =
        names.length === 1
          ? policyChangeTitle(changes[0].name, changes[0].delta)
          : `${wording.plural(names.length, "IAM policy", "IAM policies")} updated: ${names
              .slice(0, 3)
              .join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`;

      const body = changes
        .map((c) => describePolicyChange(c.name, c.delta, meta))
        .join("");

      // Categories let a reader filter by service, which is the axis they
      // actually care about when a feed carries hundreds of policy names.
      const services = new Set();
      for (const { delta } of changes) {
        for (const action of (delta && delta.actionsAdded) || []) {
          services.add(action.split(":", 1)[0].toLowerCase());
        }
      }

      return {
        title,
        link:
          names.length === 1
            ? `${SITE_URL}/policies/${encodeURIComponent(names[0])}/`
            : `${SITE_URL}/policies/`,
        guid: commitUrl,
        date: commit.date,
        categories: ["IAM Policy", ...[...services].sort().slice(0, 10)],
        enclosure: names.length === 1 ? policyEnclosure(names[0]) : null,
        description: `${body}<p><a href="${commitUrl}">View the diff on GitHub</a></p>`,
      };
    });

  const policyFeed = buildRSSFeed(
    {
      title: "IAMTrail - IAM Policy Changes",
      link: `${SITE_URL}/policies/`,
      description: "Track changes to AWS Managed IAM Policies. An unofficial archive by zoph.io.",
      feedUrl: `${SITE_URL}/feeds/iam-policies.xml`,
    },
    policyItems
  );
  fs.writeFileSync(path.join(FEEDS_DIR, "iam-policies.xml"), policyFeed);
  console.log(`   📡 IAM Policies feed: ${policyItems.length} items`);

  // --- Endpoints feed ---
  const endpointItems = (endpointsData.allChangeRecords || [])
    .sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at))
    .slice(0, MAX_ITEMS)
    .map((r) => {
      const summary = summarizeEndpointChanges(r);
      const changeList = (r.changes || []).map(describeEndpointChange).join("");
      const partitions = [
        ...new Set((r.changes || []).map((c) => c.partition).filter(Boolean)),
      ].sort();
      return {
        title: `Endpoint changes: ${summary}`,
        link: `${SITE_URL}/endpoints/`,
        guid: r.botocore_commit_url || `iamtrail:endpoints:${r.detected_at}`,
        date: r.detected_at,
        categories: ["Endpoints", ...partitions],
        description: `<p>${escapeXml(summary)}</p><ul>${changeList}</ul>${
          r.botocore_commit_url
            ? `<p><a href="${escapeXml(r.botocore_commit_url)}">botocore commit</a></p>`
            : ""
        }`,
      };
    });

  const endpointsFeed = buildRSSFeed(
    {
      title: "IAMTrail - Endpoint Changes",
      link: `${SITE_URL}/endpoints/`,
      description: "Track changes to AWS service endpoints from botocore. An unofficial archive by zoph.io.",
      feedUrl: `${SITE_URL}/feeds/endpoints.xml`,
    },
    endpointItems
  );
  fs.writeFileSync(path.join(FEEDS_DIR, "endpoints.xml"), endpointsFeed);
  console.log(`   📡 Endpoints feed: ${endpointItems.length} items`);

  // --- GuardDuty feed ---
  // Titles are always prefixed with "GuardDuty" so feed items remain
  // unambiguous when surfaced alongside unrelated content (Slack, readers, etc.).
  const GUARDDUTY_TYPE_LABELS = {
    NEW_FINDINGS: "GuardDuty New Finding",
    UPDATED_FINDINGS: "GuardDuty Updated Finding",
    NEW_FEATURES: "GuardDuty New Feature",
    NEW_REGION: "GuardDuty New Region",
    GENERAL: "GuardDuty Announcement",
  };

  const FINDING_TYPES = new Set(["NEW_FINDINGS", "UPDATED_FINDINGS"]);

  const guarddutyItems = (guarddutyData.announcements || [])
    .sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at))
    .slice(0, MAX_ITEMS)
    .map((a) => {
      const label =
        GUARDDUTY_TYPE_LABELS[a.type] ||
        `GuardDuty ${a.type
          .toLowerCase()
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")}`;

      // Findings store the finding type ID in short_description (use it verbatim).
      // Features/regions/general truncate descriptions mid-word; build a clean
      // word-boundary title from the full description instead.
      const isFinding = FINDING_TYPES.has(a.type);
      const sourceText = isFinding
        ? a.short_description || a.description || ""
        : a.description || a.short_description || "";
      const cleanTitle = isFinding
        ? sourceText
        : smartTruncate(sourceText, 120);
      const title = cleanTitle ? `${label}: ${cleanTitle}` : label;

      const descParts = [];
      if (a.description) descParts.push(`<p>${escapeXml(a.description)}</p>`);
      if (a.link) descParts.push(`<p><a href="${escapeXml(a.link)}">AWS Documentation</a></p>`);
      if (a.gist_url) descParts.push(`<p><a href="${escapeXml(a.gist_url)}">Raw SNS message</a></p>`);
      descParts.push(`<p><a href="${SITE_URL}/guardduty/">View on IAMTrail</a></p>`);

      // AWS publishes several findings in one SNS batch, so detected_at and type
      // are shared. Keying on those alone gave two distinct findings the same
      // guid, and a reader that dedupes by guid showed only one of them.
      //
      // link is deliberately not part of the chain: several announcements can
      // point at one documentation page (every retired finding links to the same
      // "retired findings" page), so it identifies a topic, not an announcement.
      const guid =
        a.gist_url ||
        `iamtrail:guardduty:${a.detected_at}:${a.type}:${slugify(sourceText)}`;

      return {
        title,
        link: a.link || a.gist_url || `${SITE_URL}/guardduty/`,
        guid,
        date: a.detected_at,
        categories: ["GuardDuty", label.replace(/^GuardDuty /, "")],
        description: descParts.join(""),
      };
    });

  const guarddutyFeed = buildRSSFeed(
    {
      title: "IAMTrail - GuardDuty Announcements",
      link: `${SITE_URL}/guardduty/`,
      description: "Track AWS GuardDuty SNS announcements - new findings, features, and region launches. An unofficial archive by zoph.io.",
      feedUrl: `${SITE_URL}/feeds/guardduty.xml`,
    },
    guarddutyItems
  );
  fs.writeFileSync(path.join(FEEDS_DIR, "guardduty.xml"), guarddutyFeed);
  console.log(`   📡 GuardDuty feed: ${guarddutyItems.length} items`);

  // --- Discoveries feed ---
  // The archive's strongest signal, and until now the only one with no feed: an
  // IAM action or service prefix appearing for the very first time, which is
  // usually how a service AWS has not announced becomes visible.
  const discoveryItems = [
    ...(policyData.discoveredServices || []).map((s) => ({
      sortKey: `${s.firstSeen}|0|${s.prefix}`,
      title: wording.sentence(wording.newServicePhrase([s.prefix])),
      link: `${SITE_URL}/discoveries/`,
      guid: `iamtrail:discovery:service:${s.prefix}`,
      date: s.firstSeen,
      categories: ["Discovery", "New AWS service", s.prefix],
      description:
        `<p><strong>${escapeXml(serviceLabel(s.prefix, meta))}</strong> appeared in an AWS managed IAM policy ` +
        `for the first time, in <a href="${SITE_URL}/policies/${encodeURIComponent(
          s.firstPolicy
        )}/">${escapeXml(s.firstPolicy)}</a>.</p>` +
        `<p>${escapeXml(wording.plural(s.actionCount, "action"))} on this prefix ${
          s.actionCount === 1 ? "is" : "are"
        } now tracked.</p>` +
        `<p><a href="${SITE_URL}/discoveries/">View all discoveries</a></p>`,
    })),
    ...groupDiscoveredActions(policyData.discoveredActions || []).map((g) => {
      const escalations = g.actions.filter((a) =>
        meta.permissionsManagement.has(a.toLowerCase())
      );
      const links = g.actions
        .slice(0, 40)
        .map((a) =>
          g.hasPage[a]
            ? `<a href="${SITE_URL}/actions/${iamActionToSlug(a)}/">${escapeXml(a)}</a>`
            : escapeXml(a)
        )
        .join(", ");
      const extra = g.actions.length - Math.min(g.actions.length, 40);
      const single = g.actions.length === 1;

      return {
        sortKey: `${g.firstSeen}|1|${g.prefix}`,
        title: single
          ? `${wording.sentence(wording.neverBeforeSeen(1))}: ${g.actions[0]}`
          : `${wording.sentence(
              wording.neverBeforeSeen(g.actions.length)
            )} on ${serviceLabel(g.prefix, meta)}`,
        link:
          single && g.hasPage[g.actions[0]]
            ? `${SITE_URL}/actions/${iamActionToSlug(g.actions[0])}/`
            : `${SITE_URL}/discoveries/`,
        guid: `iamtrail:discovery:actions:${g.firstSeen}:${g.prefix}`,
        date: g.firstSeen,
        categories: ["Discovery", "Never-before-seen action", g.prefix],
        description:
          `<p>${escapeXml(
            wording.sentence(wording.neverBeforeSeen(g.actions.length))
          )} on <strong>${escapeXml(serviceLabel(g.prefix, meta))}</strong>, ` +
          `first seen in ${[...g.policies]
            .slice(0, 3)
            .map(
              (p) =>
                `<a href="${SITE_URL}/policies/${encodeURIComponent(p)}/">${escapeXml(p)}</a>`
            )
            .join(", ")}.</p>` +
          (escalations.length
            ? `<p><strong>Permissions management</strong>: ${listActions(escalations)}</p>`
            : "") +
          `<p>${links}${extra > 0 ? ` and ${extra} more` : ""}</p>` +
          `<p><a href="${SITE_URL}/discoveries/">View all discoveries</a></p>`,
      };
    }),
  ]
    // A service prefix outranks a single action on the same day, since the
    // prefix is the finding and the actions under it merely follow from it.
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, MAX_ITEMS);

  const discoveriesFeed = buildRSSFeed(
    {
      title: "IAMTrail - Discoveries",
      link: `${SITE_URL}/discoveries/`,
      description:
        "First-ever sightings of AWS IAM service prefixes and actions, often visible here before AWS announces the service. An unofficial archive by zoph.io.",
      feedUrl: `${SITE_URL}/feeds/discoveries.xml`,
    },
    discoveryItems
  );
  fs.writeFileSync(path.join(FEEDS_DIR, "discoveries.xml"), discoveriesFeed);
  console.log(`   📡 Discoveries feed: ${discoveryItems.length} items`);

  // --- All-in-One feed ---
  // Quotas rather than a plain merge: policy churn runs an order of magnitude
  // hotter than the other sources, so a straight date sort left this feed with
  // 44 policy items and a single GuardDuty one, making "All Changes" a
  // misnomer for the very readers who chose it to avoid missing anything.
  const QUOTAS = [
    [discoveryItems, 8],
    [policyItems, 22],
    [endpointItems, 12],
    [guarddutyItems, 8],
  ];
  const allItems = QUOTAS.flatMap(([items, quota]) => items.slice(0, quota))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, MAX_ITEMS);

  const allFeed = buildRSSFeed(
    {
      title: "IAMTrail - All Changes",
      link: SITE_URL,
      description: "All IAMTrail changes in one feed - discoveries, IAM policies, endpoints, and GuardDuty announcements. An unofficial archive by zoph.io.",
      feedUrl: `${SITE_URL}/feeds/all.xml`,
    },
    allItems
  );
  fs.writeFileSync(path.join(FEEDS_DIR, "all.xml"), allFeed);
  console.log(`   📡 All-in-One feed: ${allItems.length} items`);
}

async function main() {
  const policyData = await generatePolicyData();
  const endpointsData = await generateEndpointsData();
  const guarddutyData = await generateGuardDutyData();
  generateRSSFeeds(policyData, endpointsData, guarddutyData);
  await generateUsageStats();
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

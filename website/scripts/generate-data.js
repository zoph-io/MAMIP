const fs = require("fs");
const path = require("path");
const https = require("https");
const { simpleGit } = require("simple-git");
const yaml = require("js-yaml");

const REPO_ROOT = path.join(__dirname, "../..");
const POLICIES_DIR = path.join(REPO_ROOT, "policies");
const FINDINGS_DIR = path.join(REPO_ROOT, "findings");
const OUTPUT_DIR = path.join(__dirname, "../public/data");
const PUBLIC_DIR = path.join(__dirname, "../public");
const SITE_URL = "https://mamip.zoph.io";
const git = simpleGit(REPO_ROOT);

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

async function generatePolicyData() {
  console.log("🔍 Scanning policies directory...");

  // Read all policy files
  const policyFiles = fs
    .readdirSync(POLICIES_DIR)
    .filter((file) => !file.startsWith(".") && file !== "README.md");

  console.log(`📊 Found ${policyFiles.length} policies`);

  const policies = [];
  const errors = [];

  for (const policyName of policyFiles) {
    try {
      const policyPath = path.join(POLICIES_DIR, policyName);
      const relativePath = `policies/${policyName}`;

      // Read policy content
      const content = fs.readFileSync(policyPath, "utf8");
      let policyData;
      try {
        policyData = JSON.parse(content);
      } catch (e) {
        console.warn(`⚠️  Could not parse JSON for ${policyName}, skipping`);
        continue;
      }

      // Get git history
      const logs = await git.log({ file: relativePath, maxCount: 100 });

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
          const actions = stmt.Action || stmt.NotAction || [];
          const actionArray = Array.isArray(actions) ? actions : [actions];
          actionCount += actionArray.length;
          for (const action of actionArray) {
            if (typeof action === "string") {
              const prefix = action.split(":")[0];
              if (prefix && prefix !== "*") {
                servicePrefixes.add(prefix.toLowerCase());
              }
            }
          }
        }
      } catch (e) {
        // skip action parsing errors
      }

      const firstSeenDate =
        logs.all.length > 0
          ? logs.all[logs.all.length - 1].date
          : stats.mtime.toISOString();

      const policy = {
        name: policyName,
        createDate: policyData.PolicyVersion?.CreateDate || null,
        versionId: policyData.PolicyVersion?.VersionId || null,
        lastModified: logs.latest
          ? logs.latest.date
          : stats.mtime.toISOString(),
        versionsCount: logs.total,
        size: stats.size,
        actionCount,
        servicePrefixes: [...servicePrefixes],
        firstSeen: firstSeenDate,
        history: logs.all.slice(0, 10).map((log) => ({
          hash: log.hash,
          date: log.date,
          message: log.message,
          author: log.author_name,
        })),
      };

      policies.push(policy);

      // Save individual policy with full content
      const policyDetail = {
        ...policy,
        content: policyData,
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

  // Find brand new policies (v1 version = new AWS service/feature)
  const brandNewPolicies = [...policies]
    .filter((p) => p.versionId === "v1")
    .sort(
      (a, b) =>
        new Date(b.createDate || b.lastModified) -
        new Date(a.createDate || a.lastModified)
    )
    .slice(0, 20);

  const stats = {
    totalPolicies: policies.length,
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

  // Read deprecated policies
  const deprecatedPath = path.join(REPO_ROOT, "DEPRECATED.json");
  let deprecated = {};
  if (fs.existsSync(deprecatedPath)) {
    deprecated = JSON.parse(fs.readFileSync(deprecatedPath, "utf8"));
  }

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

  // Aggregate findings from Access Analyzer validation
  console.log("🔎 Aggregating policy validation findings...");
  try {
    const findingsFiles = fs
      .readdirSync(FINDINGS_DIR)
      .filter((f) => f.endsWith(".json"));

    const byType = { ERROR: 0, SECURITY_WARNING: 0, WARNING: 0, SUGGESTION: 0 };
    const findingsPolicies = [];

    for (const file of findingsFiles) {
      try {
        const raw = JSON.parse(
          fs.readFileSync(path.join(FINDINGS_DIR, file), "utf8")
        );
        const policyName = file.replace(/\.json$/, "");
        const stripped = raw.map((f) => ({
          findingType: f.findingType,
          findingDetails: f.findingDetails,
          issueCode: f.issueCode,
          learnMoreLink: f.learnMoreLink,
        }));
        for (const f of stripped) {
          if (byType[f.findingType] !== undefined) byType[f.findingType]++;
        }
        findingsPolicies.push({ name: policyName, findings: stripped });
      } catch (e) {
        // skip unparseable findings files
      }
    }

    findingsPolicies.sort((a, b) => a.name.localeCompare(b.name));

    const findingsData = {
      lastUpdated: new Date().toISOString().split("T")[0],
      totalPoliciesAnalyzed: policies.length,
      policiesWithFindings: findingsPolicies.length,
      byType,
      policies: findingsPolicies,
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "findings.json"),
      JSON.stringify(findingsData, null, 2)
    );
    console.log(
      `   🛡️  Findings: ${findingsPolicies.length} policies, ${Object.values(byType).reduce((a, b) => a + b, 0)} total findings`
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
    { loc: "/about/", priority: "0.5", changefreq: "monthly" },
  ];
  policies.forEach((p) => {
    sitemapEntries.push({
      loc: `/policies/${encodeURIComponent(p.name)}/`,
      priority: "0.6",
      changefreq: "weekly",
    });
  });
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
}

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

generatePolicyData().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});

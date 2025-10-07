const fs = require("fs");
const path = require("path");
const { simpleGit } = require("simple-git");

const REPO_ROOT = path.join(__dirname, "../..");
const POLICIES_DIR = path.join(REPO_ROOT, "policies");
const OUTPUT_DIR = path.join(__dirname, "../public/data");
const git = simpleGit(REPO_ROOT);

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

      const policy = {
        name: policyName,
        createDate: policyData.PolicyVersion?.CreateDate || null,
        versionId: policyData.PolicyVersion?.VersionId || null,
        lastModified: logs.latest
          ? logs.latest.date
          : stats.mtime.toISOString(),
        versionsCount: logs.total,
        size: stats.size,
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
      .filter((p) => p.createDate)
      .sort((a, b) => new Date(a.createDate) - new Date(b.createDate))
      .slice(0, 10),
    brandNew: brandNewPolicies,
  };

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
    })),
    deprecated,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

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

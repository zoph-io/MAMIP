#!/usr/bin/env node

const https = require("https");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "../..");
const ENDPOINTS_PATH = path.join(REPO_ROOT, "data/endpoints.json");
const CHANGES_DIR = path.join(REPO_ROOT, "data/endpoint-changes");
const BOTOCORE_RAW_URL =
  "https://raw.githubusercontent.com/boto/botocore/develop/botocore/data/endpoints.json";
const BOTOCORE_COMMITS_API =
  "https://api.github.com/repos/boto/botocore/commits?path=botocore/data/endpoints.json&per_page=1";

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { "User-Agent": "IAMTrail-EndpointMonitor/1.0" },
    };
    https
      .get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJSON(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
          }
        });
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { "User-Agent": "IAMTrail-EndpointMonitor/1.0" },
    };
    https
      .get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchText(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function setDiff(a, b) {
  const setB = new Set(b);
  return a.filter((x) => !setB.has(x));
}

function buildPartitionIndex(partitions) {
  const index = {};
  for (const p of partitions) {
    index[p.partition] = p;
  }
  return index;
}

function getEndpointRegions(service) {
  if (!service || !service.endpoints) return [];
  return Object.keys(service.endpoints).filter(
    (k) => !k.startsWith("fips-") && k !== "aws-global" && k !== "aws-cn-global" && k !== "aws-us-gov-global"
  );
}

function detectChanges(oldData, newData) {
  const changes = [];
  const oldIndex = buildPartitionIndex(oldData.partitions);
  const newIndex = buildPartitionIndex(newData.partitions);
  const oldPartitionNames = Object.keys(oldIndex);
  const newPartitionNames = Object.keys(newIndex);

  const addedPartitions = setDiff(newPartitionNames, oldPartitionNames);
  const removedPartitions = setDiff(oldPartitionNames, newPartitionNames);

  for (const p of addedPartitions) {
    changes.push({
      type: "new_partition",
      partition: p,
      id: p,
      description: newIndex[p].partitionName,
    });
  }
  for (const p of removedPartitions) {
    changes.push({
      type: "removed_partition",
      partition: p,
      id: p,
      description: oldIndex[p].partitionName,
    });
  }

  const commonPartitions = newPartitionNames.filter((p) => oldIndex[p]);

  for (const partName of commonPartitions) {
    const oldPart = oldIndex[partName];
    const newPart = newIndex[partName];

    const oldRegionKeys = Object.keys(oldPart.regions || {});
    const newRegionKeys = Object.keys(newPart.regions || {});
    const addedRegions = setDiff(newRegionKeys, oldRegionKeys);
    const removedRegions = setDiff(oldRegionKeys, newRegionKeys);

    for (const r of addedRegions) {
      changes.push({
        type: "new_region",
        partition: partName,
        id: r,
        description: newPart.regions[r]?.description || r,
      });
    }
    for (const r of removedRegions) {
      changes.push({
        type: "removed_region",
        partition: partName,
        id: r,
        description: oldPart.regions[r]?.description || r,
      });
    }

    const oldRegionDescs = oldPart.regions || {};
    const newRegionDescs = newPart.regions || {};
    for (const r of newRegionKeys) {
      if (
        oldRegionDescs[r] &&
        newRegionDescs[r] &&
        oldRegionDescs[r].description !== newRegionDescs[r].description
      ) {
        changes.push({
          type: "region_updated",
          partition: partName,
          id: r,
          description: `${oldRegionDescs[r].description} -> ${newRegionDescs[r].description}`,
        });
      }
    }

    const oldServiceKeys = Object.keys(oldPart.services || {});
    const newServiceKeys = Object.keys(newPart.services || {});
    const addedServices = setDiff(newServiceKeys, oldServiceKeys);
    const removedServices = setDiff(oldServiceKeys, newServiceKeys);

    for (const s of addedServices) {
      const endpointCount = Object.keys(newPart.services[s]?.endpoints || {}).length;
      changes.push({
        type: "new_service",
        partition: partName,
        id: s,
        description: `${s} (${endpointCount} endpoint${endpointCount !== 1 ? "s" : ""})`,
        endpoint_count: endpointCount,
      });
    }
    for (const s of removedServices) {
      changes.push({
        type: "removed_service",
        partition: partName,
        id: s,
        description: s,
      });
    }

    const commonServices = newServiceKeys.filter((s) => oldPart.services?.[s]);
    for (const s of commonServices) {
      const oldRegions = getEndpointRegions(oldPart.services[s]);
      const newRegions = getEndpointRegions(newPart.services[s]);
      const expandedTo = setDiff(newRegions, oldRegions);
      const contractedFrom = setDiff(oldRegions, newRegions);

      if (expandedTo.length > 0) {
        changes.push({
          type: "service_expansion",
          partition: partName,
          service: s,
          id: s,
          new_regions: expandedTo,
          description: `${s} expanded to ${expandedTo.join(", ")}`,
        });
      }
      if (contractedFrom.length > 0) {
        changes.push({
          type: "service_contraction",
          partition: partName,
          service: s,
          id: s,
          removed_regions: contractedFrom,
          description: `${s} removed from ${contractedFrom.join(", ")}`,
        });
      }
    }
  }

  return changes;
}

/** "1 new service" / "2 new services", never the "1 new service(s)" of a lazy template. */
function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm || `${singular}s`}`;
}

/**
 * Count distinct identifiers per change type, not rows.
 *
 * botocore ships the same service across several partitions in one commit, so
 * counting rows announced "5 new services" when AWS had added three.
 */
function buildSummary(changes) {
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
    if (distinct[type]) parts.push(plural(distinct[type].size, label));
  }
  return parts.join(", ") || "endpoint changes detected";
}

// Bluesky rejects a post longer than this. Tags are the only discovery surface
// the account has, so they are budgeted alongside the links rather than dropped.
const BLUESKY_LIMIT = 300;
const BLUESKY_TAGS = "#AWS #CloudComputing";

function buildBlueskyMessage(changes, commitHash) {
  const shortHash = (commitHash || "").slice(0, 7);
  const commitUrl = commitHash
    ? `https://github.com/boto/botocore/commit/${shortHash}`
    : "";

  // Distinct identifiers, so one service arriving in three partitions is one
  // new service rather than three.
  const distinct = (type, key) => [
    ...new Set(changes.filter((c) => c.type === type).map((c) => c[key])),
  ];
  const newRegions = changes.filter((c) => c.type === "new_region");
  const newServices = distinct("new_service", "id");
  const expansions = changes.filter((c) => c.type === "service_expansion");

  let body = "";
  if (newRegions.length > 0) {
    const names = [
      ...new Set(newRegions.map((r) => `${r.id} (${r.description})`)),
    ].join(", ");
    body = `${plural(newRegions.length, "new AWS region")}: ${names}`;
  } else if (newServices.length > 0) {
    body = `${plural(newServices.length, "new AWS service")}: ${newServices.join(", ")}`;
  } else if (expansions.length > 0) {
    const svc = expansions[0];
    body = `${svc.service} expanded to ${svc.new_regions.join(", ")}`;
  } else {
    body = buildSummary(changes);
  }
  body = sentence(body);

  const suffix = `\n\n${commitUrl}\niamtrail.com/endpoints\n\n${BLUESKY_TAGS}`;
  const maxBody = BLUESKY_LIMIT - suffix.length;
  if (body.length > maxBody) {
    body = body.slice(0, maxBody - 3) + "...";
  }
  return body + suffix;
}

/** Uppercase the first character only, so "AWS" survives. */
function sentence(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function buildDiscordDescription(changes, commitHash) {
  const lines = [];

  for (const c of changes) {
    const label = {
      new_region: "New Region",
      removed_region: "Removed Region",
      new_service: "New Service",
      removed_service: "Removed Service",
      service_expansion: "Service Expansion",
      service_contraction: "Service Contraction",
      new_partition: "New Partition",
      region_updated: "Region Updated",
    }[c.type] || c.type;

    if (c.type === "service_expansion" && c.new_regions) {
      lines.push(`**${label}** \`${c.partition}\`\n\`${c.service}\` → ${c.new_regions.map(r => `\`${r}\``).join(", ")}`);
    } else if (c.type === "service_contraction" && c.removed_regions) {
      lines.push(`**${label}** \`${c.partition}\`\n\`${c.service}\` removed from ${c.removed_regions.map(r => `\`${r}\``).join(", ")}`);
    } else if (c.type === "new_region") {
      lines.push(`**${label}** \`${c.partition}\`\n\`${c.id}\` - ${c.description}`);
    } else if (c.type === "new_service") {
      lines.push(`**${label}** \`${c.partition}\`\n\`${c.id}\` (${c.endpoint_count || 0} endpoints)`);
    } else {
      lines.push(`**${label}** \`${c.partition}\`\n${c.description}`);
    }
  }

  const commitLine = commitHash
    ? `\n[botocore commit](https://github.com/boto/botocore/commit/${commitHash.slice(0, 7)})`
    : "";

  const body = lines.join("\n\n");
  const maxLen = 4000 - commitLine.length;
  const truncated = body.length > maxLen ? body.slice(0, maxLen - 3) + "..." : body;
  return truncated + commitLine;
}

function setOutput(key, value) {
  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    fs.appendFileSync(ghOutput, `${key}=${value}\n`);
  }
  console.log(`::set-output name=${key}::${value}`);
}

async function main() {
  console.log("Fetching latest endpoints.json from botocore...");
  const latestData = await fetchJSON(BOTOCORE_RAW_URL);

  let commitHash = "";
  try {
    console.log("Fetching latest botocore commit for endpoints.json...");
    const commits = await fetchJSON(BOTOCORE_COMMITS_API);
    if (Array.isArray(commits) && commits.length > 0) {
      commitHash = commits[0].sha || "";
    }
  } catch (err) {
    console.warn("Could not fetch botocore commit hash:", err.message);
  }

  if (!fs.existsSync(ENDPOINTS_PATH)) {
    console.log("No previous endpoints.json found. Saving baseline...");
    fs.writeFileSync(ENDPOINTS_PATH, JSON.stringify(latestData, null, 2));
    setOutput("CHANGES_DETECTED", "false");
    console.log("Baseline saved. No diff to report.");
    return;
  }

  console.log("Loading previous endpoints.json...");
  const previousData = JSON.parse(fs.readFileSync(ENDPOINTS_PATH, "utf8"));

  console.log("Detecting changes...");
  const changes = detectChanges(previousData, latestData);

  if (changes.length === 0) {
    console.log("No endpoint changes detected.");
    setOutput("CHANGES_DETECTED", "false");
    return;
  }

  console.log(`Detected ${plural(changes.length, "change")}:`);
  for (const c of changes) {
    console.log(`  - [${c.type}] ${c.partition}: ${c.description}`);
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
  const changeRecord = {
    detected_at: now.toISOString(),
    botocore_commit: commitHash,
    botocore_commit_url: commitHash
      ? `https://github.com/boto/botocore/commit/${commitHash}`
      : null,
    summary: buildSummary(changes),
    changes,
  };

  if (!fs.existsSync(CHANGES_DIR)) {
    fs.mkdirSync(CHANGES_DIR, { recursive: true });
  }

  const changeFile = path.join(CHANGES_DIR, `${timestamp}.json`);
  fs.writeFileSync(changeFile, JSON.stringify(changeRecord, null, 2));
  console.log(`Change record written to ${changeFile}`);

  fs.writeFileSync(ENDPOINTS_PATH, JSON.stringify(latestData, null, 2));
  console.log("Updated data/endpoints.json with latest version.");

  const message = buildBlueskyMessage(changes, commitHash);
  setOutput("CHANGES_DETECTED", "true");
  setOutput("CHANGE_SUMMARY", changeRecord.summary);
  setOutput("CHANGE_FILE", path.basename(changeFile));

  const discordDesc = buildDiscordDescription(changes, commitHash);

  const ghEnv = process.env.GITHUB_ENV;
  if (ghEnv) {
    fs.appendFileSync(ghEnv, `ENDPOINT_MESSAGE<<EOF\n${message}\nEOF\n`);
    fs.appendFileSync(ghEnv, `ENDPOINT_SUMMARY=${changeRecord.summary}\n`);
    fs.appendFileSync(ghEnv, `ENDPOINT_CHANGE_COUNT=${changes.length}\n`);
    fs.appendFileSync(
      ghEnv,
      `ENDPOINT_CHANGE_FILE=${path.basename(changeFile)}\n`
    );
    fs.appendFileSync(
      ghEnv,
      `ENDPOINT_DISCORD_DESC<<EOF\n${discordDesc}\nEOF\n`
    );

    const dynamoItems = changes.map((c) => ({
      detected_date: now.toISOString().slice(0, 10),
      change_id: `${c.type}#${c.partition}#${c.id}`,
      change_type: c.type,
      partition: c.partition,
      identifier: c.id,
      description: c.description,
      botocore_commit_url: changeRecord.botocore_commit_url || "",
      detected_at: now.toISOString(),
    }));
    fs.appendFileSync(
      ghEnv,
      `ENDPOINT_DYNAMO_ITEMS<<EOF\n${JSON.stringify(dynamoItems)}\nEOF\n`
    );
  }

  console.log("\nTweet-ready message:");
  console.log(message);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

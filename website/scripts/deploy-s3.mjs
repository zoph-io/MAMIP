#!/usr/bin/env node
/**
 * Incremental S3 deploy for the static export in `out/`.
 *
 * Replaces `aws s3 sync --delete`, which is mtime-based: a fresh CI checkout
 * makes every local file look newer than S3, so all ~36k objects re-upload on
 * every deploy (~17 min, ~36k PUTs). This script diffs by content instead:
 *
 *   1. ListObjectsV2 (paginated) -> map of key -> ETag. All our objects are
 *      single-part PutObjects, so ETag == MD5 of the body.
 *   2. Walk `out/`, compute each file's MD5, upload only new/changed files
 *      (with the same Cache-Control rules as the old sync + explicit
 *      Content-Type).
 *   3. Delete S3 keys that no longer exist locally.
 *
 * Usage:
 *   node scripts/deploy-s3.mjs --bucket iamtrail.com [--dir out] [--dry-run]
 *
 * Credentials come from the default AWS provider chain (env, SSO, aws-vault).
 */

import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    bucket: null,
    dir: "out",
    dryRun: false,
    concurrency: 32,
    invalidationManifest: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bucket") args.bucket = argv[++i];
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--concurrency") args.concurrency = parseInt(argv[++i], 10);
    else if (a === "--invalidation-manifest") {
      args.invalidationManifest = argv[++i];
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!args.bucket) {
    console.error(
      "Usage: node scripts/deploy-s3.mjs --bucket <bucket> [--dir out] [--dry-run]\n" +
        "         [--invalidation-manifest <path>]"
    );
    process.exit(2);
  }
  return args;
}

// Short-cache types must match the old `aws s3 sync` include rules so
// HTML/JSON/feeds keep revalidating through CloudFront.
const SHORT_CACHE_EXTS = new Set([".html", ".json", ".txt", ".xml"]);
const CACHE_SHORT = "public, max-age=0, must-revalidate";
const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
// The published API is polled by scripts rather than read by a browser that is
// about to navigate, so it trades a few minutes of staleness for not hitting
// the origin on every request. The scraper runs hourly, so five minutes costs
// a consumer nothing real.
const CACHE_API = "public, max-age=300, stale-while-revalidate=3600";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".json": "application/json",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/vnd.microsoft.icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf",
};

function contentTypeFor(key) {
  const ext = path.extname(key).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function cacheControlFor(key) {
  // Only the versioned payloads, not the /api/ documentation page, which is
  // ordinary HTML and should revalidate like the rest of the site.
  if (key.startsWith("api/v")) return CACHE_API;
  const ext = path.extname(key).toLowerCase();
  return SHORT_CACHE_EXTS.has(ext) ? CACHE_SHORT : CACHE_IMMUTABLE;
}

/**
 * Beyond this, a wildcard is both cheaper and kinder than naming every path.
 * CloudFront bills per path after 1,000 a month and "/*" counts as one, so a
 * long explicit list is the expensive option, not the frugal one.
 */
const MAX_INVALIDATION_PATHS = 40;

/**
 * The paths a deploy actually has to invalidate.
 *
 * Everything short-cached (.html/.json/.xml/.txt) ships
 * "max-age=0, must-revalidate", so CloudFront already revalidates it against S3
 * on every request and an invalidation changes nothing for it. Immutable
 * objects are the real target: Next.js hashes its asset filenames, so in
 * practice this is the per-policy Open Graph images, which keep their path and
 * change their bytes.
 *
 * The previous blanket "/*" therefore bought no freshness and dumped the entire
 * edge cache roughly thirteen times a day, making every asset on the next
 * request a miss back to the origin.
 */
function invalidationPathsFor(changedKeys) {
  const paths = changedKeys
    .filter((key) => !SHORT_CACHE_EXTS.has(path.extname(key).toLowerCase()))
    .map((key) => `/${key}`)
    .sort();

  if (paths.length > MAX_INVALIDATION_PATHS) {
    return { paths: ["/*"], truncated: true, candidateCount: paths.length };
  }
  return { paths, truncated: false, candidateCount: paths.length };
}

function walkFiles(dir, base = dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, base, acc);
    } else if (entry.isFile()) {
      if (entry.name === ".DS_Store") continue;
      // S3 keys always use forward slashes
      acc.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return acc;
}

function md5Hex(filePath) {
  return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
}

async function listRemote(s3, bucket) {
  const etags = new Map();
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
      })
    );
    for (const obj of res.Contents || []) {
      // Multipart ETags contain "-"; they never equal an MD5 so those objects
      // simply re-upload once and become single-part (self-healing).
      etags.set(obj.Key, (obj.ETag || "").replace(/"/g, ""));
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return etags;
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  const errors = [];
  async function lane() {
    while (index < items.length) {
      const item = items[index++];
      try {
        await worker(item);
      } catch (err) {
        errors.push({ item, err });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, lane)
  );
  return errors;
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(__dirname, "..", args.dir);
  if (!fs.existsSync(outDir)) {
    console.error(`Local directory not found: ${outDir}`);
    process.exit(1);
  }

  const s3 = new S3Client({});

  console.log(`Listing s3://${args.bucket} ...`);
  const remote = await listRemote(s3, args.bucket);
  console.log(`  ${remote.size} remote objects`);

  console.log(`Scanning ${outDir} ...`);
  const localKeys = walkFiles(outDir);
  console.log(`  ${localKeys.length} local files`);

  const toUpload = [];
  let unchanged = 0;
  for (const key of localKeys) {
    const localMd5 = md5Hex(path.join(outDir, key));
    if (remote.get(key) === localMd5) {
      unchanged++;
    } else {
      toUpload.push(key);
    }
  }

  const localSet = new Set(localKeys);
  const toDelete = [...remote.keys()].filter((key) => !localSet.has(key));

  console.log(
    `Diff: ${toUpload.length} to upload, ${toDelete.length} to delete, ${unchanged} unchanged`
  );

  const invalidation = invalidationPathsFor([...toUpload, ...toDelete]);
  if (args.invalidationManifest) {
    fs.writeFileSync(
      args.invalidationManifest,
      JSON.stringify(invalidation, null, 2)
    );
  }
  const pathCount = invalidation.paths.length;
  console.log(
    pathCount === 0
      ? "Invalidation: none needed, every changed object revalidates on request"
      : invalidation.truncated
        ? `Invalidation: wildcard, ${invalidation.candidateCount} immutable objects changed`
        : `Invalidation: ${pathCount} ${pathCount === 1 ? "path" : "paths"}`
  );

  if (args.dryRun) {
    for (const key of toUpload) console.log(`  PUT    ${key}`);
    for (const key of toDelete) console.log(`  DELETE ${key}`);
    console.log("Dry run: no changes made.");
    return;
  }

  let uploadedBytes = 0;
  const uploadErrors = await runPool(
    toUpload,
    async (key) => {
      const filePath = path.join(outDir, key);
      const body = fs.readFileSync(filePath);
      await s3.send(
        new PutObjectCommand({
          Bucket: args.bucket,
          Key: key,
          Body: body,
          ContentType: contentTypeFor(key),
          CacheControl: cacheControlFor(key),
        })
      );
      uploadedBytes += body.length;
    },
    args.concurrency
  );

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: args.bucket,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
    deleted += batch.length - (res.Errors || []).length;
    for (const e of res.Errors || []) {
      uploadErrors.push({ item: e.Key, err: new Error(e.Message) });
    }
  }

  console.log(
    `Done: uploaded ${toUpload.length - uploadErrors.filter((e) => toUpload.includes(e.item)).length}/${toUpload.length} files (${(uploadedBytes / 1024 / 1024).toFixed(1)} MiB), deleted ${deleted}/${toDelete.length}, ${unchanged} unchanged`
  );

  if (uploadErrors.length > 0) {
    console.error(`${uploadErrors.length} error(s):`);
    for (const { item, err } of uploadErrors.slice(0, 20)) {
      console.error(`  ${item}: ${err.message}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

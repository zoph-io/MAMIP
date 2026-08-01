import Link from "next/link";
import type { Metadata } from "next";
import { Braces, Code2, Terminal } from "lucide-react";
import RelatedPages from "@/components/RelatedPages";

export const metadata: Metadata = {
  title: "API",
  description:
    "A free, versioned JSON API over the IAMTrail archive of AWS Managed IAM Policy changes. No key, no sign-up, served as static files from CloudFront.",
  alternates: { canonical: "https://iamtrail.com/api" },
};

const BASE = "https://iamtrail.com/api/v1";

type Resource = {
  path: string;
  title: string;
  description: string;
};

const RESOURCES: Resource[] = [
  {
    path: "/index.json",
    title: "Service index",
    description:
      "Contract version, generation timestamp, archive counts and the URL of every other resource. Start here and follow the links rather than hard-coding paths, so a future v2 can move files without breaking you.",
  },
  {
    path: "/policies.json",
    title: "Policy list",
    description:
      "Every tracked AWS managed policy with its ARN, current version, creation and last-modified dates, version count, action count and deprecation date.",
  },
  {
    path: "/policies/{policyName}.json",
    title: "Policy detail",
    description:
      "One policy: its current IAM document plus the full commit history, each entry carrying what that version changed when the change index reaches back that far.",
  },
  {
    path: "/changes.json",
    title: "Change timeline",
    description:
      "The most recent policy changes, newest first, each naming the actions added and removed, any never-before-seen actions or service prefixes, and any permissions management actions gained.",
  },
  {
    path: "/actions.json",
    title: "Action index",
    description:
      "Every literal IAM action seen in a managed policy, mapped to the policies that allow, deny or NotAction it, with the date it was first seen anywhere in the archive.",
  },
  {
    path: "/discoveries.json",
    title: "Discoveries",
    description:
      "Service prefixes and actions that appeared for the first time anywhere in the archive, newest first. AWS usually ships the IAM component before the SDK and the docs.",
  },
];

function Snippet({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-xs font-mono text-zinc-800 dark:text-zinc-200">
      {children}
    </pre>
  );
}

export default function ApiPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div className="py-8 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3 mb-2">
          <Braces className="w-7 h-7 text-red-600 dark:text-red-400" />
          <h1 className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            API
          </h1>
          <span className="inline-block px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded">
            v1
          </span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          The whole archive as JSON. No key and no sign-up - these are static
          files on the same CloudFront distribution that serves the site,
          regenerated on every deploy. Use them in a script, a dashboard, or a
          CI check that fails when a policy you depend on changes.
        </p>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Base URL:{" "}
          <code className="font-mono text-zinc-700 dark:text-zinc-300">
            {BASE}
          </code>
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
            Resources
          </h2>
        </div>
        <div className="space-y-3">
          {RESOURCES.map((r) => (
            <div
              key={r.path}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-white dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">
                  {r.title}
                </h3>
                {r.path.includes("{") ? (
                  <code className="text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all">
                    /api/v1{r.path}
                  </code>
                ) : (
                  <a
                    href={`${BASE}${r.path}`}
                    className="text-xs font-mono text-red-600 dark:text-red-400 hover:underline break-all"
                  >
                    /api/v1{r.path}
                  </a>
                )}
              </div>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {r.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
            Examples
          </h2>
        </div>

        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            What changed in the last day, as one line per policy:
          </p>
          <Snippet>{`curl -s --compressed ${BASE}/changes.json \\
  | jq -r '.changes[]
      | select(.date > (now - 86400 | todate))
      | "\\(.policyName) \\(.versionId): \\(.summary)"'`}</Snippet>
        </div>

        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Every never-before-seen action AWS has shipped recently, which is
            usually the first public sign of an unannounced service:
          </p>
          <Snippet>{`curl -s --compressed ${BASE}/changes.json \\
  | jq -r '.changes[] | select(.newActions | length > 0)
      | "\\(.date[0:10]) \\(.policyName): \\(.newActions | join(", "))"'`}</Snippet>
        </div>

        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Which managed policies grant a given action:
          </p>
          <Snippet>{`curl -s --compressed ${BASE}/actions.json \\
  | jq -r '.actions["kms:Decrypt"].actionAllowPolicies[]'`}</Snippet>
        </div>

        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Watch only the policies you actually have attached:
          </p>
          <Snippet>{`aws iam list-attached-role-policies --role-name my-role \\
  | jq -r '.AttachedPolicies[].PolicyName' \\
  | while read -r name; do
      curl -s --compressed "${BASE}/policies/\${name}.json" \\
        | jq -r '"\\(.name) \\(.versionId) last changed \\(.lastModified)"'
    done`}</Snippet>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
          Stability and fair use
        </h2>
        <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed list-disc pl-5">
          <li>
            Fields are added, never removed or repurposed, within a version. A
            breaking change means a new path under{" "}
            <code className="font-mono text-xs">/api/v2/</code>.
          </li>
          <li>
            Files under <code className="font-mono text-xs">/api/v1/</code> are
            regenerated on every deploy and served with a short cache lifetime.
            The scraper runs hourly on weekdays, so polling more than a few
            times an hour buys you nothing.
          </li>
          <li>
            There is a rate limit of 500 requests per five minutes per IP
            address, which is roughly ten times what any normal use of this API
            needs. Exceed it and you get{" "}
            <code className="font-mono text-xs">429</code> with a JSON body
            until the window clears. If you need bulk access, mirror the files
            rather than fetching them in a loop.
          </li>
          <li>
            Always send{" "}
            <code className="font-mono text-xs">Accept-Encoding: gzip</code>,
            which is what{" "}
            <code className="font-mono text-xs">--compressed</code> does above.
            Plain <code className="font-mono text-xs">curl</code> omits it, and{" "}
            <code className="font-mono text-xs">actions.json</code> is 4.5 MB
            uncompressed against 256 KB gzipped.
          </li>
          <li>
            <code className="font-mono text-xs">changes.json</code> covers the
            recent window that the archive replay indexes. For anything older,
            read a policy&apos;s own{" "}
            <code className="font-mono text-xs">history</code>, which goes back
            to 2019.
          </li>
          <li>
            This is an unofficial archive, not an AWS service, and it carries no
            uptime guarantee. If you need a hard dependency, mirror the files.
          </li>
          <li>
            The data is GPL-3.0, same as the{" "}
            <a
              href="https://github.com/zoph-io/IAMTrail"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 dark:text-red-400 hover:underline"
            >
              repository
            </a>
            . Attribution to IAMTrail is appreciated.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
          Prefer a feed?
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          If you want to read changes rather than process them, the{" "}
          <Link
            href="/feeds"
            className="text-red-600 dark:text-red-400 hover:underline font-medium"
          >
            RSS feeds
          </Link>{" "}
          carry the same information in the same words, and{" "}
          <Link
            href="/subscribe"
            className="text-red-600 dark:text-red-400 hover:underline font-medium"
          >
            email digests
          </Link>{" "}
          can be narrowed to specific policies.
        </p>
      </section>

      <RelatedPages current="/api" />
    </div>
  );
}

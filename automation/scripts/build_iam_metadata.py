#!/usr/bin/env python3
"""Build the compact IAM metadata the notification Lambdas need.

The website already loads the full iam-dataset into action-definitions.json, but
that file is 3.5 MB and only exists in the browser. The Lambdas need two small
facts from it:

- which actions AWS classes as permissions management, because "AWS added
  iam:PassRole to a managed policy" is the one line a security reader wants and
  the notification path cannot currently say it;
- the friendly name behind a service prefix, so a post reads "Oracle
  Database@AWS" rather than "odb".

Both fit in about a hundred kilobytes, small enough to ride along in the Lambda
zip. The result is committed rather than rebuilt in CI: the Service Authorization
Reference moves slowly, and a committed file keeps the deploy from having to push
to main. Refresh with `make iam-metadata` and review the diff.

Stdlib only, so it runs on a bare runner.
"""

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

SOURCE_URL = (
    "https://raw.githubusercontent.com/iann0036/iam-dataset/main/aws/iam_definition.json"
)
SOURCE_NAME = "iam-dataset"
SOURCE_REPO = "https://github.com/iann0036/iam-dataset"
ATTRIBUTION = (
    "Action access levels and service names from iam-dataset (Ian McKay, "
    "github.com/iann0036/iam-dataset), MIT license. Derived from the AWS Service "
    "Authorization Reference; not guaranteed current."
)

METADATA_PATH = "data/iam-metadata.json"
SCHEMA_VERSION = 1
PERMISSIONS_MANAGEMENT = "permissions management"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "IAMTrail/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build(definition):
    """Extract the permissions-management action list and the prefix name map."""
    permissions, service_names = set(), {}

    for service in definition if isinstance(definition, list) else []:
        prefix = str(service.get("prefix") or "").strip()
        if not prefix:
            continue

        name = str(service.get("service_name") or "").strip()
        # Upstream files a few services under "AWS Service - <name>", which reads
        # badly once the prefix is appended: "AWS Service - Oracle Database@AWS
        # (odb)". The bookkeeping prefix is not part of the product name.
        if name.startswith("AWS Service - "):
            name = name[len("AWS Service - "):].strip()
        # A prefix can appear more than once across the dataset; the first
        # non-empty name wins so the output does not depend on iteration order.
        if name:
            service_names.setdefault(prefix.lower(), name)

        for priv in service.get("privileges") or []:
            action = str(priv.get("privilege") or "").strip()
            if not action:
                continue
            # access_level is a single label today but is comma-joined when a
            # privilege carries several, so match on the substring.
            level = str(priv.get("access_level") or "").lower()
            if PERMISSIONS_MANAGEMENT in level:
                permissions.add(f"{prefix}:{action}".lower())

    return sorted(permissions), dict(sorted(service_names.items()))


def write(permissions, service_names, root):
    """One entry per line, so refreshing the file yields a readable diff."""
    path = root / METADATA_PATH
    path.parent.mkdir(parents=True, exist_ok=True)

    head = {
        "schemaVersion": SCHEMA_VERSION,
        "source": SOURCE_NAME,
        "sourceUrl": SOURCE_REPO,
        "sourceLicense": "MIT",
        "attribution": ATTRIBUTION,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stats": {
            "permissionsManagementCount": len(permissions),
            "serviceNameCount": len(service_names),
        },
    }

    with path.open("w") as handle:
        handle.write("{\n")
        for key, value in head.items():
            handle.write(f"  {json.dumps(key)}: {json.dumps(value, sort_keys=True)},\n")

        handle.write('  "permissionsManagement": [\n')
        handle.write(",\n".join(f"    {json.dumps(a)}" for a in permissions))
        handle.write("\n  ],\n")

        handle.write('  "serviceNames": {\n')
        handle.write(
            ",\n".join(
                f"    {json.dumps(k)}: {json.dumps(v)}"
                for k, v in service_names.items()
            )
        )
        handle.write("\n  }\n}\n")

    size = path.stat().st_size
    print(
        f"Wrote {path} ({len(permissions)} permissions-management actions, "
        f"{len(service_names)} service names, {size // 1024} KB)"
    )


def main():
    root = Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
    )

    print(f"Fetching {SOURCE_URL}")
    try:
        definition = fetch(SOURCE_URL)
    except Exception as e:
        print(f"Could not fetch iam-dataset: {e}", file=sys.stderr)
        return 1

    permissions, service_names = build(definition)
    # An empty result means the upstream shape changed. Keeping the previous file
    # is better than shipping Lambdas that silently stop flagging privilege
    # escalation, which would look identical to a quiet week.
    if not permissions or not service_names:
        print("Empty result, refusing to overwrite the committed metadata", file=sys.stderr)
        return 1

    write(permissions, service_names, root)
    return 0


if __name__ == "__main__":
    sys.exit(main())

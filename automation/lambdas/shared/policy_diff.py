"""Resolve and render AWS managed IAM policy changes for IAMTrail emails.

Shared by digest-sender and instant-notifier so both produce identical cards.

A change is resolved from one commit SHA plus one policy name into a semantic
summary (actions added/removed, statement Sids, version bump) plus a trimmed
JSON diff. Two constraints shape the rendering:

- Email clients rewrite foreground colours in dark mode, so meaning is always
  carried by words and by the +/- gutter, never by colour alone.
- The GitHub API allows 60 requests/hour to unauthenticated callers and Lambda
  egress IPs are shared, so a token is required for diffs to be reliable.
- git %h is unique in the scraper's clone, not in GitHub's object store. An
  abbreviated SHA that 422s is expanded via the policy's recent commits.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

GITHUB_REPO = os.environ.get("GITHUB_REPO", "zoph-io/IAMTrail")
GITHUB_SECRET_ID = os.environ.get("GITHUB_SECRET_ID", "")
USER_AGENT = "IAMTrail/1.0"

POLICY_PREFIX = "policies/"
MAX_DIFF_LINES = 40
MAX_LISTED_ITEMS = 12
MAX_CONTEXT_RUN = 2

# A push is not instantly readable through the API, so callers notified at push
# time can arrive before the commit does. Kept short enough to leave the rest of
# the Lambda budget for resolving a full day of changes.
COMMIT_VISIBILITY_ATTEMPTS = 4
COMMIT_VISIBILITY_DELAY = 5

# AWS occasionally rewrites hundreds of policies in one day. Cap the work and
# the payload so those days stay inside the GitHub API budget and below the
# ~102 KB at which Gmail starts clipping messages.
MAX_DETAILED_CHANGES = 40
MAX_DIFF_CARDS = 8
MAX_SECTION_BYTES = 60000
MAX_OVERFLOW_NAMES = 50

# The PolicyVersion wrapper metadata is surfaced as a version badge instead of
# as diff noise, so every change stops looking like a version bump.
_METADATA_KEYS = ('"VersionId"', '"CreateDate"', '"IsDefaultVersion"')

_commit_cache = {}
_blob_cache = {}
_token = None


def clear_cache():
    """Drop per-invocation HTTP caches (the token is kept across invocations)."""
    _commit_cache.clear()
    _blob_cache.clear()


# ──────────────────────────────
# GitHub access
# ──────────────────────────────


def _alert(reason):
    """Log a degradation and page the ops channel about it.

    discord_notifier is imported lazily so this module still works wherever it is not
    bundled, and so an alert can never be the thing that breaks a notification.
    """
    print(f"[policy_diff] {reason}")
    try:
        import discord_notifier

        discord_notifier.send(
            "Policy diffs are degraded",
            reason,
            discord_notifier.COLOR_ERROR,
        )
    except Exception as e:
        print(f"[policy_diff] Could not raise the alert: {e}")


def _github_token():
    global _token
    if _token is not None:
        return _token

    _token = os.environ.get("GITHUB_TOKEN", "")
    if not _token and GITHUB_SECRET_ID:
        try:
            import boto3

            secret = boto3.client("secretsmanager").get_secret_value(
                SecretId=GITHUB_SECRET_ID
            )["SecretString"]
            _token = json.loads(secret).get("github_token", "")
        except Exception as e:
            print(f"[policy_diff] Failed to read GitHub token: {e}")
            _token = ""

    if not _token:
        # 60 requests/hour unauthenticated, shared across Lambda egress IPs, so this
        # does not merely slow diffs down: it makes them fail, and a failed diff
        # publishes as "no action added or removed". Once per cold start, since the
        # empty token is cached above.
        _alert(
            "No GitHub token is available, so diffs will be rate limited and "
            "changes will publish with an unknown action delta."
        )
    return _token


def _http_get(url, accept, retries=3):
    headers = {"Accept": accept, "User-Agent": USER_AGENT}
    token = _github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if (e.code in (403, 429) or e.code >= 500) and attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"[policy_diff] HTTP {e.code} on {url}, retrying in {wait}s")
                time.sleep(wait)
                continue
            print(f"[policy_diff] GET {url} failed: {e}")
            return None
        except Exception as e:
            print(f"[policy_diff] GET {url} failed: {e}")
            return None
    return None


def _commit(sha):
    """Commit metadata including per-file status and patch."""
    if sha in _commit_cache:
        return _commit_cache[sha]

    raw = _http_get(
        f"https://api.github.com/repos/{GITHUB_REPO}/commits/{sha}",
        "application/vnd.github+json",
    )
    data = None
    if raw:
        try:
            data = json.loads(raw)
        except ValueError as e:
            print(f"[policy_diff] Could not parse commit {sha[:8]}: {e}")

    _commit_cache[sha] = data
    return data


def _expand_commit_sha(sha, policy_name=""):
    """Turn an abbreviated SHA GitHub cannot resolve into the full 40-char form.

    git %h is unique in the scraper's clone, not in GitHub's object store. A
    prefix like 0984465a 422s the commit API even though the commit exists, and
    raw.githubusercontent.com 404s the same way. Listing recent commits (for the
    policy file when we have its name) recovers the full SHA for DynamoDB rows
    that still carry the old abbrev.
    """
    if not sha or len(sha) < 7 or len(sha) >= 40:
        return sha

    query = "per_page=30"
    if policy_name:
        query = (
            f"path={urllib.parse.quote(POLICY_PREFIX + policy_name, safe='/')}&"
            + query
        )
    raw = _http_get(
        f"https://api.github.com/repos/{GITHUB_REPO}/commits?{query}",
        "application/vnd.github+json",
    )
    if not raw:
        return sha
    try:
        commits = json.loads(raw)
    except ValueError as e:
        print(f"[policy_diff] Could not parse commit list for {policy_name or sha}: {e}")
        return sha
    if not isinstance(commits, list):
        return sha

    matches = []
    for commit in commits:
        full = commit.get("sha", "") if isinstance(commit, dict) else ""
        if full.startswith(sha) and full not in matches:
            matches.append(full)

    if len(matches) == 1:
        print(
            f"[policy_diff] Expanded {sha} to {matches[0]}"
            + (f" for {policy_name}" if policy_name else "")
        )
        return matches[0]
    if len(matches) > 1:
        print(f"[policy_diff] SHA {sha} matches {len(matches)} recent commits")
    else:
        print(
            f"[policy_diff] SHA {sha} matched no recent commit"
            + (f" of {policy_name}" if policy_name else "")
        )
    return sha


def wait_for_commit(commit_sha):
    """Poll until a commit is readable through the GitHub API.

    Returns True as soon as it resolves, leaving the commit in the cache so the
    resolution that follows costs no extra request. A miss is dropped from the
    cache, because _commit stores negative results and would otherwise answer
    every later lookup of this SHA from that failure.
    """
    if not commit_sha:
        return False

    for attempt in range(COMMIT_VISIBILITY_ATTEMPTS):
        if _commit(commit_sha):
            return True
        _commit_cache.pop(commit_sha, None)
        if len(commit_sha) < 40:
            expanded = _expand_commit_sha(commit_sha)
            if expanded != commit_sha:
                commit_sha = expanded
                if _commit(commit_sha):
                    return True
                _commit_cache.pop(commit_sha, None)
        if attempt < COMMIT_VISIBILITY_ATTEMPTS - 1:
            print(
                f"[policy_diff] Commit {commit_sha[:8]} not visible yet, "
                f"retrying in {COMMIT_VISIBILITY_DELAY}s"
            )
            time.sleep(COMMIT_VISIBILITY_DELAY)

    print(f"[policy_diff] Commit {commit_sha[:8]} never became visible")
    return False


def _policy_document(sha, policy_name):
    """Full policy JSON at a given ref, fetched from the raw CDN.

    raw.githubusercontent.com does not consume the REST API rate limit, so the
    semantic summary stays available even when the API budget is tight.
    """
    key = (sha, policy_name)
    if key in _blob_cache:
        return _blob_cache[key]

    raw = _http_get(
        f"https://raw.githubusercontent.com/{GITHUB_REPO}/{sha}/{POLICY_PREFIX}{policy_name}",
        "text/plain",
    )
    doc = None
    if raw:
        try:
            doc = json.loads(raw)
        except ValueError as e:
            print(f"[policy_diff] Could not parse {policy_name} at {sha[:8]}: {e}")

    _blob_cache[key] = doc
    return doc


# ──────────────────────────────
# Semantic policy analysis
# ──────────────────────────────


def _statements(doc):
    if not isinstance(doc, dict):
        return []
    stmts = doc.get("PolicyVersion", {}).get("Document", {}).get("Statement", [])
    if isinstance(stmts, dict):
        return [stmts]
    if isinstance(stmts, list):
        return [s for s in stmts if isinstance(s, dict)]
    return []


def _action_labels(doc):
    """Flatten statements into labels. Deny and NotAction are encoded into the
    label so that a change of effect or of match semantics still shows up."""
    labels = set()
    for stmt in _statements(doc):
        effect = stmt.get("Effect", "Allow")
        for key in ("Action", "NotAction"):
            vals = stmt.get(key)
            if isinstance(vals, str):
                vals = [vals]
            if not isinstance(vals, list):
                continue
            for val in vals:
                if not isinstance(val, str):
                    continue
                label = val if key == "Action" else f"NotAction {val}"
                if effect == "Deny":
                    label = f"Deny {label}"
                labels.add(label)
    return labels


def _sids(doc):
    return {
        stmt["Sid"]
        for stmt in _statements(doc)
        if isinstance(stmt.get("Sid"), str) and stmt["Sid"]
    }


def _version_id(doc):
    if not isinstance(doc, dict):
        return ""
    return doc.get("PolicyVersion", {}).get("VersionId", "")


def _document_json(doc):
    if not isinstance(doc, dict):
        return ""
    return json.dumps(doc.get("PolicyVersion", {}).get("Document", {}), sort_keys=True)


# ──────────────────────────────
# Patch trimming
# ──────────────────────────────


def _collapse_context(rows):
    """Cap long runs of unchanged lines so the budget goes to real changes."""
    out = []
    run = []

    def flush():
        if len(run) <= MAX_CONTEXT_RUN:
            out.extend(run)
        else:
            out.append(run[0])
            out.append(("skip", ""))
            out.append(run[-1])
        run.clear()

    for row in rows:
        if row[0] == "ctx":
            run.append(row)
            continue
        if run:
            flush()
        out.append(row)
    if run:
        flush()
    return out


def _dedent(rows):
    """Strip leading indentation so deeply nested statements stay readable.

    The shift is measured on changed lines only; trailing closing braces sit at
    low indentation and would otherwise cancel the dedent entirely.
    """
    changed = [
        len(body) - len(body.lstrip(" "))
        for kind, body in rows
        if kind in ("add", "del") and body.strip()
    ]
    widths = changed or [
        len(body) - len(body.lstrip(" "))
        for kind, body in rows
        if kind != "skip" and body.strip()
    ]
    if not widths:
        return rows
    shift = min(widths)
    if shift <= 0:
        return rows

    def trim(body):
        # Never cut past a line's own indentation, so shallower closing braces
        # keep their content instead of being sliced away.
        own = len(body) - len(body.lstrip(" "))
        return body[min(shift, own):]

    return [
        (kind, body if kind == "skip" else trim(body)) for kind, body in rows
    ]


def _clean_patch(patch):
    """Turn a unified patch into (kind, text) rows for display.

    Git plumbing is dropped, hunk boundaries become an ellipsis row so a jump in
    the file stays visible, and PolicyVersion metadata is removed because the
    version bump is rendered as a badge.
    """
    rows = []
    for raw in patch.split("\n"):
        if not raw:
            continue
        if raw.startswith("@@"):
            if rows and rows[-1][0] != "skip":
                rows.append(("skip", ""))
            continue
        marker, body = raw[0], raw[1:]
        if marker not in "+- ":
            continue
        if any(key in body for key in _METADATA_KEYS):
            continue
        rows.append(({"+": "add", "-": "del", " ": "ctx"}[marker], body))

    while rows and rows[0][0] == "skip":
        rows.pop(0)
    while rows and rows[-1][0] == "skip":
        rows.pop()

    rows = _dedent(_collapse_context(rows))
    truncated = len(rows) > MAX_DIFF_LINES
    return rows[:MAX_DIFF_LINES], truncated


# ──────────────────────────────
# Change resolution
# ──────────────────────────────


def _blank_change(policy_name, commit_sha="", commit_url="", detailed=True):
    return {
        "name": policy_name,
        "commit_sha": commit_sha or "",
        "commit_url": commit_url,
        "status": "modified",
        "old_version": "",
        "new_version": "",
        "actions_added": [],
        "actions_removed": [],
        "sids_added": [],
        "sids_removed": [],
        "scope_changed": False,
        "diff_rows": [],
        "diff_truncated": False,
        "resolved": False,
        "detailed": detailed,
        # Filled in by action_registry.classify when a registry is available, so
        # an unclassified record renders exactly as it did before discoveries.
        "new_service_prefixes": [],
        "new_actions": [],
    }


def resolve_changes(rows):
    """Resolve change rows into records, newest detail first.

    Each row is a dict with name, commit_sha and commit_url. Only the first
    MAX_DETAILED_CHANGES rows are fetched from GitHub; the remainder become
    name-only records so a bulk rewrite day cannot exhaust the API budget or
    blow up the email.
    """
    records = []
    for index, row in enumerate(rows):
        if index < MAX_DETAILED_CHANGES:
            records.append(
                resolve_change(
                    row.get("commit_sha", ""),
                    row["name"],
                    commit_url=row.get("commit_url", ""),
                )
            )
        else:
            records.append(
                _blank_change(
                    row["name"],
                    row.get("commit_sha", ""),
                    row.get("commit_url", ""),
                    detailed=False,
                )
            )
    return records


def resolve_change(commit_sha, policy_name, commit_url=""):
    """Build a normalized record describing one policy change."""
    change = _blank_change(policy_name, commit_sha, commit_url)

    if not commit_sha:
        return change

    commit = _commit(commit_sha)
    if not commit and len(commit_sha) < 40:
        expanded = _expand_commit_sha(commit_sha, policy_name)
        if expanded != commit_sha:
            commit_sha = expanded
            change["commit_sha"] = expanded
            commit = _commit(commit_sha)
    if not commit:
        return change

    if commit.get("html_url"):
        change["commit_url"] = commit["html_url"]
    elif not change["commit_url"]:
        change["commit_url"] = f"https://github.com/{GITHUB_REPO}/commit/{commit_sha}"

    path = POLICY_PREFIX + policy_name
    entry = next(
        (f for f in commit.get("files", []) if f.get("filename") == path), None
    )
    if entry is None:
        return change

    change["status"] = entry.get("status", "modified")
    parents = commit.get("parents") or []
    parent_sha = parents[0].get("sha", "") if parents else ""

    new_doc = (
        None
        if change["status"] == "removed"
        else _policy_document(commit_sha, policy_name)
    )
    old_doc = (
        None
        if change["status"] == "added" or not parent_sha
        else _policy_document(parent_sha, policy_name)
    )

    change["new_version"] = _version_id(new_doc)
    change["old_version"] = _version_id(old_doc)

    new_actions, old_actions = _action_labels(new_doc), _action_labels(old_doc)
    change["actions_added"] = sorted(new_actions - old_actions)
    change["actions_removed"] = sorted(old_actions - new_actions)

    new_sids, old_sids = _sids(new_doc), _sids(old_doc)
    change["sids_added"] = sorted(new_sids - old_sids)
    change["sids_removed"] = sorted(old_sids - new_sids)

    change["scope_changed"] = bool(
        not change["actions_added"]
        and not change["actions_removed"]
        and old_doc
        and new_doc
        and _document_json(old_doc) != _document_json(new_doc)
    )

    if entry.get("patch"):
        change["diff_rows"], change["diff_truncated"] = _clean_patch(entry["patch"])

    change["resolved"] = bool(new_doc or old_doc or change["diff_rows"])
    return change


# ──────────────────────────────
# Wording
# ──────────────────────────────
#
# One concept used to have a different name in every channel: an action nobody
# had seen before was a "never-before-seen action" on Bluesky, a "first-ever IAM
# action" on Telegram and a "first-ever action" in email. A reader who follows
# two of them could not tell they were the same finding. These are the canonical
# phrasings, mirrored for the site build in website/scripts/change-wording.js and
# recorded in .cursor/rules/project-context.mdc.

STATUS_WORDS = {
    "added": "new policy",
    "removed": "policy removed",
    "modified": "updated",
}


def plural(count, singular, plural_form=None):
    """"1 action" / "2 actions", never the "1 action(s)" of a lazy template."""
    word = singular if count == 1 else (plural_form or f"{singular}s")
    return f"{count} {word}"


def sentence(text):
    """Uppercase the first character only, leaving AWS and iam:PassRole intact.

    str.capitalize would lowercase the rest and turn "new AWS service" into
    "New aws service".
    """
    return text[:1].upper() + text[1:]


def never_before_seen(count):
    """The canonical name for an action string absent from the whole archive."""
    return plural(count, "never-before-seen action")


def new_service_phrase(prefixes):
    """"new AWS service odb" or "3 new AWS services", the strongest signal we have."""
    count = len(prefixes)
    if count == 1:
        return f"new AWS service {prefixes[0]}"
    return f"{count} new AWS services"


def action_delta_phrase(added, removed, unknown=False):
    """"3 actions added, 1 removed", or how a change with no action delta reads.

    AWS reissues a policy version for a Resource or Condition edit far more often
    than for a permission change, so the no-delta wording is the common case and
    has to say something truthful rather than imply nothing happened.

    Pass unknown=True when the diff could not be loaded. Claiming "no action added or
    removed" there asserts something nobody checked, and it is word for word what a
    genuinely uneventful change says, so a GitHub outage would read as a quiet day.
    """
    if added and removed:
        return f"{plural(len(added), 'action')} added, {len(removed)} removed"
    if added:
        return f"{plural(len(added), 'action')} added"
    if removed:
        return f"{plural(len(removed), 'action')} removed"
    if unknown:
        return "action delta unavailable, the diff could not be loaded"
    return "scope changed, no action added or removed"


def unresolved(changes):
    """Labels of changes we tried to read from GitHub and could not.

    A record that never had a detail budget is not a failure. One that did and came
    back empty means the API was unreachable, so every phrase derived from it is a
    guess: actions_added is empty because nothing was read, not because nothing
    changed, and is_discovery is False for the same reason. Callers must alert on a
    non-empty result rather than publish the empty delta as fact.

    The SHA is included so an abbreviated-SHA 422 is diagnosable, instead of
    looking like a token outage.
    """
    labels = []
    for change in changes:
        if change.get("detailed", True) and not change.get("resolved"):
            sha = change.get("commit_sha") or "no sha"
            labels.append(f"{change['name']} ({sha[:12] if len(sha) > 12 else sha})")
    return labels


def permissions_management_phrase(actions):
    """"2 permissions management, incl. iam:PassRole", or "" when there are none.

    Lowercase to match the access level as the AWS Service Authorization Reference
    spells it, and named because the example is the part a reader acts on.
    """
    if not actions:
        return ""
    if len(actions) == 1:
        return f"permissions management: {actions[0]}"
    return f"{len(actions)} permissions management, incl. {actions[0]}"


# ──────────────────────────────
# Rendering
# ──────────────────────────────

# Badge text is the canonical word capitalised, so a badge can never drift from
# the phrasing the other channels use for the same status.
_STATUS_LABELS = {
    "added": (sentence(STATUS_WORDS["added"]), "#e7f8ec", "#0f5132"),
    "removed": (sentence(STATUS_WORDS["removed"]), "#fdeaea", "#8a1c1c"),
}
_STATUS_DEFAULT = (sentence(STATUS_WORDS["modified"]), "#e8effd", "#1d4ed8")

# Discoveries get their own amber, distinct from the blue of a routine update.
_DISCOVERY_BG, _DISCOVERY_FG = "#fef3c7", "#92400e"

_DIFF_STYLES = {
    "add": ("+ ", "background:#e7f8ec;color:#0f5132;"),
    "del": ("- ", "background:#fdeaea;color:#8a1c1c;"),
    "ctx": ("  ", "color:#4b5563;"),
}


def _esc(text):
    return (
        str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


def _join_items(items):
    shown = [_esc(i) for i in items[:MAX_LISTED_ITEMS]]
    extra = len(items) - len(shown)
    rendered = ", ".join(shown)
    if extra > 0:
        rendered += f" (+{extra} more)"
    return rendered


def _badge(text, bg, fg, raw=False):
    label = text if raw else _esc(text)
    return (
        f'<span style="display:inline-block;background:{bg};color:{fg};'
        f'padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;'
        f'font-family:monospace;">{label}</span>'
    )


def _summary_line(glyph, label, body, fg):
    detail = f': <span style="color:#475569;">{body}</span>' if body else ""
    return (
        f'<div style="font-size:13px;line-height:1.5;margin:0 0 4px;">'
        f'<span style="color:{fg};font-weight:700;font-family:monospace;">{glyph}</span> '
        f'<span style="color:{fg};font-weight:600;">{_esc(label)}</span>{detail}</div>'
    )


def is_discovery(change):
    """True when this change contains an action never seen anywhere before."""
    return bool(change.get("new_service_prefixes") or change.get("new_actions"))


def discovery_rank(change):
    """Sort key: a whole new service outranks a new action, which outranks the rest."""
    if change.get("new_service_prefixes"):
        return 0
    if change.get("new_actions"):
        return 1
    return 2


def _discovery_lines(change):
    """Lead with the never-before-seen finding, since it outranks the rest.

    A first-ever service prefix usually means AWS is standing up a service it has
    not announced, so it is called out separately from a merely new action.
    """
    prefixes = change.get("new_service_prefixes") or []
    actions = change.get("new_actions") or []
    lines = []

    if prefixes:
        label = "New AWS service" if len(prefixes) == 1 else "New AWS services"
        lines.append(
            _summary_line(
                "*",
                label,
                f"{_join_items(prefixes)}, never seen in any managed policy before",
                _DISCOVERY_FG,
            )
        )

    # Under a new prefix every action is new by definition, so listing them again
    # would just repeat the headline.
    extra = [a for a in actions if a.split(":", 1)[0].lower() not in set(prefixes)]
    if extra:
        lines.append(
            _summary_line(
                "*",
                sentence(never_before_seen(len(extra))),
                _join_items(extra),
                _DISCOVERY_FG,
            )
        )
    return lines


def _render_summary(change):
    """Plain-language description of what AWS actually changed."""
    lines = _discovery_lines(change)

    if change["status"] == "added":
        count = len(change["actions_added"])
        lines.append(
            _summary_line(
                "+",
                f"New policy granting {count} action{'s' if count != 1 else ''}",
                _join_items(change["actions_added"]),
                "#0f5132",
            )
        )
        if change["sids_added"]:
            lines.append(
                _summary_line(
                    "+", "Statements", _join_items(change["sids_added"]), "#0f5132"
                )
            )
        return "".join(lines)

    if change["status"] == "removed":
        lines.append(
            _summary_line("-", "Policy deleted by AWS", "", "#8a1c1c")
        )
        return "".join(lines)

    if change["actions_added"]:
        count = len(change["actions_added"])
        lines.append(
            _summary_line(
                "+",
                f"{count} action{'s' if count != 1 else ''} added",
                _join_items(change["actions_added"]),
                "#0f5132",
            )
        )
    if change["actions_removed"]:
        count = len(change["actions_removed"])
        lines.append(
            _summary_line(
                "-",
                f"{count} action{'s' if count != 1 else ''} removed",
                _join_items(change["actions_removed"]),
                "#8a1c1c",
            )
        )
    if change["sids_added"]:
        lines.append(
            _summary_line(
                "+",
                "New statements",
                _join_items(change["sids_added"]),
                "#0f5132",
            )
        )
    if change["sids_removed"]:
        lines.append(
            _summary_line(
                "-",
                "Statements removed",
                _join_items(change["sids_removed"]),
                "#8a1c1c",
            )
        )
    if change["scope_changed"]:
        lines.append(
            _summary_line(
                "~",
                "Scope changed",
                "Resource or Condition updated, no action added or removed",
                "#92400e",
            )
        )

    if not lines and change["resolved"]:
        lines.append(
            _summary_line("~", "Version metadata only", "no permission change", "#475569")
        )

    return "".join(lines)


def _render_diff(change):
    if not change["diff_rows"]:
        return ""

    rows = []
    for kind, body in change["diff_rows"]:
        if kind == "skip":
            rows.append(
                '<span style="display:block;color:#94a3b8;">&hellip;</span>'
            )
            continue
        prefix, style = _DIFF_STYLES[kind]
        rows.append(
            f'<span style="display:block;{style}">{prefix}{_esc(body)}</span>'
        )

    return (
        '<pre style="margin:12px 0 0;background:#f8fafc;border:1px solid #e6eaef;'
        "border-radius:6px;padding:10px;font-family:'SFMono-Regular',Consolas,monospace;"
        'font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">'
        + "".join(rows)
        + "</pre>"
    )


def render_policy_card(change, site_url, include_diff=True):
    """One policy card: what changed in words, then the JSON diff."""
    name = change["name"]
    policy_url = f"{site_url}/policies/{name}"
    commit_url = change.get("commit_url", "")

    label, bg, fg = _STATUS_LABELS.get(change["status"], _STATUS_DEFAULT)
    badges = [_badge(label, bg, fg)]

    prefixes = change.get("new_service_prefixes") or []
    if prefixes:
        badges.append(
            _badge(sentence(new_service_phrase(prefixes)), _DISCOVERY_BG, _DISCOVERY_FG)
        )
    elif change.get("new_actions"):
        badges.append(
            _badge(
                never_before_seen(len(change["new_actions"])),
                _DISCOVERY_BG,
                _DISCOVERY_FG,
            )
        )

    old_v, new_v = change["old_version"], change["new_version"]
    if old_v and new_v and old_v != new_v:
        badges.append(
            _badge(f"{_esc(old_v)} &rarr; {_esc(new_v)}", "#f1f5f9", "#475569", raw=True)
        )
    elif new_v or old_v:
        badges.append(_badge(new_v or old_v, "#f1f5f9", "#475569"))

    if change["resolved"]:
        body = _render_summary(change)

        # A brand new policy has no diff to read, only a whole document, so the
        # action list plus a link beats forty green lines of JSON.
        if change["status"] == "added":
            body += (
                f'<div style="margin:8px 0 0;font-size:12px;">'
                f'<a href="{policy_url}" style="color:#2563eb;text-decoration:none;">'
                f"View the full policy &rarr;</a></div>"
            )
        else:
            if include_diff:
                body += _render_diff(change)
            if commit_url and (change["diff_truncated"] or not include_diff):
                body += (
                    f'<div style="margin:8px 0 0;font-size:12px;">'
                    f'<a href="{commit_url}" style="color:#2563eb;text-decoration:none;">'
                    f"View the full diff on GitHub &rarr;</a></div>"
                )
    else:
        link = (
            f'<a href="{commit_url}" style="color:#2563eb;text-decoration:none;">'
            f"view the commit on GitHub &rarr;</a>"
            if commit_url
            else "check the policy page"
        )
        body = (
            f'<div style="font-size:13px;color:#64748b;">'
            f"Diff could not be loaded for this change, {link}</div>"
        )

    return f"""
    <div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <div style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
            <a href="{policy_url}" style="color:#2563eb;font-weight:600;text-decoration:none;font-size:14px;">{_esc(name)}</a>
            <div style="margin-top:6px;">
                {" ".join(badges)}
                {f'<a href="{commit_url}" style="color:#64748b;font-size:11px;text-decoration:none;margin-left:4px;">commit</a>' if commit_url else ''}
            </div>
        </div>
        <div style="padding:12px 16px;">{body}</div>
    </div>
    """


def summarize_counts(changes, brief=False):
    """Short breakdown such as '3 policies: 2 updated, 1 new'.

    Pass brief=True where a nested colon would read badly, such as in a subject
    line that already joins several topics.
    """
    total = len(changes)
    noun = "policy" if total == 1 else "policies"

    # Without a resolved status for every change the breakdown would be a guess.
    if brief or any(not c.get("detailed", True) for c in changes):
        return f"{total} {noun}"

    new = sum(1 for c in changes if c["status"] == "added")
    removed = sum(1 for c in changes if c["status"] == "removed")
    updated = total - new - removed

    parts = []
    if updated:
        parts.append(f"{updated} updated")
    if new:
        parts.append(f"{new} new")
    if removed:
        parts.append(f"{removed} removed")

    detail = f": {', '.join(parts)}" if len(parts) > 1 else ""
    return f"{total} {noun}{detail}"


def _render_overflow(changes, site_url):
    """Compact name-only list for changes beyond the detail budget."""
    if not changes:
        return ""

    listed = changes[:MAX_OVERFLOW_NAMES]
    links = ", ".join(
        f'<a href="{site_url}/policies/{c["name"]}" style="color:#2563eb;text-decoration:none;">'
        f'{_esc(c["name"])}</a>'
        for c in listed
    )
    hidden = len(changes) - len(listed)
    if hidden:
        links += f' and {hidden} more'

    count = len(changes)
    return f"""
        <div style="margin-bottom:12px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
            <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:6px;">
                {count} more {'policy' if count == 1 else 'policies'} changed
            </div>
            <div style="font-size:12px;line-height:1.7;color:#64748b;">{links}</div>
        </div>
    """


def render_policy_section(changes, site_url):
    """The IAM policy changes section, shared by digest and instant emails.

    Cards are emitted until the byte budget runs out; everything after that is
    listed by name so a bulk day cannot produce a clipped email. Discoveries are
    rendered first so they claim a full card with its diff, instead of being
    pushed into the name-only overflow list on a busy day.
    """
    cards = []
    overflow = []
    spent = 0

    ordered = sorted(changes, key=discovery_rank)

    for change in ordered:
        if not change.get("detailed", True) or spent > MAX_SECTION_BYTES:
            overflow.append(change)
            continue
        card = render_policy_card(
            change, site_url, include_diff=len(cards) < MAX_DIFF_CARDS
        )
        spent += len(card)
        cards.append(card)

    cards = "".join(cards)

    return f"""
    <div style="margin-bottom:32px;">
        <h2 style="margin:0 0 4px;font-size:16px;color:#1e293b;">
            IAM Policy Changes
        </h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:13px;">
            {summarize_counts(changes)}
        </p>
        {cards}
        {_render_overflow(overflow, site_url)}
        <p style="margin:8px 0 0;font-size:12px;">
            <a href="{site_url}/policies" style="color:#2563eb;text-decoration:none;">Browse all policies &rarr;</a>
        </p>
    </div>
    """


def render_email(title, summary, accent, body_html, site_url, manage_token, intro):
    """The shared email shell, so digest and instant look like one product.

    The color-scheme hints keep clients from inverting the palette on their own.
    """
    manage_url = f"{site_url}/manage?token={manage_token}"
    unsubscribe_url = f"{manage_url}&action=unsubscribe"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:0 16px;color:#1e293b;background:#ffffff;">
    <div style="padding:24px 0;border-bottom:2px solid {accent};">
        <h1 style="margin:0;font-size:24px;color:#1e293b;">{_esc(title)}</h1>
        <p style="margin:8px 0 0;color:#64748b;font-size:14px;">{_esc(summary)}</p>
    </div>

    <div style="padding:24px 0;">
        {body_html}
    </div>

    <div style="border-top:1px solid #e2e8f0;padding:24px 0;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;">{_esc(intro)}</p>
        <p style="margin:0;">
            <a href="{manage_url}" style="color:#2563eb;font-size:12px;">Manage subscription</a>
            &nbsp;&middot;&nbsp;
            <a href="{unsubscribe_url}" style="color:#94a3b8;font-size:12px;">Unsubscribe</a>
        </p>
        <p style="color:#cbd5e1;font-size:11px;margin:12px 0 0;">
            <a href="{site_url}" style="color:#94a3b8;">IAMTrail</a> by <a href="https://zoph.io" style="color:#94a3b8;">zoph.io</a>
        </p>
    </div>
</div>
</body>
</html>
"""

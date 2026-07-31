"""Access levels and friendly service names for the notification Lambdas.

The file this reads is built by automation/scripts/build_iam_metadata.py from the
AWS Service Authorization Reference (via iam-dataset) and shipped inside the
Lambda zip, so there is no network call and no cold-start penalty beyond parsing
about forty kilobytes once per container.

Every lookup degrades to something usable when the file is absent, because a
notification that names a bare service prefix is still worth sending.
"""

import json
import os

METADATA_FILE = os.environ.get(
    "IAM_METADATA_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "iam-metadata.json"),
)

_loaded = False
_permissions_management = frozenset()
_service_names = {}


def _load():
    global _loaded, _permissions_management, _service_names
    if _loaded:
        return
    _loaded = True

    try:
        with open(METADATA_FILE) as handle:
            data = json.load(handle)
        _permissions_management = frozenset(data.get("permissionsManagement") or [])
        _service_names = data.get("serviceNames") or {}
    except Exception as e:
        print(f"[iam_metadata] Could not load {METADATA_FILE}: {e}")


def is_permissions_management(action):
    """True when AWS classes this action as permissions management.

    Matched case-insensitively, since the archive spells the same action several
    ways and the stored keys are lowercased.
    """
    _load()
    return str(action).lower() in _permissions_management


def permissions_management(actions):
    """The subset of actions AWS classes as permissions management, order kept."""
    _load()
    return [a for a in actions if str(a).lower() in _permissions_management]


def service_name(prefix):
    """The friendly name for a service prefix, or the prefix itself when unknown.

    Falling back to the prefix matters for discoveries: a service AWS has not
    announced is exactly the case iam-dataset cannot know about yet.
    """
    _load()
    return _service_names.get(str(prefix).lower(), prefix)


def label_service(prefix):
    """"Amazon Bedrock (bedrock)" when the name is known, else just the prefix."""
    name = service_name(prefix)
    return f"{name} ({prefix})" if name != prefix else str(prefix)


def service_of(action):
    """The service prefix of an action string, lowercased."""
    return str(action).split(":", 1)[0].lower()


def services_of(actions):
    """Every distinct service prefix across a list of actions, first seen first."""
    seen, out = set(), []
    for action in actions:
        prefix = service_of(action)
        if prefix and prefix not in seen:
            seen.add(prefix)
            out.append(prefix)
    return out

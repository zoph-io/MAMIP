/**
 * Canonical wording for a policy change, mirroring the Wording section of
 * automation/lambdas/shared/policy_diff.py.
 *
 * One concept used to have a different name in every channel: an action nobody
 * had seen before was a "never-before-seen action" on Bluesky, a "first-ever IAM
 * action" on Telegram and a "first-ever action" in email. A reader following two
 * of them could not tell they were the same finding.
 *
 * The two runtimes cannot share code, so the rule is that these functions and
 * their Python counterparts change together. The vocabulary itself is recorded
 * in .cursor/rules/project-context.mdc.
 */

const STATUS_WORDS = {
  added: "new policy",
  removed: "policy removed",
  modified: "updated",
};

/** "1 action" / "2 actions", never the "1 action(s)" of a lazy template. */
function plural(count, singular, pluralForm) {
  const word = count === 1 ? singular : pluralForm || `${singular}s`;
  return `${count} ${word}`;
}

/**
 * Uppercase the first character only, leaving AWS and iam:PassRole intact.
 * toUpperCase on the whole string, or a naive capitalize that lowercases the
 * rest, would turn "new AWS service" into "New aws service".
 */
function sentence(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/** The canonical name for an action string absent from the whole archive. */
function neverBeforeSeen(count) {
  return plural(count, "never-before-seen action");
}

/** "new AWS service odb" or "3 new AWS services", the strongest signal we have. */
function newServicePhrase(prefixes) {
  return prefixes.length === 1
    ? `new AWS service ${prefixes[0]}`
    : `${prefixes.length} new AWS services`;
}

/**
 * "3 actions added, 1 removed", or how a change with no action delta reads.
 *
 * AWS reissues a policy version for a Resource or Condition edit far more often
 * than for a permission change, so the no-delta wording is the common case and
 * has to say something truthful rather than imply nothing happened.
 */
function actionDeltaPhrase(added, removed) {
  const a = added ? added.length : 0;
  const r = removed ? removed.length : 0;
  if (a && r) return `${plural(a, "action")} added, ${r} removed`;
  if (a) return `${plural(a, "action")} added`;
  if (r) return `${plural(r, "action")} removed`;
  return "scope changed, no action added or removed";
}

/**
 * "2 permissions management, incl. iam:PassRole", or "" when there are none.
 *
 * Lowercase to match the access level as the AWS Service Authorization Reference
 * spells it, and named because the example is the part a reader acts on.
 */
function permissionsManagementPhrase(actions) {
  if (!actions || !actions.length) return "";
  if (actions.length === 1) return `permissions management: ${actions[0]}`;
  return `${actions.length} permissions management, incl. ${actions[0]}`;
}

module.exports = {
  STATUS_WORDS,
  plural,
  sentence,
  neverBeforeSeen,
  newServicePhrase,
  actionDeltaPhrase,
  permissionsManagementPhrase,
};

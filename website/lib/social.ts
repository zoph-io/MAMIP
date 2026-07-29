/**
 * Public IAMTrail channels.
 *
 * The Telegram handle has to be claimed in Telegram before the channel exists,
 * and the same handle must be set as TELEGRAM_CHAT_ID for the instant notifier
 * (automation/tf-fargate/variables.tf). Set TELEGRAM_HANDLE to "" to hide every
 * Telegram link until the channel is live.
 */
// Empty until @iamtrail is claimed on Telegram: t.me/iamtrail is an unclaimed
// username today, so publishing the links would advertise a channel nobody can
// join. Set this to "iamtrail" once the channel exists.
export const TELEGRAM_HANDLE = "";

export const TELEGRAM_URL = TELEGRAM_HANDLE
  ? `https://t.me/${TELEGRAM_HANDLE}`
  : "";

export const BLUESKY_URL = "https://bsky.app/profile/iamtrail.bsky.social";

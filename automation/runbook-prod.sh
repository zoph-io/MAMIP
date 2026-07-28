#!/bin/bash

set -euo pipefail

###################
# Global Variables #
###################

# Date format for tagging
DATE=$(date +%Y-%m-%d-%H-%M)

# Repository settings
REPO_URL="https://github.com/zoph-io/IAMTrail.git"
REPO_PATH="/tmp/IAMTrail"
GIT_USER_NAME="MAMIP Bot"
GIT_USER_EMAIL="mamip_bot@github.com"

# AWS settings
REGION="eu-west-1"
GITHUB_SECRET_ARN="arn:aws:secretsmanager:eu-west-1:567589703415:secret:mamip/prod/github-MSzGtP"
SNS_TOPIC_ARN="arn:aws:sns:eu-west-1:567589703415:mamip-sns-topic"
SQS_BLUESKY_URL="https://sqs.eu-west-1.amazonaws.com/567589703415/qbsky-mamip-prod-sqs-queue.fifo"
DISCORD_WEBHOOK_SSM="/iamtrail/discord-webhook-url"

# File processing
WORD_TO_REMOVE="policies/"

# Result tracking (populated during execution)
START_TIME=""
POLICY_COUNT=0
RESULT_STATUS="no_changes"
RESULT_POLICY_NAMES=""
RESULT_COMMIT_COUNT=0
RESULT_COMMIT_URL=""

######################
# Utility Functions  #
######################

# Function to log messages
log() {
    local message="$1"
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $message"
}

# Retrieve Discord webhook URL from SSM (cached)
DISCORD_WEBHOOK_URL=""
get_discord_webhook() {
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        return
    fi
    DISCORD_WEBHOOK_URL=$(aws ssm get-parameter \
        --name "$DISCORD_WEBHOOK_SSM" \
        --with-decryption \
        --region "$REGION" \
        --query 'Parameter.Value' \
        --output text 2>/dev/null || true)
}

# Send a Discord embed notification
# Usage: discord_notify <color_decimal> <title> <description> [field_name:field_value ...]
discord_notify() {
    get_discord_webhook
    if [ -z "$DISCORD_WEBHOOK_URL" ]; then
        return
    fi

    local color="$1"
    local title="$2"
    local description="$3"
    shift 3

    local fields=""
    for field in "$@"; do
        local fname="${field%%:*}"
        local fvalue="${field#*:}"
        if [ -n "$fields" ]; then
            fields="$fields,"
        fi
        fields="$fields{\"name\":\"$fname\",\"value\":\"$fvalue\",\"inline\":true}"
    done

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local payload
    if [ -n "$fields" ]; then
        payload="{\"embeds\":[{\"title\":\"$title\",\"description\":\"$description\",\"color\":$color,\"fields\":[$fields],\"footer\":{\"text\":\"IAMTrail - runbook-prod\"},\"timestamp\":\"$timestamp\"}]}"
    else
        payload="{\"embeds\":[{\"title\":\"$title\",\"description\":\"$description\",\"color\":$color,\"footer\":{\"text\":\"IAMTrail - runbook-prod\"},\"timestamp\":\"$timestamp\"}]}"
    fi

    curl -s -o /dev/null -H "Content-Type: application/json" -d "$payload" "$DISCORD_WEBHOOK_URL" || true
}

# Note: the public Discord webhook (invite-only channel) is posted from the
# change-recorder Lambda (see automation/lambdas/change-recorder/index.py),
# which produces a richer embed and is the system of record. Do not post here
# to avoid duplicate messages.

# Function to handle errors
error_handler() {
    discord_notify 15158332 "Runbook Error" "An error occurred during the MAMIP update process"
    log "An error occurred. Exiting..."
    exit 1
}

# Trap errors
trap error_handler ERR

########################
# Repository Functions #
########################

# Set up GitHub token and Git configuration
setup_git_auth() {
    log "Setting up GitHub authentication and Git configuration"
    
    # Retrieve GitHub token from Secrets Manager
    GITHUB_TOKEN=$(aws secretsmanager get-secret-value \
        --secret-id "$GITHUB_SECRET_ARN" \
        --region "$REGION" \
        --query 'SecretString' \
        --output text | jq -r '.github_token')
    
    if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "null" ]; then
        log "Failed to retrieve GitHub token from Secrets Manager"
        discord_notify 15158332 "Git Auth Failed" "Could not retrieve GitHub token from Secrets Manager"
        exit 1
    fi

    git config --global user.name "$GIT_USER_NAME"
    git config --global user.email "$GIT_USER_EMAIL"
    
    # Configure Git to use the token for HTTPS authentication
    git config --global credential.helper store
    echo "https://x-access-token:$GITHUB_TOKEN@github.com" > /home/mamip/.git-credentials
    chmod 600 /home/mamip/.git-credentials
}

# Clone the repository
clone_repo() {
    log "Cloning the repository"
    cd /tmp/
    git clone "$REPO_URL" -q
    if [ ! -d "$REPO_PATH" ]; then
        log "Failed to clone repository"
        discord_notify 15158332 "Clone Failed" "Repository clone succeeded but expected path $REPO_PATH not found. Check REPO_URL vs REPO_PATH."
        exit 1
    fi
    log "Repository cloned successfully"
}

#########################
# Processing Functions  #
#########################

# Process IAM policies
process_policies() {
    log "Processing IAM policies"
    cd "$REPO_PATH"
    python3 "$REPO_PATH/automation/scripts/fetch_policies.py" "$REPO_PATH/policies"
    POLICY_COUNT=$(ls -1 "$REPO_PATH/policies" | wc -l | tr -d ' ')
    log "Fetched $POLICY_COUNT AWS managed policies"
}

# Send notifications to various platforms
send_notifications() {
    local message_body="$1"
    local sns_message="$2"

    # Bluesky (@iamtrail.bsky.social) via qbsky-mamip-prod FIFO queue
    local bsky_body="[Policies] ${message_body}"
    aws sqs send-message \
        --queue-url "$SQS_BLUESKY_URL" \
        --message-body "$bsky_body" \
        --message-group-id 1

    # SNS
    aws sns publish \
        --topic-arn "$SNS_TOPIC_ARN" \
        --message "$sns_message" \
        --region "$REGION"
}

# Extract policy version from JSON file
get_policy_version() {
    local file_path="$1"
    if [[ -f "$file_path" ]]; then
        jq -r '.PolicyVersion.VersionId // "unknown"' "$file_path" 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

# Handle git changes and notifications
process_changes() {
    log "Processing changes"
    if [[ -n $(git status -s) ]]; then
        # Get all changed files (newline-separated to avoid leading-space issues)
        CHANGED_FILES="$({ git diff --name-only; git ls-files --others --exclude-standard; } | sort -u)"
        ALL_COMMITS=()
        declare -A POLICY_COMMIT_MAP
        
        # Process each changed file individually
        for file in $CHANGED_FILES; do
            if [[ "$file" == policies/* ]]; then
                POLICY_NAME=$(basename "$file")
                POLICY_VERSION=$(get_policy_version "$file")
                COMMIT_MESSAGE="$POLICY_NAME - Policy Version $POLICY_VERSION"
                
                log "Committing $file with version $POLICY_VERSION"
                git add "$file"
                git commit -m "$COMMIT_MESSAGE"
                COMMIT_ID=$(git log --format="%h" -n 1)
                ALL_COMMITS+=("$COMMIT_ID")
                POLICY_COMMIT_MAP["$POLICY_NAME"]="$COMMIT_ID"
            fi
        done

        # If we have commits, prepare notifications and push
        if [[ ${#ALL_COMMITS[@]} -gt 0 ]]; then
            # Get list of updated policies for notification
            POLICY_NAMES=$(echo "$CHANGED_FILES" | grep "^policies/" | sed "s|^policies/||" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
            TWEET_DIFF="${POLICY_NAMES:0:200}..."
            LAST_COMMIT_ID="${ALL_COMMITS[-1]}"
            
            # Build per-policy commit map JSON
            COMMIT_MAP_JSON="{"
            FIRST_ENTRY=true
            for key in "${!POLICY_COMMIT_MAP[@]}"; do
                if [ "$FIRST_ENTRY" = true ]; then
                    FIRST_ENTRY=false
                else
                    COMMIT_MAP_JSON+=","
                fi
                COMMIT_MAP_JSON+="\"$key\":\"${POLICY_COMMIT_MAP[$key]}\""
            done
            COMMIT_MAP_JSON+="}"

            # Format messages
            MESSAGE="{\"UpdatedPolicies\": \"$POLICY_NAMES\", \"CommitUrl\": \"https://github.com/zoph-io/IAMTrail/commit/$LAST_COMMIT_ID\", \"CommitMap\": $COMMIT_MAP_JSON, \"Date\": \"$DATE\", \"CommitCount\": \"${#ALL_COMMITS[@]}\"}"
            MESSAGE_BODY="$TWEET_DIFF https://github.com/zoph-io/IAMTrail/commit/$LAST_COMMIT_ID"

            # Tag the run with a single summary tag
            git tag "${DATE}-update-${#ALL_COMMITS[@]}-policies"

            # Push commits first, then tags separately
            log "Pushing ${#ALL_COMMITS[@]} commits to master"
            git push origin master
            git push origin --tags

            # Notify only once the commits are on GitHub, otherwise consumers
            # such as the instant notifier resolve diffs against SHAs the API
            # cannot see yet.
            send_notifications "$MESSAGE_BODY" "$MESSAGE"

            RESULT_STATUS="changes"
            RESULT_POLICY_NAMES="$POLICY_NAMES"
            RESULT_COMMIT_COUNT=${#ALL_COMMITS[@]}
            RESULT_COMMIT_URL="https://github.com/zoph-io/IAMTrail/commit/$LAST_COMMIT_ID"
        else
            log "No policy files were changed"
            RESULT_STATUS="no_policy_changes"
        fi
    else
        log "No changes detected"
        RESULT_STATUS="no_changes"
    fi
}

####################
# Main Execution   #
####################

main() {
    START_TIME=$(date +%s)
    log "Starting IAMTrail update process"
    setup_git_auth
    clone_repo
    process_policies
    process_changes
    log "Job completed successfully"

    local elapsed=$(( $(date +%s) - START_TIME ))
    local mins=$(( elapsed / 60 ))
    local secs=$(( elapsed % 60 ))
    local duration="${mins}m ${secs}s"

    if [[ "$RESULT_STATUS" == "changes" ]]; then
        discord_notify 3066993 "Policy Changes Detected" \
            "${RESULT_COMMIT_COUNT} policies updated and pushed to master" \
            "Duration:${duration}" \
            "Policies Scanned:${POLICY_COUNT}" \
            "Updated:${RESULT_POLICY_NAMES:0:200}" \
            "Commit:[View](${RESULT_COMMIT_URL})"
    fi
}

main

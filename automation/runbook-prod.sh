#!/bin/bash

set -euo pipefail

###################
# Global Variables #
###################

# Date format for tagging
DATE=$(date +%Y-%m-%d-%H-%M)

# Repository settings
REPO_URL="git@github.com:z0ph/MAMIP.git"
REPO_PATH="/tmp/MAMIP"
GIT_USER_NAME="MAMIP Bot"
GIT_USER_EMAIL="mamip_bot@github.com"

# AWS settings
REGION="eu-west-1"
S3_KEY_PATH="s3://mamip-artifacts/mamip"
SSH_KEY_PATH="/tmp/mamip.key"
SNS_TOPIC_ARN="arn:aws:sns:eu-west-1:567589703415:mamip-sns-topic"
SQS_TWITTER_URL="https://sqs.eu-west-1.amazonaws.com/567589703415/qtweet-mamip-sqs-queue.fifo"
SQS_BLUESKY_URL="https://sqs.eu-west-1.amazonaws.com/567589703415/qbsky-mamip-prod-sqs-queue.fifo"

# File processing
WORD_TO_REMOVE="policies/"

######################
# Utility Functions  #
######################

# Function to log messages
log() {
    local message="$1"
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $message"
}

# Function to handle errors
error_handler() {
    log "An error occurred. Exiting..."
    exit 1
}

# Trap errors
trap error_handler ERR

########################
# Repository Functions #
########################

# Set up SSH and Git configuration
setup_git_ssh() {
    log "Setting up SSH and Git configuration"
    aws s3 cp "$S3_KEY_PATH" "$SSH_KEY_PATH" --region "$REGION"
    chmod 600 "$SSH_KEY_PATH"
    eval "$(ssh-agent -s)"
    ssh-add "$SSH_KEY_PATH"

    git config --global user.name "$GIT_USER_NAME"
    git config --global user.email "$GIT_USER_EMAIL"

    mkdir -p /home/mamip/.ssh/
    ssh-keyscan github.com >>/home/mamip/.ssh/known_hosts
}

# Clone the repository
clone_repo() {
    log "Cloning the repository"
    cd /tmp/
    git clone "$REPO_URL" -q
    if [ ! -d "$REPO_PATH" ]; then
        log "Failed to clone repository"
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
    aws iam list-policies --output json |
        jq -cr '.Policies[] | select(.Arn | contains("iam::aws")) | .Arn + " " + .DefaultVersionId + " " + .PolicyName' |
        xargs -P 4 -n3 sh -c 'mkdir -p policies && aws iam get-policy-version --policy-arn $1 --version-id $2 > "policies/$3"' sh
}

# Send notifications to various platforms
send_notifications() {
    local message_body="$1"
    local sns_message="$2"

    # X/Twitter
    aws sqs send-message \
        --queue-url "$SQS_TWITTER_URL" \
        --message-body "$message_body" \
        --message-group-id 1

    # Bluesky
    aws sqs send-message \
        --queue-url "$SQS_BLUESKY_URL" \
        --message-body "$message_body" \
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
        # Get all changed files
        CHANGED_FILES="$(git diff --name-only) $(git ls-files --others --exclude-standard)"
        ALL_COMMITS=()
        
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
                
                # Create individual tag for this commit
                git tag "${DATE}-${POLICY_NAME}"
            fi
        done

        # If we have commits, prepare notifications and push
        if [[ ${#ALL_COMMITS[@]} -gt 0 ]]; then
            # Get list of updated policies for notification
            POLICY_NAMES=$(echo "$CHANGED_FILES" | grep "^policies/" | sed "s|^policies/||" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
            TWEET_DIFF="${POLICY_NAMES:0:200}..."
            LAST_COMMIT_ID="${ALL_COMMITS[-1]}"
            
            # Format messages
            MESSAGE="{\"UpdatedPolicies\": \"$POLICY_NAMES\", \"CommitUrl\": \"https://github.com/zoph-io/MAMIP/commit/$LAST_COMMIT_ID\", \"Date\": \"$DATE\", \"CommitCount\": \"${#ALL_COMMITS[@]}\"}"
            MESSAGE_BODY="$TWEET_DIFF https://github.com/z0ph/MAMIP/commit/$LAST_COMMIT_ID"

            # Send notifications
            send_notifications "$MESSAGE_BODY" "$MESSAGE"

            # Push changes
            log "Pushing ${#ALL_COMMITS[@]} commits to master"
            git push origin master --tags
        else
            log "No policy files were changed"
        fi
    else
        log "No changes detected"
    fi
}

####################
# Main Execution   #
####################

main() {
    log "Starting MAMIP update process"
    setup_git_ssh
    clone_repo
    process_policies
    process_changes
    log "Job completed successfully"
}

main

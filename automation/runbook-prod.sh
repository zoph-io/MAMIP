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

# Handle git changes and notifications
process_changes() {
    log "Processing changes"
    if [[ -n $(git status -s) ]]; then
        # Get changes
        DIFF="$(git diff --name-only) $(git ls-files --others --exclude-standard)"
        RAW_DIFF=${DIFF//$WORD_TO_REMOVE/}
        TWEET_DIFF="${RAW_DIFF:0:200}..."

        # Commit changes
        git add ./policies
        git commit -am "Update detected"
        git tag "$DATE"
        COMMIT_ID=$(git log --format="%h" -n 1)

        # Format messages
        FORMATTED_DIFF=$(echo "$RAW_DIFF" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
        MESSAGE="{\"UpdatedPolicies\": \"$FORMATTED_DIFF\", \"CommitUrl\": \"https://github.com/zoph-io/MAMIP/commit/$COMMIT_ID\", \"Date\": \"$DATE\", \"CommitId\": \"$COMMIT_ID\"}"
        MESSAGE_BODY="$TWEET_DIFF https://github.com/z0ph/MAMIP/commit/$COMMIT_ID"

        # Send notifications
        send_notifications "$MESSAGE_BODY" "$MESSAGE"

        # Push changes
        log "Pushing changes to master"
        git push origin master --tags
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

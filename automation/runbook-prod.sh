#!/bin/bash

set -euo pipefail

# Set variables
DATE=$(date +%Y-%m-%d-%H-%M)
WORD_TO_REMOVE="policies/"
REGION="eu-west-1"
REPO_URL="git@github.com:z0ph/MAMIP.git"
REPO_PATH="/tmp/MAMIP"
S3_KEY_PATH="s3://mamip-artifacts/mamip"
SSH_KEY_PATH="/tmp/mamip.key"
GIT_USER_NAME="MAMIP Bot"
GIT_USER_EMAIL="mamip_bot@github.com"
SNS_TOPIC_ARN="arn:aws:sns:eu-west-1:567589703415:mamip-sns-topic"

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

# Job preparation (SSH + Git)
prepare_job() {
    log "Starting job preparation"
    aws s3 cp "$S3_KEY_PATH" "$SSH_KEY_PATH" --region "$REGION"
    chmod 600 "$SSH_KEY_PATH"
    eval "$(ssh-agent -s)"
    ssh-add "$SSH_KEY_PATH"
    git config --global user.name "$GIT_USER_NAME"
    git config --global user.email "$GIT_USER_EMAIL"
    mkdir -p /home/mamip/.ssh/
    ssh-keyscan github.com >>/home/mamip/.ssh/known_hosts
    log "Job preparation completed"
}

# Clone the repository
clone_repo() {
    log "Cloning the repository"
    cd /tmp/
    git clone "$REPO_URL" -q
    if [ -d "$REPO_PATH" ]; then
        log "Repository cloned successfully"
    else
        log "Failed to clone repository"
        exit 1
    fi
}

# Process the repository
process_repo() {
    log "Processing the repository"
    cd "$REPO_PATH"
    aws iam list-policies --output json | jq -cr '.Policies[] | select(.Arn | contains("iam::aws")) | .Arn + " " + .DefaultVersionId + " " + .PolicyName' |
        xargs -P 4 -n3 sh -c 'mkdir -p policies && aws iam get-policy-version --policy-arn $1 --version-id $2 > "policies/$3"' sh
}

# Push changes to the repository
push_changes() {
    log "Checking for changes"
    if [[ -n $(git status -s) ]]; then
        DIFF="$(git diff --name-only) $(git ls-files --others --exclude-standard)"
        RAW_DIFF=${DIFF//$WORD_TO_REMOVE/}
        TWEET_DIFF="${RAW_DIFF:0:200}..."
        git add ./policies
        git commit -am "Update detected"
        git tag "$DATE"
        COMMIT_ID=$(git log --format="%h" -n 1)

        MESSAGE="{\"UpdatedPolicies\": \"$RAW_DIFF\", \"CommitUrl\": \"https://github.com/zoph-io/MAMIP/commit/$COMMIT_ID\", \"Date\": \"$DATE\", \"CommitId\": \"$COMMIT_ID\"}"
        MESSAGE_BODY="$TWEET_DIFF https://github.com/z0ph/MAMIP/commit/$COMMIT_ID"

        aws sqs send-message --queue-url "https://sqs.eu-west-1.amazonaws.com/567589703415/qtweet-mamip-sqs-queue.fifo" --message-body "$MESSAGE_BODY" --message-group-id 1
        aws sqs send-message --queue-url "https://sqs.eu-west-1.amazonaws.com/567589703415/qmasto-development-sqs-queue.fifo" --message-body "$MESSAGE_BODY" --message-group-id 1
        aws sns publish --topic-arn "$SNS_TOPIC_ARN" --message "$MESSAGE" --region "$REGION"

        log "Pushing changes to master"
        git push origin master --tags
    else
        log "No changes detected"
    fi
}

# Main script execution
main() {
    prepare_job
    clone_repo
    process_repo
    push_changes
    log "Job completed successfully"
}

main

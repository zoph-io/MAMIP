#!/bin/bash

DATE=$(date +%Y-%m-%d-%H-%M)
WORDTOREMOVE="policies/"
GITHUB_SECRET_ARN="arn:aws:secretsmanager:eu-west-1:567589703415:secret:mamip/prod/github-MSzGtP"

# job preparation (GitHub token + Git)
echo "==> Job preparation"

# Retrieve GitHub token from Secrets Manager
GITHUB_TOKEN=$(aws secretsmanager get-secret-value \
    --secret-id "$GITHUB_SECRET_ARN" \
    --region eu-west-1 \
    --query 'SecretString' \
    --output text | jq -r '.token')

if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "null" ]; then
    echo "Failed to retrieve GitHub token from Secrets Manager"
    exit 1
fi

git config --global user.name "MAMIP Bot"
git config --global user.email mamip_bot@github.com

# Configure Git to use the token for HTTPS authentication
git config --global credential.helper store
echo "https://x-access-token:$GITHUB_TOKEN@github.com" > /root/.git-credentials
chmod 600 /root/.git-credentials

# run the magic
echo "==> git clone"
cd /app/
git clone https://github.com/z0ph/MAMIP.git -q
if [ -d /app/MAMIP ]; then
    cd /app/MAMIP
    echo "==> Run the magic"
    aws iam list-policies --scope AWS >/app/MAMIP/list-policies.json
    cat /app/MAMIP/list-policies.json | jq -cr '.Policies[] | select(.Arn | contains("iam::aws"))|.Arn +" "+ .DefaultVersionId+" "+.PolicyName' | xargs -n3 sh -c 'aws iam get-policy-version --policy-arn $1 --version-id $2 > "policies/$3"' sh
    # push the changes if any
    if [[ -n $(git status -s) ]]; then
        # Prepare the Tweet
        diff="$(git diff --name-only) $(git ls-files --others --exclude-standard)"
        diff=${diff//$WORDTOREMOVE/}
        diff="${diff:0:200}..."
        git add ./policies
        git commit -am "Update detected"
        echo "==> Tagging"
        git tag $DATE
        # Craft commit ID for tweet direct URL
        commit_id=$(git log --format="%h" -n 1)
        # Send message to qTweeter for publishing the tweet
        echo "aws sqs send-message --queue-url https://sqs.eu-west-1.amazonaws.com/567589703415/qtweet-mamip-sqs-queue.fifo --message-body "$diff https://github.com/z0ph/MAMIP/commit/$commit_id" --message-group-id 1"
        echo "==> Push the changes to dev"
        git push origin dev --tags
    else
        echo "==> No changes detected"
    fi
fi

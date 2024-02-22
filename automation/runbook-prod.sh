#!/bin/bash

# Set variables
date=$(date +%Y-%m-%d-%H-%M)
wordToRemove="policies/"
region="eu-west-1"
repoUrl="git@github.com:z0ph/MAMIP.git"
repoPath="/app/MAMIP"
s3KeyPath="s3://mamip-artifacts/mamip"
sshKeyPath="/tmp/mamip.key"
sshConfigPath="/root/.ssh/known_hosts"
gitUserName="MAMIP Bot"
gitUserEmail="mamip_bot@github.com"
snsTopicArn="arn:aws:sns:eu-west-1:567589703415:mamip-sns-topic"

# Job preparation (SSH + Git)
echo "Job preparation"
aws s3 cp $s3KeyPath $sshKeyPath --region $region
chmod 600 $sshKeyPath
eval "$(ssh-agent -s)"
ssh-add $sshKeyPath
git config --global user.name "$gitUserName"
git config --global user.email "$gitUserEmail"
mkdir -p /root/.ssh/
ssh-keyscan github.com >>$sshConfigPath

# Clone and process the repo
echo "Git Clone"
mkdir -p /app && cd /app/
git clone $repoUrl -q
if [ -d $repoPath ]; then
    cd $repoPath
    echo "Run the magic"
    aws iam list-policies --output json >list-policies.json
    jq -cr '.Policies[] | select(.Arn | contains("iam::aws")) | .Arn + " " + .DefaultVersionId + " " + .PolicyName' list-policies.json | xargs -n3 sh -c 'mkdir -p policies && aws iam get-policy-version --policy-arn $1 --version-id $2 > "policies/$3"' sh

    # Push the changes if any
    if [[ -n $(git status -s) ]]; then
        echo "Tagging"
        git add ./policies
        git commit -am "Update detected"
        git tag $date
        commit_id=$(git log --format="%h" -n 1)

        # Create JSON message with diff and commit URL
        diff=$(git diff --name-only $(git ls-files --others --exclude-standard) | sed "s|$wordToRemove||" | xargs -n1 | awk '{print substr($0, 0, 200)}' | xargs -I {} echo "{}..." | jq -R -s .)
        message="{\"ChangedAWSManagedPolicies\": $diff, \"CommitUrl\": \"https://github.com/zoph-io/MAMIP/commit/$commit_id\", \"Timestamp\": \"$date\", \"CommitId\": \"$commit_id\"}"

        # Send the message to the SNS topic
        aws sns publish --topic-arn $snsTopicArn --message "$message" --region $region

        echo "Push the changes to master"
        git push origin master --tags
    else
        echo "No changes detected"
    fi
fi

import boto3
import json

client = boto3.client("accessanalyzer")

policy = """
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "*",
            "Resource": "*"
        }
    ]
}
"""

r = client.validate_policy(
    policyDocument=policy,
    # policyType='IDENTITY_POLICY'|'RESOURCE_POLICY'|'SERVICE_CONTROL_POLICY'
    policyType="IDENTITY_POLICY",
)

print(json.dumps(r["findings"], indent=4, sort_keys=True))

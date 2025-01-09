import boto3
import json
import glob
import os
from datetime import date
from collections import OrderedDict

# Date
today = date.today()
date = today.strftime("%Y-%m-%d")


# Empty ./findings/ folder
def clean_findings_folder():
    finds = glob.glob("./findings/*")
    for find in finds:
        os.remove(find)


# Validate with AA for each AWS Managed Policy
def validate_policies(deprecated):
    to_analyze = 5000
    analyzed_count = error = fail = sec_warning = suggestion = warning = 0
    error_list = []
    fail_list = []
    sec_warning_list = []
    suggestion_list = []
    warning_list = []
    policy_path = "./policies"
    files = [f for f in glob.glob(policy_path + "**/*", recursive=True)]
    for f in files[:to_analyze]:
        # Don't check deprecated policies
        policy_name = f.replace("./policies/", "")
        if policy_name in deprecated:
            pass
        else:
            analyzed_count += 1
            with open(f) as policy:
                print("==> Validation of:", f)
                policy = policy.read()
                policy = json.loads(policy)
                # Extract IAM Document from AWS Managed Policy
                doc = json.dumps(policy["PolicyVersion"]["Document"])

                # Access Analyzer - Policy Validation
                client = boto3.client("accessanalyzer")
                try:
                    r = client.validate_policy(
                        policyDocument=str(doc), policyType="IDENTITY_POLICY"
                    )
                except Exception as e:
                    fail += 1
                    fail_list.append(policy_name)
                    # Distinct list
                    fail_list = list(OrderedDict.fromkeys(fail_list))
                    # Write errors to a log file
                    error_output = open("./findings/fails.txt", "a")
                    error_output.write(str(f) + "\n")
                    error_output.write(str(e) + "\n")
                    error_output.close()

                # Extract findings from response
                findings = r["findings"]
                # More readable output (json)
                readable_findings = json.dumps(findings, indent=4, sort_keys=True)
                if readable_findings != "[]":
                    print("==> Finding:", readable_findings)
                else:
                    print("==> Finding: No issue detected")

                # Export to findings (if not empty) folder with a json file per
                # AWS Managed Policy
                if len(findings) > 0:
                    file_name = f.split("/")
                    file_name = file_name[2]

                    results = "./findings/" + file_name + ".json"
                    finding_output = open(results, "a")
                    finding_output.write(readable_findings)
                    finding_output.close()

                # Count for stats
                for finding in findings:
                    # Possible Types:
                    # 'ERROR'|'SECURITY_WARNING'|'SUGGESTION'|'WARNING'
                    if finding["findingType"] == "ERROR":
                        error += 1
                        error_list.append(policy_name)
                        # Distinct on list
                        error_list = list(OrderedDict.fromkeys(error_list))
                    if finding["findingType"] == "SECURITY_WARNING":
                        sec_warning += 1
                        sec_warning_list.append(policy_name)
                        # Distinct on list
                        sec_warning_list = list(OrderedDict.fromkeys(sec_warning_list))
                    if finding["findingType"] == "SUGGESTION":
                        suggestion += 1
                        suggestion_list.append(policy_name)
                        # Distinct on list
                        suggestion_list = list(OrderedDict.fromkeys(suggestion_list))
                    if finding["findingType"] == "WARNING":
                        warning += 1
                        warning_list.append(policy_name)
                        # Distinct on list
                        warning_list = list(OrderedDict.fromkeys(warning_list))

    return (
        analyzed_count,
        error,
        fail,
        sec_warning,
        suggestion,
        warning,
        error_list,
        fail_list,
        sec_warning_list,
        suggestion_list,
        warning_list,
    )


def check_deprecated():
    actual_policies = []
    repo_policies = []
    policy_path = "./policies"
    # TODO: Retreive list using BOTO3 instead of AWS CLI!!!
    with open("./policies-list.json") as policy:
        policy = policy.read()
        json_policy = json.loads(policy)
        policy = json_policy["Policies"]
        current_policies_count = len(policy)
        print("Current AWS Managed Policies:", current_policies_count)

    for i in policy:
        PolicyName = i["PolicyName"]
        actual_policies.append(PolicyName)

    files = [f for f in glob.glob(policy_path + "**/*", recursive=True)]
    for f in files:
        policy_name = f.replace("./policies/", "")
        repo_policies.append(policy_name)

    # difference between repo policies list and actual AWS policies list
    actual = set(actual_policies)
    deprecated = [x for x in repo_policies if x not in actual]
    print("Deprecated Policies:", deprecated)
    return deprecated


# Create README.md for stats
def output_writer(
    deprecated,
    analyzed_count,
    error,
    fail,
    sec_warning,
    suggestion,
    warning,
    error_list,
    fail_list,
    sec_warning_list,
    suggestion_list,
    warning_list,
):
    stats_output = open("./findings/README.md", "a")
    stats_output.write("## AWS Access Analyzer - Findings - " + str(date) + "\n\n")
    stats_output.write("- Policies analyzed: `" + str(analyzed_count) + "`\n")
    stats_output.write("- Errors: `" + str(error) + "`\n")
    for i in error_list:
        stats_output.write("  - [`" + str(i) + "`](./" + str(i) + ".json)\n")
    stats_output.write("- Sec_Warnings: `" + str(sec_warning) + "`\n")
    for i in sec_warning_list:
        stats_output.write("  - [`" + str(i) + "`](./" + str(i) + ".json)\n")
    stats_output.write("- Suggestions: `" + str(suggestion) + "`\n")
    for i in suggestion_list:
        stats_output.write("  - [`" + str(i) + "`](./" + str(i) + ".json)\n")
    stats_output.write("- Warnings: `" + str(warning) + "`\n")
    for i in warning_list:
        stats_output.write("  - [`" + str(i) + "`](./" + str(i) + ".json)\n")
    stats_output.write("- Fails: `" + str(fail) + "`\n")
    for i in fail_list:
        stats_output.write("  - [`" + str(i) + "`](./fails.txt)\n")
    deprecated_number = len(deprecated)
    stats_output.write("- Deprecated: `" + str(deprecated_number) + "`\n")
    for i in deprecated:
        stats_output.write("  - [`" + str(i) + "`](../policies/" + str(i) + ")\n")
    stats_output.close()

    # Craft DEPRECATED.json Policies list
    # Deprecated from this repository Archive, some policies was existing
    # before first commit.
    deprecated_output = open("./DEPRECATED.json", "w")
    formated_deprecated = json.dumps(sorted(deprecated, key=str.lower), indent=4)
    deprecated_output.write(formated_deprecated)
    deprecated_output.close()


def stats(deprecated, analyzed_count, error, fail, sec_warning, suggestion, warning):
    deprecated_number = len(deprecated)
    print("======== stats =======")
    print("policies analyzed:", analyzed_count)
    print("errors:", error)
    print("sec_warnings:", sec_warning)
    print("suggestions:", suggestion)
    print("warnings:", warning)
    print("fail:", fail)
    print("deprecated:", deprecated_number)
    print("======================")


def main(event, context):
    clean_findings_folder()
    deprecated = check_deprecated()
    (
        analyzed_count,
        error,
        fail,
        sec_warning,
        suggestion,
        warning,
        error_list,
        fail_list,
        sec_warning_list,
        suggestion_list,
        warning_list,
    ) = validate_policies(deprecated)
    output_writer(
        deprecated,
        analyzed_count,
        error,
        fail,
        sec_warning,
        suggestion,
        warning,
        error_list,
        fail_list,
        sec_warning_list,
        suggestion_list,
        warning_list,
    )
    stats(deprecated, analyzed_count, error, fail, sec_warning, suggestion, warning)


if __name__ == "__main__":
    main(0, 0)

#!/usr/bin/env python3
"""
AWS Access Analyzer Policy Validation Script

This script validates AWS managed policies using AWS Access Analyzer and generates
reports of findings including errors, security warnings, suggestions, and warnings.
"""

import boto3
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field
from botocore.exceptions import ClientError, NoCredentialsError
import argparse


@dataclass
class ValidationStats:
    """Container for validation statistics."""

    analyzed_count: int = 0
    errors: int = 0
    fails: int = 0
    security_warnings: int = 0
    suggestions: int = 0
    warnings: int = 0
    error_policies: Set[str] = field(default_factory=set)
    failed_policies: Set[str] = field(default_factory=set)
    security_warning_policies: Set[str] = field(default_factory=set)
    suggestion_policies: Set[str] = field(default_factory=set)
    warning_policies: Set[str] = field(default_factory=set)


class PolicyValidator:
    """Handles AWS policy validation using Access Analyzer."""

    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.access_analyzer = None
        self.iam = None
        self._setup_aws_clients()

    def _setup_aws_clients(self):
        """Initialize AWS clients with proper error handling."""
        try:
            self.access_analyzer = boto3.client("accessanalyzer")
            self.iam = boto3.client("iam")
            self.logger.info("AWS clients initialized successfully")
        except NoCredentialsError:
            self.logger.error(
                "AWS credentials not found. Please configure your credentials."
            )
            sys.exit(1)
        except Exception as e:
            self.logger.error(f"Failed to initialize AWS clients: {e}")
            sys.exit(1)

    def get_current_policies(self) -> List[str]:
        """Retrieve current AWS managed policies using boto3 instead of CLI."""
        try:
            paginator = self.iam.get_paginator("list_policies")
            current_policies = []

            for page in paginator.paginate(Scope="AWS"):
                for policy in page["Policies"]:
                    current_policies.append(policy["PolicyName"])

            self.logger.info(
                f"Retrieved {len(current_policies)} current AWS managed policies"
            )
            return current_policies

        except ClientError as e:
            self.logger.error(f"Failed to retrieve current policies: {e}")
            # Fallback to reading from file if API fails
            return self._read_policies_from_file()

    def _read_policies_from_file(self) -> List[str]:
        """Fallback method to read policies from policies-list.json."""
        try:
            with open(self.config["policies_list_file"], "r") as f:
                data = json.load(f)
                policies = [policy["PolicyName"] for policy in data.get("Policies", [])]
                self.logger.info(f"Read {len(policies)} policies from file")
                return policies
        except FileNotFoundError:
            self.logger.error(
                f"Policies list file not found: {self.config['policies_list_file']}"
            )
            return []
        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON in policies list file: {e}")
            return []

    def get_deprecated_policies(self) -> Dict[str, str]:
        """Identify deprecated policies by comparing repo with current AWS policies."""
        current_policies = set(self.get_current_policies())
        repo_policies = set()

        # Get policies from repository
        policy_path = Path(self.config["policy_path"])
        if policy_path.exists():
            for policy_file in policy_path.rglob("*"):
                if policy_file.is_file():
                    repo_policies.add(policy_file.name)

        # Load existing deprecated policies to preserve dates
        existing_deprecated = self._load_existing_deprecated()

        # Find newly deprecated policies
        newly_deprecated = repo_policies - current_policies
        current_date = datetime.now().strftime("%Y-%m-%d")

        # Update deprecated policies dict
        deprecated_policies = {}

        # Add existing deprecated policies with their original dates
        for policy in existing_deprecated:
            if policy in newly_deprecated:
                deprecated_policies[policy] = existing_deprecated[policy]
            # Keep policies that are no longer in repo but were previously deprecated

        # Add newly deprecated policies with current date
        for policy in newly_deprecated:
            if policy not in existing_deprecated:
                deprecated_policies[policy] = current_date
                self.logger.info(
                    f"Newly deprecated policy detected: {policy} on {current_date}"
                )

        self.logger.info(f"Found {len(deprecated_policies)} deprecated policies")
        return deprecated_policies

    def _load_existing_deprecated(self) -> Dict[str, str]:
        """Load existing deprecated policies with their dates."""
        try:
            if Path(self.config["deprecated_file"]).exists():
                with open(self.config["deprecated_file"], "r") as f:
                    data = json.load(f)
                    # Handle both old format (list) and new format (dict)
                    if isinstance(data, list):
                        # Convert old format to new format with unknown date
                        self.logger.info(
                            "Converting deprecated policies from old format to new format with timestamps"
                        )
                        return {policy: "Unknown" for policy in data}
                    elif isinstance(data, dict):
                        return data
            return {}
        except Exception as e:
            self.logger.warning(f"Failed to load existing deprecated policies: {e}")
            return {}

    def validate_policy(self, policy_path: Path) -> Optional[List[Dict]]:
        """Validate a single policy using AWS Access Analyzer."""
        try:
            with open(policy_path, "r") as f:
                policy_data = json.load(f)

            # Extract policy document
            policy_document = policy_data.get("PolicyVersion", {}).get("Document", {})
            if not policy_document:
                self.logger.warning(f"No policy document found in {policy_path}")
                return None

            # Validate policy
            response = self.access_analyzer.validate_policy(
                policyDocument=json.dumps(policy_document), policyType="IDENTITY_POLICY"
            )

            return response.get("findings", [])

        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON in {policy_path}: {e}")
            return None
        except ClientError as e:
            self.logger.error(f"AWS API error validating {policy_path}: {e}")
            return None
        except Exception as e:
            self.logger.error(f"Unexpected error validating {policy_path}: {e}")
            return None

    def validate_policies(self, deprecated_policies: Dict[str, str]) -> ValidationStats:
        """Validate all policies and collect statistics."""
        stats = ValidationStats()
        policy_path = Path(self.config["policy_path"])

        if not policy_path.exists():
            self.logger.error(f"Policy path does not exist: {policy_path}")
            return stats

        policy_files = list(policy_path.rglob("*"))
        total_policies = len(policy_files)

        self.logger.info(f"Starting validation of {total_policies} policies")

        for i, policy_file in enumerate(policy_files, 1):
            if not policy_file.is_file():
                continue

            policy_name = policy_file.name

            # Skip deprecated policies
            if policy_name in deprecated_policies:
                continue

            self.logger.info(f"Validating {policy_name} ({i}/{total_policies})")

            findings = self.validate_policy(policy_file)
            if findings is None:
                stats.fails += 1
                stats.failed_policies.add(policy_name)
                continue

            stats.analyzed_count += 1

            # Process findings
            if findings:
                self._process_findings(findings, policy_name, stats)
                self._save_findings(findings, policy_name)
            else:
                self.logger.debug(f"No issues found in {policy_name}")

        return stats

    def _process_findings(
        self, findings: List[Dict], policy_name: str, stats: ValidationStats
    ):
        """Process and categorize findings."""
        for finding in findings:
            finding_type = finding.get("findingType", "")

            if finding_type == "ERROR":
                stats.errors += 1
                stats.error_policies.add(policy_name)
            elif finding_type == "SECURITY_WARNING":
                stats.security_warnings += 1
                stats.security_warning_policies.add(policy_name)
            elif finding_type == "SUGGESTION":
                stats.suggestions += 1
                stats.suggestion_policies.add(policy_name)
            elif finding_type == "WARNING":
                stats.warnings += 1
                stats.warning_policies.add(policy_name)

    def _save_findings(self, findings: List[Dict], policy_name: str):
        """Save findings to JSON file."""
        findings_path = Path(self.config["findings_path"]) / f"{policy_name}.json"
        try:
            with open(findings_path, "w") as f:
                json.dump(findings, f, indent=2)
        except Exception as e:
            self.logger.error(f"Failed to save findings for {policy_name}: {e}")


class ReportGenerator:
    """Handles report generation and output."""

    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)

    def clean_findings_folder(self):
        """Clean the findings folder."""
        findings_path = Path(self.config["findings_path"])
        if findings_path.exists():
            for file_path in findings_path.iterdir():
                if file_path.is_file():
                    file_path.unlink()
            self.logger.info("Cleaned findings folder")

    def generate_readme(
        self, stats: ValidationStats, deprecated_policies: Dict[str, str]
    ):
        """Generate README.md with validation results."""
        findings_path = Path(self.config["findings_path"])
        readme_path = findings_path / "README.md"

        try:
            with open(readme_path, "w") as f:
                f.write(
                    f"# AWS Access Analyzer - Findings - {datetime.now().strftime('%Y-%m-%d')}\n\n"
                )

                f.write(f"- **Policies analyzed:** `{stats.analyzed_count}`\n")
                f.write(f"- **Errors:** `{stats.errors}`\n")
                for policy in sorted(stats.error_policies):
                    f.write(f"  - [`{policy}`](./{policy}.json)\n")

                f.write(f"- **Security Warnings:** `{stats.security_warnings}`\n")
                for policy in sorted(stats.security_warning_policies):
                    f.write(f"  - [`{policy}`](./{policy}.json)\n")

                f.write(f"- **Suggestions:** `{stats.suggestions}`\n")
                for policy in sorted(stats.suggestion_policies):
                    f.write(f"  - [`{policy}`](./{policy}.json)\n")

                f.write(f"- **Warnings:** `{stats.warnings}`\n")
                for policy in sorted(stats.warning_policies):
                    f.write(f"  - [`{policy}`](./{policy}.json)\n")

                f.write(f"- **Failed validations:** `{stats.fails}`\n")
                for policy in sorted(stats.failed_policies):
                    f.write(f"  - `{policy}`\n")

                f.write(f"- **Deprecated policies:** `{len(deprecated_policies)}`\n")
                for policy, date in sorted(deprecated_policies.items()):
                    f.write(
                        f"  - [`{policy}`](../policies/{policy}) (deprecated: {date})\n"
                    )

            self.logger.info("Generated README.md")

        except Exception as e:
            self.logger.error(f"Failed to generate README.md: {e}")

    def save_deprecated_list(self, deprecated_policies: Dict[str, str]):
        """Save deprecated policies list to JSON file."""
        try:
            # Sort by policy name for consistent output
            sorted_deprecated = dict(
                sorted(deprecated_policies.items(), key=lambda x: x[0].lower())
            )
            with open(self.config["deprecated_file"], "w") as f:
                json.dump(sorted_deprecated, f, indent=2)
            self.logger.info(
                f"Saved {len(deprecated_policies)} deprecated policies to {self.config['deprecated_file']}"
            )
        except Exception as e:
            self.logger.error(f"Failed to save deprecated policies list: {e}")

    def print_stats(self, stats: ValidationStats, deprecated_policies: Dict[str, str]):
        """Print validation statistics to console."""
        print("\n" + "=" * 50)
        print("VALIDATION STATISTICS")
        print("=" * 50)
        print(f"Policies analyzed: {stats.analyzed_count}")
        print(f"Errors: {stats.errors}")
        print(f"Security warnings: {stats.security_warnings}")
        print(f"Suggestions: {stats.suggestions}")
        print(f"Warnings: {stats.warnings}")
        print(f"Failed validations: {stats.fails}")
        print(f"Deprecated policies: {len(deprecated_policies)}")
        print("=" * 50)


def setup_logging(level: str = "INFO") -> None:
    """Setup logging configuration."""
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler("validation.log"),
        ],
    )


def get_config() -> Dict:
    """Get configuration settings."""
    return {
        "policy_path": "./policies",
        "findings_path": "./findings",
        "policies_list_file": "./policies-list.json",
        "deprecated_file": "./DEPRECATED.json",
        "max_policies": 5000,
    }


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description="Validate AWS policies using Access Analyzer"
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Set logging level",
    )
    parser.add_argument(
        "--max-policies",
        type=int,
        default=5000,
        help="Maximum number of policies to analyze",
    )
    args = parser.parse_args()

    # Setup logging
    setup_logging(args.log_level)
    logger = logging.getLogger(__name__)

    try:
        # Get configuration
        config = get_config()
        config["max_policies"] = args.max_policies

        # Ensure findings directory exists
        Path(config["findings_path"]).mkdir(exist_ok=True)

        # Initialize components
        validator = PolicyValidator(config)
        report_generator = ReportGenerator(config)

        # Clean findings folder
        report_generator.clean_findings_folder()

        # Get deprecated policies
        logger.info("Identifying deprecated policies...")
        deprecated_policies = validator.get_deprecated_policies()

        # Validate policies
        logger.info("Starting policy validation...")
        stats = validator.validate_policies(deprecated_policies)

        # Generate reports
        logger.info("Generating reports...")
        report_generator.generate_readme(stats, deprecated_policies)
        report_generator.save_deprecated_list(deprecated_policies)
        report_generator.print_stats(stats, deprecated_policies)

        logger.info("Validation completed successfully")

    except KeyboardInterrupt:
        logger.info("Validation interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

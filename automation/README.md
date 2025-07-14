# AWS Policy Validation Script

This script validates AWS managed policies using AWS Access Analyzer and generates comprehensive reports of findings.

## Features

- **Comprehensive Validation**: Validates AWS managed policies using AWS Access Analyzer
- **Deprecated Policy Detection**: Automatically identifies deprecated policies by comparing with current AWS policies and tracks deprecation dates
- **Detailed Reporting**: Generates detailed reports with categorized findings
- **Robust Error Handling**: Proper error handling and logging throughout the process
- **Configurable**: Command-line options for customization
- **Logging**: Comprehensive logging to both console and file

## Requirements

- Python 3.7+
- AWS credentials configured (via AWS CLI, environment variables, or IAM role)
- Required permissions:
  - `accessanalyzer:ValidatePolicy`
  - `iam:ListPolicies`

## Installation

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Configure AWS credentials:

```bash
aws configure
```

## Usage

### Basic Usage

```bash
python validate-batch.py
```

### Advanced Usage

```bash
# Set logging level
python validate-batch.py --log-level DEBUG

# Limit number of policies to analyze
python validate-batch.py --max-policies 1000

# Combine options
python validate-batch.py --log-level INFO --max-policies 2000
```

### Command Line Options

- `--log-level`: Set logging level (DEBUG, INFO, WARNING, ERROR). Default: INFO
- `--max-policies`: Maximum number of policies to analyze. Default: 5000

## Output

The script generates several output files:

### Findings Directory (`./findings/`)

- `README.md`: Summary report with statistics and links to detailed findings
- `{policy_name}.json`: Individual policy findings in JSON format

### Log Files

- `validation.log`: Detailed execution log

### Other Files

- `DEPRECATED.json`: List of deprecated policies with deprecation dates

## Output Structure

### README.md Example

```markdown
# AWS Access Analyzer - Findings - 2024-01-15

- **Policies analyzed:** `1500`
- **Errors:** `5`
  - [`AdministratorAccess`](./AdministratorAccess.json)
- **Security Warnings:** `12`
  - [`PowerUserAccess`](./PowerUserAccess.json)
- **Suggestions:** `45`
- **Warnings:** `23`
- **Failed validations:** `2`
- **Deprecated policies:** `15`
```

### JSON Findings Format

```json
[
  {
    "findingType": "ERROR",
    "findingDetails": "Policy grants overly permissive access",
    "locations": [...],
    "issueCode": "POLICY_GRANTS_OVERLY_PERMISSIVE_ACCESS"
  }
]
```

### Deprecated Policies Format

```json
{
  "AmazonApplicationWizardFullaccess": "2024-01-15",
  "AmazonConnectFullAccess": "2024-01-10",
  "AmazonDataZonePortalFullAccessPolicy": "Unknown"
}
```

## Error Handling

The script includes comprehensive error handling for:

- AWS API errors
- Invalid JSON files
- Missing credentials
- Network issues
- File system errors

## Logging

Logs are written to both console and `validation.log` file with timestamps and log levels.

### Log Levels

- `DEBUG`: Detailed debugging information
- `INFO`: General information about script execution
- `WARNING`: Warning messages for non-critical issues
- `ERROR`: Error messages for critical issues

## Configuration

The script uses a configuration dictionary that can be modified in the `get_config()` function:

```python
{
    'policy_path': './policies',           # Path to policy files
    'findings_path': './findings',         # Path for output files
    'policies_list_file': './policies-list.json',  # Fallback policies list
    'deprecated_file': './DEPRECATED.json', # Deprecated policies output
    'max_policies': 5000                   # Maximum policies to analyze
}
```

## Architecture

The script is organized into several classes:

- **PolicyValidator**: Handles AWS policy validation
- **ReportGenerator**: Manages report generation and output
- **ValidationStats**: Data container for statistics

## Deprecated Policy Tracking

The script now tracks when policies become deprecated:

- **New Deprecations**: When a policy is newly detected as deprecated, it's marked with the current date
- **Existing Deprecations**: Previously deprecated policies retain their original deprecation dates
- **Format Migration**: The script automatically migrates from the old list format to the new dictionary format with timestamps
- **Unknown Dates**: Policies that existed before this feature was implemented are marked with "Unknown" date

## Troubleshooting

### Common Issues

1. **AWS Credentials Not Found**

   - Ensure AWS credentials are configured
   - Check AWS CLI configuration: `aws configure list`

2. **Permission Denied**

   - Verify IAM permissions for Access Analyzer and IAM services
   - Check if your role/user has the required permissions

3. **Rate Limiting**

   - The script includes built-in error handling for API rate limits
   - Consider reducing the number of policies analyzed if needed

4. **Memory Issues**
   - For large policy sets, consider processing in smaller batches
   - Monitor system resources during execution

## Contributing

When contributing to this script:

1. Follow PEP 8 style guidelines
2. Add type hints for all functions
3. Include proper error handling
4. Add logging for important operations
5. Update documentation for new features

## License

This script is part of the MAMIP project. See the main project LICENSE file for details.

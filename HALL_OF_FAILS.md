# Hall of Fails :trophy:

> On this page, you will find the most famous failures from AWS on AWS IAM Managed Policies.

|Date|Policy|Failure|Revert|Duration|Official statement|
|---|---|---|:---:|:---:|:---:|
|2021-12-22|[`AWSSupportServiceRolePolicy`](https://github.com/z0ph/MAMIP/commit/9d7270928984e52c5ad8ebcc96ab5d58ed5acaf7#diff-6cf37356bf4a111ac75c84086acac5608bfc1390ba399181cc3ea6d6eb4afab3R1642)|Overprivilege (S3)|[Link](https://github.com/z0ph/MAMIP/commit/b6f696cebc7b9a4f71dd34c1da81287fa0230674)|~10 hours|[AWS-2021-007](https://aws.amazon.com/security/security-bulletins/AWS-2021-007/)|
|2020-10-16|[`ReadOnlyAccess`](https://twitter.com/__steele/status/1316914387710599168)|Multiple|[Link](https://github.com/z0ph/MAMIP/commit/9116bc6101bccfa94e1b7d80a317a146d5242f48)|~2 hours|n/a|
|2019-03-03|[`AmazonAthenaFullAccess`](https://github.com/z0ph/mamip/commit/6655c5d223a7852998cb6ec74e7e59b939feb221#diff-b1114ba9f7dc6c44ac97b12f37e7cd44333cce3353a4782f633b68587e49d883R72)|Overprivilege (S3)|Nope||n/a|
|Multiple|[`Internal Policies`](https://github.com/z0ph/MAMIP/blob/master/DEPRECATED.json)|Pushing Internal Policies|Multiple|n/a|n/a|
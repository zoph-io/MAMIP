import Link from "next/link";

const basePath = process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "";

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
          About This Archive
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          How we track and historize AWS Managed IAM Policy changes
        </p>
      </div>

      {/* Main Content */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 space-y-6">
        {/* What is MAMIP */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            🔊 What is MAMIP?
          </h2>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
            MAMIP (Monitor AWS Managed IAM Policies) is an{" "}
            <strong>unofficial archive</strong> that continuously tracks every
            change made to AWS Managed IAM Policies. We provide a comprehensive,
            searchable history of policy modifications with full version control
            through Git.
          </p>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            This service is particularly valuable for AWS practitioners who need
            to stay informed about security changes, spot new AWS service
            launches early (via v1 policies), and maintain compliance
            documentation.
          </p>
        </section>

        {/* How It Works */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            ⚙️ How Does It Work?
          </h2>

          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                1. Automated Collection (Every 4 Hours)
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Our system runs on <strong>AWS ECS Fargate</strong> with Spot
                instances for cost optimization. A scheduled CloudWatch Event
                triggers the collection process every 4 hours during weekdays
                (Monday to Friday), using the cron expression:{" "}
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-900 rounded text-sm">
                  cron(0 */4 ? * MON-FRI *)
                </code>
              </p>
            </div>

            <div className="border-l-4 border-green-500 pl-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                2. Policy Retrieval via AWS CLI
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                We use the official AWS CLI to fetch all managed policies:
              </p>
              <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <div className="text-slate-800 dark:text-slate-200">
                  # List all AWS managed policies
                  <br />
                  aws iam list-policies --scope AWS
                  <br />
                  <br />
                  # Retrieve each policy document
                  <br />
                  aws iam get-policy-version \<br />
                  &nbsp;&nbsp;--policy-arn arn:aws:iam::aws:policy/[PolicyName]
                  \<br />
                  &nbsp;&nbsp;--version-id [VersionId]
                </div>
              </div>
            </div>

            <div className="border-l-4 border-purple-500 pl-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                3. Change Detection & Version Control
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Each policy is compared against our Git repository. When changes
                are detected:
              </p>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-2 mt-3">
                <li>Policy documents are stored as individual JSON files</li>
                <li>Each change gets its own Git commit with timestamp</li>
                <li>Version history is preserved indefinitely</li>
                <li>Diffs are automatically generated</li>
              </ul>
            </div>

            <div className="border-l-4 border-orange-500 pl-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                4. Policy Validation
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Every policy is validated using{" "}
                <strong>AWS IAM Access Analyzer</strong> to identify:
              </p>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-1 mt-2">
                <li>Security warnings</li>
                <li>Best practice recommendations</li>
                <li>Syntax issues</li>
                <li>Redundant statements</li>
              </ul>
            </div>

            <div className="border-l-4 border-red-500 pl-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                5. Multi-Channel Notifications
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Policy changes are broadcast through multiple channels:
              </p>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-1 mt-2">
                <li>Bluesky (@mamip.bsky.social)</li>
                <li>Twitter/𝕏 (@mamip_aws)</li>
                <li>
                  AWS SNS Topic
                  (arn:aws:sns:eu-west-1:567589703415:mamip-sns-topic)
                </li>
                <li>GitHub commits & releases</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Technology Stack */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            🏗️ Technology Stack
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                Infrastructure
              </h4>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>• AWS ECS Fargate (Spot)</li>
                <li>• AWS CloudWatch Events</li>
                <li>• AWS Secrets Manager</li>
                <li>• Terraform (IaC)</li>
              </ul>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                Application
              </h4>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>• Python 3.x</li>
                <li>• AWS CLI & Boto3</li>
                <li>• Docker</li>
                <li>• Git</li>
              </ul>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                Website
              </h4>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>• Next.js 15 (SSG)</li>
                <li>• TypeScript</li>
                <li>• Tailwind CSS</li>
                <li>• GitHub Pages</li>
              </ul>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                Validation
              </h4>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>• AWS IAM Access Analyzer</li>
                <li>• Policy validation API</li>
                <li>• Security findings</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Credits */}
        <section className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            💡 Credits & Inspiration
          </h2>
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 mb-6">
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
              The initial idea for tracking AWS Managed IAM Policies comes from{" "}
              <strong>
                <a
                  href="https://twitter.com/0xdabbad00"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Scott Piper (@0xdabbad00)
                </a>
              </strong>{" "}
              from SummitRoute, who created the{" "}
              <a
                href="https://github.com/SummitRoute/aws_managed_policies"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                original aws_managed_policies repository
              </a>
              .
            </p>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              MAMIP extends this concept by adding automated infrastructure,
              continuous monitoring, policy validation, multi-channel
              notifications, and this searchable web interface. Scott's work
              laid the foundation for tracking these important security changes
              in the AWS ecosystem.
            </p>
          </div>
        </section>

        {/* About the Creator */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            👨‍💻 About the Maintainer
          </h2>
          <div className="flex items-start space-x-4">
            <img
              src={`${basePath}/zoph-logo.png`}
              alt="zoph.io"
              className="h-16 w-auto dark:brightness-110 flex-shrink-0"
            />
            <div className="space-y-3">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                MAMIP is created and maintained by{" "}
                <strong>
                  <a
                    href="https://zoph.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    zoph.io
                  </a>
                </strong>
                , an <strong>AWS Cloud Advisory Boutique</strong> based in
                France.
              </p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                As a freelance AWS consultant specializing in cloud security,
                compliance, and infrastructure automation, I created this tool
                to help the AWS community stay informed about IAM policy changes
                and maintain better security posture.
              </p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                This project combines my expertise in AWS security, DevOps
                practices, and open-source development to provide a valuable
                resource for AWS practitioners worldwide.
              </p>
            </div>
          </div>
        </section>

        {/* Links */}
        <section className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
            🔗 Useful Links
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="https://github.com/z0ph/MAMIP"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <span>→</span>
              <span>GitHub Repository</span>
            </a>
            <a
              href="https://bsky.app/profile/mamip.bsky.social"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <span>→</span>
              <span>Follow on Bluesky</span>
            </a>
            <a
              href="https://x.com/mamip_aws"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <span>→</span>
              <span>Follow on Twitter/𝕏</span>
            </a>
            <a
              href="https://zoph.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <span>→</span>
              <span>AWS Cloud Advisory Services</span>
            </a>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <h2 className="text-lg font-bold text-amber-900 dark:text-amber-200 mb-2 flex items-center">
            <span className="mr-2">⚠️</span>
            Important Disclaimer
          </h2>
          <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
            This is an <strong>unofficial archive</strong> and is{" "}
            <strong>
              not affiliated with, endorsed by, or sponsored by Amazon Web
              Services (AWS)
            </strong>
            . AWS, Amazon Web Services, and all related marks are trademarks of
            Amazon.com, Inc. or its affiliates. This project is independently
            operated and maintained for educational and informational purposes.
          </p>
        </section>

        {/* CTA */}
        <section className="text-center pt-6">
          <Link
            href={`${basePath}/policies`}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Explore Policy Archive →
          </Link>
        </section>
      </div>
    </div>
  );
}

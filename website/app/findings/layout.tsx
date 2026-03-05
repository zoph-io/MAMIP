import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Policy Validation Findings - AWS Access Analyzer",
  description:
    "AWS IAM Access Analyzer findings on AWS's own Managed IAM Policies. Discover errors, security warnings, and suggestions in policies that AWS ships.",
  alternates: {
    canonical: "https://mamip.zoph.io/findings",
  },
  openGraph: {
    title: "Policy Validation Findings | MAMIP",
    description:
      "Using AWS's own IAM Access Analyzer to validate AWS Managed IAM Policies — reviewing the reviewer.",
    url: "https://mamip.zoph.io/findings",
  },
};

export default function FindingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

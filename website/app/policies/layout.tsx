import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse All AWS Managed IAM Policies",
  description:
    "Search, filter, and explore all AWS Managed IAM Policies. View version history, creation dates, and modification counts.",
  alternates: {
    canonical: "https://mamip.zoph.io/policies",
  },
  openGraph: {
    title: "Browse All AWS Managed IAM Policies | MAMIP",
    description:
      "Search, filter, and explore all AWS Managed IAM Policies with full version history.",
    url: "https://mamip.zoph.io/policies",
  },
};

export default function PoliciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

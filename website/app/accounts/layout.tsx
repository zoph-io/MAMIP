import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Known AWS Account Lookup",
  description:
    "Search for AWS account IDs to identify their owners. Powered by the fwdcloudsec community database of known AWS vendor accounts.",
  alternates: {
    canonical: "https://mamip.zoph.io/accounts",
  },
  openGraph: {
    title: "Known AWS Account Lookup | MAMIP",
    description:
      "Search for AWS account IDs to identify their owners. Community-driven database of known vendor accounts.",
    url: "https://mamip.zoph.io/accounts",
  },
};

export default function AccountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

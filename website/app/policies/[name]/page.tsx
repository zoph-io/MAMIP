import type { Metadata } from "next";
import PolicyDetailClient from "./PolicyDetailClient";

export async function generateStaticParams() {
  const fs = require("fs");
  const path = require("path");
  const dataPath = path.join(process.cwd(), "public/data/summary.json");

  try {
    const data = fs.readFileSync(dataPath, "utf8");
    const summary = JSON.parse(data);
    return summary.policies.map((policy: any) => ({
      name: policy.name,
    }));
  } catch (error) {
    console.error("Error loading policies for static params:", error);
    return [];
  }
}

export async function generateMetadata(props: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const policyName = decodeURIComponent(params.name);
  return {
    title: `${policyName} - AWS Managed IAM Policy`,
    description: `View the full version history, JSON document, and change log for the ${policyName} AWS Managed IAM Policy.`,
    alternates: {
      canonical: `https://mamip.zoph.io/policies/${encodeURIComponent(policyName)}`,
    },
    openGraph: {
      title: `${policyName} | MAMIP`,
      description: `Version history and details for the ${policyName} AWS Managed IAM Policy.`,
      url: `https://mamip.zoph.io/policies/${encodeURIComponent(policyName)}`,
    },
  };
}

export default async function PolicyDetailPage(props: {
  params: Promise<{ name: string }>;
}) {
  const params = await props.params;
  return <PolicyDetailClient policyName={params.name} />;
}

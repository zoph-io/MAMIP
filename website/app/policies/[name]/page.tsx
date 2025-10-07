import PolicyDetailClient from "./PolicyDetailClient";

// Generate static params for all policies
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

export default async function PolicyDetailPage(props: {
  params: Promise<{ name: string }>;
}) {
  const params = await props.params;
  return <PolicyDetailClient policyName={params.name} />;
}

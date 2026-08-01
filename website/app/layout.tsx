import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import SiteFooter from "@/components/SiteFooter";
import { FOUNDER_ID, PARENT_ORG_NODE, SITE_URL } from "@/lib/galaxy";

export const metadata: Metadata = {
  title: {
    default: "IAMTrail - AWS Managed Policy Changes Archive (Unofficial) | zoph.io",
    template: "%s | IAMTrail",
  },
  description:
    "Track every change to AWS Managed IAM Policies with full version history. An unofficial archive by zoph.io, an independent AWS consulting boutique.",
  metadataBase: new URL("https://iamtrail.com"),
  keywords: [
    "AWS",
    "IAM",
    "managed policies",
    "policy changes",
    "version history",
    "AWS security",
    "cloud security",
    "policy monitoring",
    "AWS managed IAM policies",
    "IAMTrail",
    "GuardDuty",
    "GuardDuty announcements",
    "AWS GuardDuty findings",
  ],
  authors: [{ name: "zoph.io", url: "https://zoph.io" }],
  creator: "zoph.io",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://iamtrail.com",
    siteName: "IAMTrail - AWS Managed Policy Changes Archive",
    title: "IAMTrail - AWS Managed Policy Changes Archive (Unofficial)",
    description:
      "Track every change to AWS Managed IAM Policies with full version history. An unofficial archive by zoph.io.",
    images: [
      {
        url: "/social.png",
        width: 1200,
        height: 630,
        alt: "IAMTrail - AWS Managed Policy Changes Archive by zoph.io",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IAMTrail - AWS Managed Policy Changes Archive",
    description:
      "Track every change to AWS Managed IAM Policies with full version history.",
    images: ["/social.png"],
  },
  alternates: {
    canonical: "https://iamtrail.com",
    types: {
      "application/rss+xml": [
        { url: "/feeds/all.xml", title: "IAMTrail - All Changes" },
        { url: "/feeds/discoveries.xml", title: "IAMTrail - Discoveries" },
        { url: "/feeds/iam-policies.xml", title: "IAMTrail - IAM Policy Changes" },
        { url: "/feeds/endpoints.xml", title: "IAMTrail - Endpoint Changes" },
        { url: "/feeds/guardduty.xml", title: "IAMTrail - GuardDuty Announcements" },
      ],
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          src="https://cdn.usefathom.com/script.js"
          data-site="NZNRSCBU"
          defer
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              name: "IAMTrail - AWS Managed Policy Changes Archive",
              url: SITE_URL,
              description:
                "Track every change to AWS Managed IAM Policies with full version history.",
              inLanguage: "en",
              publisher: PARENT_ORG_NODE,
              creator: { "@id": FOUNDER_ID },
              potentialAction: {
                "@type": "SearchAction",
                target: "https://iamtrail.com/policies?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
      </head>
      <body
        className="min-h-screen bg-white dark:bg-zinc-950"
        suppressHydrationWarning
      >
        <NavBar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

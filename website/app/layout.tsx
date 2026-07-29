import type { Metadata, Viewport } from "next";
import { Rss, Send } from "lucide-react";
import "./globals.css";
import NavBar from "@/components/NavBar";
import { TELEGRAM_URL } from "@/lib/social";
import {
  FOUNDER_ID,
  PARENT_ORG_NODE,
  SIBLING_LINKS,
  SITE_URL,
} from "@/lib/galaxy";

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
        <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col items-center space-y-4">
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 font-mono">
                IAMTrail - AWS Managed Policy Changes Archive{" "}
                <span className="text-zinc-300 dark:text-zinc-700">|</span>{" "}
                <a
                  href="https://github.com/zoph-io/IAMTrail"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  Open Source
                </a>
              </p>

              <div className="flex items-center gap-4">
                <a
                  href="https://bsky.app/profile/iamtrail.bsky.social"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                  title="Follow on Bluesky"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
                  </svg>
                </a>
                {TELEGRAM_URL && (
                  <a
                    href={TELEGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-sky-500 dark:text-zinc-500 dark:hover:text-sky-400 transition-colors"
                    title="New service discoveries on Telegram"
                  >
                    <Send className="w-5 h-5" />
                  </a>
                )}
                <a
                  href="https://github.com/zoph-io/IAMTrail"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white transition-colors"
                  title="View on GitHub"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </a>
                <a
                  href="/feeds/"
                  className="text-zinc-400 hover:text-orange-500 dark:text-zinc-500 dark:hover:text-orange-400 transition-colors"
                  title="RSS Feeds"
                >
                  <Rss className="w-5 h-5" />
                </a>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-sm text-zinc-400 dark:text-zinc-500">
                  Built by
                </span>
                <a
                  href="https://zoph.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center space-x-2 hover:opacity-80 transition-opacity"
                >
                  <img
                    src="/zoph-logo.png"
                    alt="zoph.io"
                    className="h-8 w-auto dark:brightness-110"
                  />
                </a>
              </div>

              <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                More from zoph.io:{" "}
                {SIBLING_LINKS.map((link, index) => (
                  <span key={link.href}>
                    {index > 0 && " · "}
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      {link.label}, {link.description}
                    </a>
                  </span>
                ))}
              </p>
              <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 max-w-2xl">
                This is an unofficial archive and is not affiliated with,
                endorsed by, or sponsored by Amazon Web Services (AWS). AWS and
                related marks are trademarks of Amazon.com, Inc. or its
                affiliates.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

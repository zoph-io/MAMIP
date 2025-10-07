import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AWS Managed Policy Changes Archive (Unofficial) | zoph.io",
  description:
    "Track every change to AWS Managed IAM Policies with full version history. An unofficial archive by zoph.io - AWS Cloud Advisory Boutique.",
  metadataBase: new URL("https://mamip.zoph.io"),
  // icon.svg and apple-icon.svg in app/ directory are automatically detected by Next.js
};

// Get base path based on deployment target
const basePath =
  process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 dark:from-slate-950 dark:via-blue-950/20 dark:to-slate-900"
        suppressHydrationWarning
      >
        <nav className="border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link
                href={`${basePath}/`}
                className="flex items-center space-x-3 group"
              >
                <img
                  src={`${basePath}/zoph-logo.png`}
                  alt="zoph.io"
                  className="h-9 w-auto group-hover:scale-105 transition-transform dark:brightness-110"
                />
                <div className="border-l border-slate-300 dark:border-slate-700 pl-3 h-8 flex items-center">
                  <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-300 bg-clip-text text-transparent">
                    MAMIP
                  </h1>
                </div>
              </Link>
              <div className="flex space-x-1">
                <Link
                  href={`${basePath}/`}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-all"
                >
                  Dashboard
                </Link>
                <Link
                  href={`${basePath}/policies`}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-all"
                >
                  Policies
                </Link>
                <Link
                  href={`${basePath}/about`}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-all"
                >
                  About
                </Link>
                <a
                  href="https://github.com/z0ph/MAMIP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-all"
                >
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 dark:border-slate-800 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col items-center space-y-4">
              <p className="text-center text-sm text-slate-600 dark:text-slate-400">
                MAMIP - AWS Managed Policy Changes Archive •{" "}
                <a
                  href="https://github.com/z0ph/MAMIP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900 dark:hover:text-white"
                >
                  Open Source
                </a>
              </p>

              {/* Social Links */}
              <div className="flex items-center gap-4">
                <a
                  href="https://bsky.app/profile/mamip.bsky.social"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
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
                <a
                  href="https://x.com/mamip_aws"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                  title="Follow on X/Twitter"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://github.com/z0ph/MAMIP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
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
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-sm text-slate-500 dark:text-slate-500">
                  Made with{" "}
                  <span className="text-red-500 animate-pulse">❤️</span> by
                </span>
                <a
                  href="https://zoph.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center space-x-2 hover:opacity-80 transition-opacity"
                >
                  <img
                    src={`${basePath}/zoph-logo.png`}
                    alt="zoph.io"
                    className="h-8 w-auto dark:brightness-110"
                  />
                </a>
              </div>
              <p className="text-center text-xs text-slate-500 dark:text-slate-500 max-w-2xl">
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

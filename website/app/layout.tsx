import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MAMIP - Historize AWS Managed Policy Changes",
  description:
    "Track every change to AWS Managed IAM Policies with full version history.",
};

// Get base path based on environment
const basePath = process.env.NODE_ENV === "production" ? "/MAMIP" : "";

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
                className="flex items-center space-x-2.5 group"
              >
                <div className="text-xl group-hover:scale-110 transition-transform">
                  🔊
                </div>
                <div>
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
            <div className="flex flex-col items-center space-y-3">
              <p className="text-center text-sm text-slate-600 dark:text-slate-400">
                MAMIP - Monitor AWS Managed IAM Policies •{" "}
                <a
                  href="https://github.com/z0ph/MAMIP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900 dark:hover:text-white"
                >
                  Open Source
                </a>
              </p>
              <p className="text-center text-sm text-slate-500 dark:text-slate-500">
                Made with <span className="text-red-500 animate-pulse">❤️</span>{" "}
                by{" "}
                <a
                  href="https://zoph.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  zoph.io
                </a>
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

// Ordered by what a reader comes here for. Changes leads because the archive
// exists to record them. Usage is a subscriber counter and lives on /about.
const navLinks = [
  { href: "/changes", label: "Changes" },
  { href: "/policies", label: "Policies" },
  { href: "/discoveries", label: "Discoveries" },
  { href: "/accounts", label: "Account Lookup" },
  { href: "/findings", label: "Security findings" },
  { href: "/endpoints", label: "Endpoints" },
  { href: "/guardduty", label: "GuardDuty" },
  { href: "/feeds", label: "Feeds" },
  { href: "/api", label: "API" },
  { href: "/subscribe", label: "Subscribe" },
  { href: "/about", label: "About" },
];

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          <Link
            href="/"
            className="flex items-center space-x-2 group"
            onClick={() => setOpen(false)}
          >
            <h1 className="text-lg font-bold font-mono text-zinc-900 dark:text-white tracking-tight">
              IAMTrail<span className="text-red-600">_</span>
            </h1>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/zoph-io/IAMTrail"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
            >
              GitHub
            </a>
          </div>

          {/* Hamburger button */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {open && (
        <div className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/zoph-io/IAMTrail"
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

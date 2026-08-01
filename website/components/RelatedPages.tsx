import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { relatedLinks } from "@/lib/nav";

/**
 * Closes the loop on pages that would otherwise end the visit. Destinations
 * come from RELATED_LINKS in lib/nav.ts so the nav, the footer sitemap and
 * these cards always agree.
 */
export default function RelatedPages({ current }: { current: string }) {
  const links = relatedLinks(current);
  if (links.length === 0) return null;

  return (
    <section aria-labelledby="related-pages" className="pt-2">
      <h2
        id="related-pages"
        className="text-[10px] font-mono font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3"
      >
        Continue exploring
      </h2>
      <div className="grid sm:grid-cols-3 gap-3">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-red-500 dark:hover:border-red-500 rounded-lg p-4 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
                <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {link.label}
                </span>
                <ArrowRight className="w-3.5 h-3.5 ml-auto text-zinc-300 dark:text-zinc-600 group-hover:text-red-600 dark:group-hover:text-red-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {link.description}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

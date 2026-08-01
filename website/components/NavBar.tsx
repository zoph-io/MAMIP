"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import {
  GITHUB_URL,
  MENU_GROUPS,
  PRIMARY_NAV,
  SUBSCRIBE_ITEM,
  isActive,
} from "@/lib/nav";

function isExternal(href: string) {
  return href.startsWith("http");
}

function NavSearch({
  onSubmitted,
  autoFocus = false,
}: {
  onSubmitted?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState("");

  // On /policies the page owns the query, so mirror it instead of showing an
  // empty box next to a filtered list.
  useEffect(() => {
    if (pathname === "/policies") {
      setValue(searchParams.get("q") ?? "");
    }
  }, [pathname, searchParams]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        router.push(query ? `/policies?q=${encodeURIComponent(query)}` : "/policies");
        onSubmitted?.();
      }}
      className="relative flex-1"
    >
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search policies or s3:GetObject"
        aria-label="Search policies or IAM actions"
        className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-red-500 dark:focus:border-red-500 rounded text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none transition-colors"
      />
    </form>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuOpen]);

  // The mobile panel is a full-height sheet, so the page behind it must not
  // scroll away underneath.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (mobile) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 sm:gap-4 h-14">
          <Link href="/" className="flex-shrink-0" aria-label="IAMTrail home">
            <h1 className="text-lg font-bold font-mono text-zinc-900 dark:text-white tracking-tight">
              IAMTrail<span className="text-red-600">_</span>
            </h1>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {PRIMARY_NAV.map((link) => {
              const active = isActive(link.href, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    active
                      ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40"
                      : "text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Below lg the bar cannot hold the input without squeezing the
              links, so the icon opens the same field on its own row. */}
          <div className="hidden lg:block flex-1 max-w-xs ml-auto">
            <Suspense fallback={null}>
              <NavSearch />
            </Suspense>
          </div>

          <div className="flex items-center gap-1 ml-auto lg:ml-0">
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-label="Search"
              aria-expanded={searchOpen}
              className="lg:hidden p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>

            <Link
              href={SUBSCRIBE_ITEM.href}
              className="px-3 sm:px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-mono font-semibold rounded transition-colors"
            >
              Subscribe
            </Link>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls="nav-menu"
                className="flex items-center gap-1.5 px-2 py-2 md:px-3 md:py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                {menuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
                <span className="hidden md:inline">More</span>
              </button>

              {menuOpen && (
                <div
                  id="nav-menu"
                  className="fixed md:absolute inset-x-0 md:inset-x-auto md:right-0 top-14 md:top-full md:mt-2 bottom-0 md:bottom-auto md:w-[42rem] overflow-y-auto bg-white dark:bg-zinc-950 md:rounded-lg border-t md:border border-zinc-200 dark:border-zinc-800 md:shadow-xl"
                >
                  <div className="p-4 space-y-5">
                    <div className="md:hidden">
                      <Suspense fallback={null}>
                        <NavSearch
                          autoFocus
                          onSubmitted={() => setMenuOpen(false)}
                        />
                      </Suspense>
                    </div>

                    <div className="grid md:grid-cols-2 gap-x-6 gap-y-5">
                      {MENU_GROUPS.map((group) => (
                        <div key={group.id}>
                          <p className="px-2 pb-1.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                            {group.label}
                          </p>
                          <ul>
                            {group.items.map((item) => {
                              const external = isExternal(item.href);
                              const active =
                                !external && isActive(item.href, pathname);
                              const Icon = item.icon;
                              const content = (
                                <>
                                  <Icon
                                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                                      active
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-zinc-400 dark:text-zinc-500"
                                    }`}
                                  />
                                  <span className="min-w-0">
                                    <span
                                      className={`block text-sm font-medium ${
                                        active
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-zinc-900 dark:text-zinc-100"
                                      }`}
                                    >
                                      {item.label}
                                    </span>
                                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                                      {item.description}
                                    </span>
                                  </span>
                                </>
                              );
                              const className =
                                "flex items-start gap-2.5 px-2 py-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors";

                              return (
                                <li key={item.href}>
                                  {external ? (
                                    <a
                                      href={item.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={className}
                                    >
                                      {content}
                                    </a>
                                  ) : (
                                    <Link
                                      href={item.href}
                                      aria-current={active ? "page" : undefined}
                                      onClick={() => setMenuOpen(false)}
                                      className={className}
                                    >
                                      {content}
                                    </Link>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {searchOpen && (
          <div className="lg:hidden pb-3">
            <Suspense fallback={null}>
              <NavSearch autoFocus onSubmitted={() => setSearchOpen(false)} />
            </Suspense>
          </div>
        )}
      </div>
    </nav>
  );
}

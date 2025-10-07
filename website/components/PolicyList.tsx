import Link from "next/link";

// Get base path based on deployment target
const basePath = process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "";

interface Policy {
  name: string;
  lastModified: string;
  createDate: string | null;
  versionsCount: number;
  versionId: string | null;
}

interface PolicyListProps {
  title: string;
  policies: Policy[];
  showVersions?: boolean;
}

export default function PolicyList({
  title,
  policies,
  showVersions = true,
}: PolicyListProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
    return `${Math.floor(diffInDays / 365)} years ago`;
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {policies.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500">
            No policies found
          </div>
        ) : (
          policies.map((policy) => (
            <Link
              key={policy.name}
              href={`${basePath}/policies/${encodeURIComponent(policy.name)}`}
              className="block px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {policy.name}
                  </p>
                  <div className="mt-1 flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{getRelativeTime(policy.lastModified)}</span>
                    {showVersions && (
                      <span>
                        • {policy.versionsCount} version
                        {policy.versionsCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {policy.createDate && (
                      <span className="hidden sm:inline">
                        • Created {formatDate(policy.createDate)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-slate-400"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

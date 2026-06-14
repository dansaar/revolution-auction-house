"use client";

export type FilterOption = { value: string; label: string };

/**
 * Reusable filter bar for the seller/buyer dashboards: a title search box plus
 * optional status chips. Keep state in the parent and pass it down.
 */
export function DashboardFilterBar({
  search,
  setSearch,
  status,
  setStatus,
  options,
  placeholder = "Search by title…",
}: {
  search: string;
  setSearch: (v: string) => void;
  status?: string;
  setStatus?: (v: string) => void;
  options?: FilterOption[];
  placeholder?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/10 bg-black px-3 py-2 pr-8 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {options && options.length > 0 && status !== undefined && setStatus && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setStatus(o.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                status === o.value
                  ? "border-[#d6aa55]/50 bg-[#d6aa55]/15 text-[#e7c77f]"
                  : "border-white/10 bg-white/[0.03] text-gray-400 hover:border-[#d6aa55]/30 hover:text-[#e7c77f]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Case-insensitive title match helper shared by the dashboards. */
export function matchesSearch(value: string | null | undefined, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return String(value || "").toLowerCase().includes(q);
}

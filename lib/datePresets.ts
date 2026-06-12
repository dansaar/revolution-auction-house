export type DatePreset =
  | "all"
  | "week"
  | "month"
  | "last_month"
  | "3months"
  | "6months"
  | "year"
  | "last_year"
  | "custom";

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all",        label: "All Time" },
  { key: "week",       label: "This Week" },
  { key: "month",      label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "3months",    label: "3 Months" },
  { key: "6months",    label: "6 Months" },
  { key: "year",       label: "This Year" },
  { key: "last_year",  label: "Last Year" },
  { key: "custom",     label: "Custom" },
];

export function getDateRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
): { start: Date | null; end: Date | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(today.getTime() + 86400000 - 1);

  switch (preset) {
    case "week": {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      return { start: monday, end: endOfToday };
    }
    case "month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfToday };
    case "last_month": {
      const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(firstThisMonth.getTime() - 1),
      };
    }
    case "3months":
      return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: endOfToday };
    case "6months":
      return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end: endOfToday };
    case "year":
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfToday };
    case "last_year":
      return {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear(), 0, 0),
      };
    case "custom":
      return {
        start: customStart ? new Date(customStart) : null,
        end: customEnd ? new Date(new Date(customEnd).getTime() + 86400000 - 1) : null,
      };
    case "all":
    default:
      return { start: null, end: null };
  }
}

export function inRange(
  dateStr: string | null | undefined,
  start: Date | null,
  end: Date | null,
): boolean {
  if (!start && !end) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr).getTime();
  if (start && d < start.getTime()) return false;
  if (end && d > end.getTime()) return false;
  return true;
}

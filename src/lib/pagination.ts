/**
 * URL-driven list pagination shared by the customer, trainer and operations surfaces.
 *
 * Page numbers (rather than an opaque cursor) keep every list linkable, refresh-safe and usable
 * with browser back/forward. Rows are always ordered with a unique tie-breaker so a page is stable
 * within one database snapshot; `total` comes from a real count, not from the rows on screen.
 */

/** One page size per surface, chosen so a page fits without a long scroll. */
export const PAGE_SIZES = {
  customerBookings: 8,
  trainerSessions: 8,
  notifications: 20,
  operationsBookings: 20,
  operationsTrainers: 12,
  customerPackages: 6,
  pricingHistory: 10,
} as const;

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** The first value of a search param, tolerating repeated keys. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A positive integer page from a query string; anything invalid means page 1. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = firstParam(value)?.trim();
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : 1;
}

/** A known enum-like query value, falling back without throwing on junk. */
export function parseChoice<T extends string>(
  value: string | string[] | undefined,
  choices: readonly T[],
  fallback: T,
): T {
  const raw = firstParam(value);
  return raw && (choices as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type PageResult<T> = PageMeta & { rows: T[] };

/**
 * Bounds a requested page to the data. Callers fetch the page they asked for; if it is past the
 * end (a stale link, for example) `paginateRows` re-fetches the real last page instead of showing
 * a misleading empty list.
 */
export function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const safeSize = Number.isFinite(pageSize) ? Math.max(1, Math.trunc(pageSize)) : 1;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const from = safeTotal === 0 ? 0 : (safePage - 1) * safeSize + 1;
  const to = Math.min(safeTotal, safePage * safeSize);
  return {
    page: safePage,
    pageSize: safeSize,
    total: safeTotal,
    totalPages,
    from,
    to,
    hasPrevious: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

/** Runs a count and the requested page in parallel, correcting an out-of-range page once. */
export async function paginateRows<T>(args: {
  page: number;
  pageSize: number;
  count: () => Promise<number>;
  rows: (skip: number, take: number) => Promise<T[]>;
}): Promise<PageResult<T>> {
  const requested = Math.min(Math.max(1, Math.trunc(args.page) || 1), 100_000);
  const size = Math.max(1, Math.trunc(args.pageSize) || 1);
  const [total, firstRows] = await Promise.all([args.count(), args.rows((requested - 1) * size, size)]);
  const meta = pageMeta(total, requested, size);
  if (meta.page !== requested && total > 0) {
    const lastRows = await args.rows((meta.page - 1) * size, size);
    return { rows: lastRows, ...meta };
  }
  return { rows: firstRows, ...meta };
}

/** A page href that preserves every other query param and omits the implicit first page. */
export function pageHref(pathname: string, searchParams: SearchParamsRecord, page: number): string {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(searchParams)) {
    if (key === "page") continue;
    const value = firstParam(raw);
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export type PageWindowEntry = number | "gap";

/** First/last plus a sliding window around the current page, with gaps for the jumps. */
export function pageWindow(page: number, totalPages: number): PageWindowEntry[] {
  const total = Math.max(1, Math.trunc(totalPages) || 1);
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), total);
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const wanted = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 4) [2, 3, 4, 5].forEach((p) => wanted.add(p));
  if (current >= total - 3) [total - 4, total - 3, total - 2, total - 1].forEach((p) => wanted.add(p));

  const pages = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: PageWindowEntry[] = [];
  let previous = 0;
  for (const p of pages) {
    if (previous && p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}

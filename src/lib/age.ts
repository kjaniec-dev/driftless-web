const DAY_MS = 24 * 60 * 60 * 1000;

/** A quote older than this many days is flagged (a long weekend plus a day). */
export const STALE_AFTER_DAYS = 5;

/** Whole days from `YYYY-MM-DD` to `now`, never negative. */
export function ageInDays(date: string, now: Date): number {
  const then = Date.parse(`${date}T00:00:00Z`);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today - then) / DAY_MS));
}

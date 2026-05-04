/**
 * Inclusive calendar-day span between YYYY-MM-DD boundaries (UTC).
 * Used by extend-pass (share bonus) and pass validity helpers.
 */
export function inclusiveCalendarDaySpanUtc(validFrom: string, validUntil: string): number {
  const from = String(validFrom ?? '').slice(0, 10);
  const until = String(validUntil ?? '').slice(0, 10);
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${until}T00:00:00.000Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  const diffDays = Math.round((b - a) / 86400000);
  return Math.max(1, diffDays + 1);
}

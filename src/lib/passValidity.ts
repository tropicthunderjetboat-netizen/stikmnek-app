/**
 * Inclusive calendar-day count between two YYYY-MM-DD bounds (same logic as trip length in passRecommendation).
 */
export function inclusiveCalendarDaysBetween(validFrom: string | undefined, validUntil: string | undefined): number | null {
  const from = String(validFrom ?? '').slice(0, 10);
  const until = String(validUntil ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return null;
  const a = new Date(from + 'T12:00:00');
  const b = new Date(until + 'T12:00:00');
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return null;
  const daysBetween = Math.round(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, daysBetween + 1);
}

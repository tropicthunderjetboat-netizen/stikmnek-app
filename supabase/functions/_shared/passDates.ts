/** UTC calendar-date helpers for pass purchase — keep aligned with process-card-payment. */

export function utcStartOfCalendarDayMs(isoDateOnly: string): number {
  return new Date(isoDateOnly + 'T00:00:00.000Z').getTime();
}

export function utcTodayStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function utcAddCalendarDays(utcMidnightMs: number, days: number): number {
  const d = new Date(utcMidnightMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 0, 0, 0, 0);
}

export function validatePassStartDateIso(startDate: unknown): { ok: true; startDate: string } | { ok: false; error: string } {
  const s = String(startDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { ok: false, error: 'Missing or invalid startDate (YYYY-MM-DD)' };
  }
  const startMs = utcStartOfCalendarDayMs(s);
  if (Number.isNaN(startMs)) {
    return { ok: false, error: 'Missing or invalid startDate (YYYY-MM-DD)' };
  }
  const todayStartMs = utcTodayStartMs();
  if (startMs < todayStartMs) {
    return { ok: false, error: 'Purchase start date cannot be in the past.' };
  }
  const maxStartMs = utcAddCalendarDays(todayStartMs, 30);
  if (startMs > maxStartMs) {
    return { ok: false, error: 'Purchase start date cannot be more than 30 days in the future (UTC).' };
  }
  return { ok: true, startDate: s };
}

export function addCalendarDaysIso(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function endOfDayUtcIso(dateStr: string): string {
  return new Date(dateStr + 'T23:59:59.999Z').toISOString();
}

export function calendarDaysBetweenValidRange(validFrom: string, validUntil: string): number {
  const a = new Date(validFrom + 'T00:00:00.000Z');
  const b = new Date(validUntil + 'T00:00:00.000Z');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, diff);
}

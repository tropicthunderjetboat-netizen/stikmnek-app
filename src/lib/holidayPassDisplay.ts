import { inclusiveCalendarDaysBetween } from '@/lib/passValidity';

/** Add whole calendar days to a YYYY-MM-DD string (UTC noon safe). */
export function addCalendarDaysToDateOnly(dateStr: string, dayOffset: number): string {
  const raw = String(dateStr ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || dayOffset <= 0) return raw;
  const d = new Date(`${raw}T12:00:00`);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

export type HolidayPassMaskInput = {
  validFrom: string | null | undefined;
  validUntil: string | null | undefined;
  shareBonusApplied: boolean | null | undefined;
  /**
   * When set from checkout/receipt: true = holiday product, false = day pass (never mask as holiday).
   * When null/undefined (e.g. dashboard): holiday is inferred as multi-day span (truthSpanDays > 1).
   */
  isExtendedPass?: boolean | null;
};

/** Local calendar YYYY-MM-DD (tourist-facing; matches PassCard clock locale). */
function todayDateOnlyLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Option A (7+7): before post-purchase share, UI may show the paid first week only
 * (7 days, valid_until masked to valid_from + 6) even if DB already spans >7 days.
 *
 * Presentation / always-on demo passes (valid_until far in the future) never show a
 * historical first-week end date — VALID UNTIL uses a rolling current 7-day window.
 * Real free/paid Holiday Passes stay within normal lengths (≤14 days DB span).
 */
export function getHolidayPassMaskDisplay(input: HolidayPassMaskInput): {
  truthSpanDays: number;
  isHolidayPass: boolean;
  showFirstWeekOnly: boolean;
  displayUntilDateStr: string;
  displayDayCount: number;
} {
  const vf = String(input.validFrom ?? '').slice(0, 10);
  const vu = String(input.validUntil ?? '').slice(0, 10);
  const truthSpanDays = inclusiveCalendarDaysBetween(vf || undefined, vu || undefined) ?? 0;

  const isHolidayPass =
    input.isExtendedPass === true
      ? true
      : input.isExtendedPass === false
        ? false
        : truthSpanDays > 1;

  /** Demo / always-on window (e.g. seed valid_until 2099): show current week, not year-of-from. */
  const isLongSpanPresentation = isHolidayPass && truthSpanDays > 60;

  if (isLongSpanPresentation) {
    const today = todayDateOnlyLocal();
    const rollingWeekEnd = addCalendarDaysToDateOnly(today, 6);
    const displayUntilDateStr = vu && vu < rollingWeekEnd ? vu : rollingWeekEnd;
    return {
      truthSpanDays,
      isHolidayPass: true,
      showFirstWeekOnly: !Boolean(input.shareBonusApplied),
      displayUntilDateStr,
      displayDayCount: 7,
    };
  }

  const showFirstWeekOnly = isHolidayPass && !Boolean(input.shareBonusApplied);

  /** First calendar week end (inclusive 7 days from valid_from). Never show an end date past DB `valid_until`. */
  let displayUntilDateStr = vu;
  if (showFirstWeekOnly && vf) {
    const week1End = addCalendarDaysToDateOnly(vf, 6);
    if (!vu) displayUntilDateStr = week1End;
    else displayUntilDateStr = vu < week1End ? vu : week1End;
  }

  const displayDayCount = showFirstWeekOnly
    ? inclusiveCalendarDaysBetween(vf || undefined, displayUntilDateStr || undefined) ??
      Math.min(7, truthSpanDays > 0 ? truthSpanDays : 7)
    : truthSpanDays;

  return {
    truthSpanDays,
    isHolidayPass,
    showFirstWeekOnly,
    displayUntilDateStr,
    displayDayCount,
  };
}

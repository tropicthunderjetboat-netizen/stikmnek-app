/**
 * StikmNek dynamic pass pricing (single product model).
 * Legacy DB `pass_type` values (daily/weekly/…) remain for existing rows — see `passCatalog.ts`.
 *
 * Headcount (ages 6+): A$15 first guest + A$10 each for every additional guest (2–20).
 * Whole-trip add-on: +A$15.
 * — Keep in sync with `supabase/functions/_shared/pricingDynamic.ts`.
 */

import {
  passProductIdFromDb,
  type DbPassType,
  type PassProductId,
  PASS_PRODUCT_ORDER,
  toDbPassType,
} from '@/data/passCatalog';

export type { DbPassType, PassProductId };
export { passProductIdFromDb, toDbPassType, PASS_PRODUCT_ORDER };

export const BASE_PRICE_AUD = 15;
export const GUEST_FEE_AUD = 10;
/**
 * Retained for backwards compatibility. Every additional guest now costs a flat
 * A$10 (GUEST_FEE_AUD), so there is no longer a premium on the 7th guest.
 */
export const SEVENTH_GUEST_PREMIUM_AUD = 0;
/** Total AUD added for the 7th paying guest (now a flat A$10 like every other guest). */
export const SEVENTH_GUEST_HEAD_CHARGE_AUD = GUEST_FEE_AUD + SEVENTH_GUEST_PREMIUM_AUD;
export const EXTEND_FEE_AUD = 15;
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 20;

export function clampPartySize(n: number): number {
  if (!Number.isFinite(n)) return MIN_PARTY_SIZE;
  const x = Math.floor(n);
  return Math.min(MAX_PARTY_SIZE, Math.max(MIN_PARTY_SIZE, x));
}

/**
 * Pass price in AUD for the given paying party (ages 6+) and duration.
 * Does not include payment processing fees.
 */
export function calculatePassPrice(partySize: number, isExtended: boolean): number {
  const p = clampPartySize(partySize);
  let headcountAud = BASE_PRICE_AUD;
  if (p >= 2) {
    headcountAud += Math.min(p - 1, 5) * GUEST_FEE_AUD;
  }
  if (p >= 7) {
    headcountAud += SEVENTH_GUEST_HEAD_CHARGE_AUD + (p - 7) * GUEST_FEE_AUD;
  }
  return headcountAud + (isExtended ? EXTEND_FEE_AUD : 0);
}

/** AUD for guests 2 through 6 only (five slots at GUEST_FEE each when filled). */
export function extraGuestsFeeThroughSixthAud(partySize: number): number {
  const p = clampPartySize(partySize);
  if (p <= 1) return 0;
  return Math.min(p - 1, 5) * GUEST_FEE_AUD;
}

/** AUD for the 7th guest onward (a flat A$10 each, same as every other guest). */
export function extraGuestsFeeFromSeventhAud(partySize: number): number {
  const p = clampPartySize(partySize);
  if (p < 7) return 0;
  return SEVENTH_GUEST_HEAD_CHARGE_AUD + (p - 7) * GUEST_FEE_AUD;
}

/**
 * Inclusive calendar span: day pass = 1; holiday (+A$15) = 7;
 * if user already unlocked Share before purchase, holiday becomes 14 at checkout.
 */
export function passInclusiveCalendarDays(
  isExtended: boolean,
  grantSecondWeekFromPrepurchaseShare = false,
): number {
  if (!isExtended) return 1;
  if (grantSecondWeekFromPrepurchaseShare) return 14;
  return 7;
}

/** Offset from start date to `valid_until` (inclusive). */
export function validUntilDayOffset(
  isExtended: boolean,
  grantSecondWeekFromPrepurchaseShare = false,
): number {
  return passInclusiveCalendarDays(isExtended, grantSecondWeekFromPrepurchaseShare) - 1;
}

/** Calendar add in UTC so YYYY-MM-DD does not shift a day in positive-offset timezones. */
export function addCalendarDaysIso(startDateIso: string, dayOffset: number): string {
  const raw = String(startDateIso ?? '').slice(0, 10);
  const parts = raw.split('-').map((s) => Number(s, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return raw;
  const [y, m, d] = parts;
  const ms = Date.UTC(y, m - 1, d + dayOffset);
  return new Date(ms).toISOString().slice(0, 10);
}

export function getPassDisplayTitle(
  _raw: string | null | undefined,
  lang: 'en' | 'fr' | 'bi' = 'en',
): string {
  return lang === 'fr' ? 'Pass StikmNek' : lang === 'bi' ? 'StikmNek Pas' : 'StikmNek Pass';
}

export function getPassTitle(_passId: PassProductId, lang: 'en' | 'fr' | 'bi' = 'en'): string {
  return getPassDisplayTitle('dynamic', lang);
}

/** @deprecated Catalog removed — use {@link calculatePassPrice}. */
export function getPassPrice(_passId: PassProductId): number {
  return calculatePassPrice(MIN_PARTY_SIZE, false);
}

export function getBasePeople(_passId: PassProductId): number {
  return MAX_PARTY_SIZE;
}

export function getShareBonusTotalPeople(_passId: PassProductId): number {
  return MAX_PARTY_SIZE;
}

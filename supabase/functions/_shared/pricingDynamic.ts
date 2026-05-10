/**
 * Dynamic StikmNek pass pricing — keep in sync with `src/data/pricing.ts`.
 *
 * Headcount: A$15 + A$5×(guests 2–6) + A$10 for 7th + A$5×(guests 8–20) + (extended ? A$15 : 0)
 */

export const BASE_PRICE_AUD = 15;
export const GUEST_FEE_AUD = 5;
export const SEVENTH_GUEST_PREMIUM_AUD = 5;
export const SEVENTH_GUEST_HEAD_CHARGE_AUD = GUEST_FEE_AUD + SEVENTH_GUEST_PREMIUM_AUD;
export const EXTEND_FEE_AUD = 15;
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 20;

/** Inclusive calendar days: day pass = 1; holiday = 7; +share = 14. */
export const DYNAMIC_PASS_SPAN_DAYS = { standard: 1, extended: 7, extendedWithShare: 14 } as const;

export function clampPartySize(n: unknown): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return MIN_PARTY_SIZE;
  return Math.min(MAX_PARTY_SIZE, Math.max(MIN_PARTY_SIZE, x));
}

export function parseBooleanExtended(value: unknown): boolean {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  return false;
}

export function calculatePassPriceAud(partySize: number, isExtended: boolean): number {
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

/** Inclusive span for dynamic pass (Option A: 7+7). */
export function dynamicPassInclusiveDays(isExtended: boolean, grantSecondWeekFromPrepurchaseShare: boolean): number {
  if (!isExtended) return DYNAMIC_PASS_SPAN_DAYS.standard;
  if (grantSecondWeekFromPrepurchaseShare) return DYNAMIC_PASS_SPAN_DAYS.extendedWithShare;
  return DYNAMIC_PASS_SPAN_DAYS.extended;
}

/**
 * Days to add to valid_from to reach valid_until (inclusive range).
 * 1 calendar day → offset 0; 7 inclusive → 6; 14 inclusive → 13.
 */
export function validUntilOffsetDays(
  isExtended: boolean,
  grantSecondWeekFromPrepurchaseShare = false,
): number {
  return dynamicPassInclusiveDays(isExtended, grantSecondWeekFromPrepurchaseShare) - 1;
}

export function parsePartySizeAndExtended(body: Record<string, unknown>): {
  partySize: number;
  isExtended: boolean;
} | null {
  const rawParty = body.partySize ?? body.party_size;
  const n = Math.floor(Number(rawParty));
  if (!Number.isFinite(n) || n < MIN_PARTY_SIZE || n > MAX_PARTY_SIZE) return null;
  const extRaw = body.isExtended ?? body.is_extended;
  if (extRaw === undefined || extRaw === null || extRaw === '') {
    return { partySize: n, isExtended: false };
  }
  return { partySize: n, isExtended: parseBooleanExtended(extRaw) };
}

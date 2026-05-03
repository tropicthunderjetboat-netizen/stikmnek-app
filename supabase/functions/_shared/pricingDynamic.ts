/**
 * Dynamic StikmNek pass pricing — keep in sync with `src/data/pricing.ts`.
 * Price = BASE + (partySize - 1) * GUEST_FEE + (isExtended ? EXTEND : 0)
 */

export const BASE_PRICE_AUD = 15;
export const GUEST_FEE_AUD = 5;
export const EXTEND_FEE_AUD = 10;
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 6;

/** Inclusive calendar days: 24-hour pass = 1 day; extended = 14 days. */
export const DYNAMIC_PASS_SPAN_DAYS = { standard: 1, extended: 14 } as const;

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
  return BASE_PRICE_AUD + (p - 1) * GUEST_FEE_AUD + (isExtended ? EXTEND_FEE_AUD : 0);
}

/**
 * Days to add to valid_from to reach valid_until (inclusive range).
 * 1 calendar day → offset 0; 14 inclusive days → offset 13.
 */
export function validUntilOffsetDays(isExtended: boolean): number {
  const span = isExtended ? DYNAMIC_PASS_SPAN_DAYS.extended : DYNAMIC_PASS_SPAN_DAYS.standard;
  return span - 1;
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

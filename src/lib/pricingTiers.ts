/**
 * Pricing tiers for Tours / Activities (stored as JSONB on businesses & pending_businesses).
 * Matches suggested shape in supabase migration comments.
 */

export type PricingTierInput = {
  label: string;
  min_pax: number;
  /** null = open-ended (e.g. "3+ guests") */
  max_pax: number | null;
  original_price_vt: number;
  deal_price_vt: number;
};

export function emptyPricingTier(): PricingTierInput {
  return {
    label: '',
    min_pax: 1,
    max_pax: null,
    original_price_vt: 0,
    deal_price_vt: 0,
  };
}

/** Parse DB jsonb (array or null) into editable rows. */
export function pricingTiersFromDb(value: unknown): PricingTierInput[] {
  if (!value || !Array.isArray(value)) return [];
  const out: PricingTierInput[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const min = Math.max(0, Math.floor(Number(o.min_pax ?? 0) || 0));
    const maxRaw = o.max_pax;
    const max =
      maxRaw === null || maxRaw === undefined || maxRaw === ''
        ? null
        : Math.max(0, Math.floor(Number(maxRaw) || 0));
    out.push({
      label: String(o.label ?? '').trim(),
      min_pax: min,
      max_pax: max,
      original_price_vt: Math.max(0, Number(o.original_price_vt) || 0),
      deal_price_vt: Math.max(0, Number(o.deal_price_vt) || 0),
    });
  }
  return out;
}

function rowHasAnyInput(t: PricingTierInput): boolean {
  return (
    (t.label || '').trim().length > 0 ||
    (Number(t.original_price_vt) || 0) > 0 ||
    (Number(t.deal_price_vt) || 0) > 0 ||
    (Number(t.min_pax) || 0) > 0 ||
    (t.max_pax !== null && t.max_pax !== undefined && String(t.max_pax).trim() !== '')
  );
}

/**
 * Validates tier rows and returns JSON for Supabase, or null if no tiers.
 * Returns `{ error }` if a partially filled row is invalid.
 */
export function validatePricingTiersForSubmit(tiers: PricingTierInput[]): {
  data: unknown[] | null;
  error: string | null;
} {
  const active = tiers.filter(rowHasAnyInput);
  if (active.length === 0) return { data: null, error: null };

  const cleaned: {
    label: string;
    min_pax: number;
    max_pax: number | null;
    original_price_vt: number;
    deal_price_vt: number;
  }[] = [];

  for (const t of active) {
    const label = (t.label || '').trim();
    const min_pax = Math.max(0, Math.floor(Number(t.min_pax) || 0));
    const maxRaw = t.max_pax;
    const max_pax =
      maxRaw === null || maxRaw === undefined || (typeof maxRaw === 'number' && !Number.isFinite(maxRaw))
        ? null
        : Math.max(0, Math.floor(Number(maxRaw)));
    const original_price_vt = Math.max(0, Number(t.original_price_vt) || 0);
    const deal_price_vt = Math.max(0, Number(t.deal_price_vt) || 0);

    if (!label) {
      return { data: null, error: 'Each pricing tier needs a label.' };
    }
    if (original_price_vt <= 0 || deal_price_vt <= 0) {
      return { data: null, error: 'Each tier needs standard and StikmNek prices greater than 0.' };
    }
    if (deal_price_vt >= original_price_vt) {
      return { data: null, error: 'StikmNek price must be less than the standard price for each tier.' };
    }
    if (max_pax !== null && max_pax < min_pax) {
      return { data: null, error: 'Max pax must be greater than or equal to min pax for each tier.' };
    }

    cleaned.push({ label, min_pax, max_pax, original_price_vt, deal_price_vt });
  }

  return { data: cleaned, error: null };
}

export function categoryUsesTieredPricing(category: string): boolean {
  const c = (category || '').toLowerCase();
  return c === 'tours' || c === 'activities';
}

/**
 * Booking inquiry totals from tier rows × Adults / Children / Infants.
 * Single tier: all guests use that per-person price.
 * Multiple tiers: match row labels (adult / child / infant keywords) or fall back by index.
 */
export function computeTieredBookingTotals(
  tiers: PricingTierInput[],
  adults: number,
  children: number,
  infants: number,
): { totalStandard: number; totalDeal: number } {
  const a = Math.max(0, adults);
  const ch = Math.max(0, children);
  const inf = Math.max(0, infants);
  const usable = tiers.filter((t) => t.original_price_vt > 0 && t.deal_price_vt >= 0);
  if (usable.length === 0) return { totalStandard: 0, totalDeal: 0 };

  if (usable.length === 1) {
    const t = usable[0];
    const pax = a + ch + inf;
    return {
      totalStandard: pax * t.original_price_vt,
      totalDeal: pax * t.deal_price_vt,
    };
  }

  const low = (s: string) => s.toLowerCase();
  const pick = (pred: (label: string) => boolean, indexFallback: number): PricingTierInput => {
    const found = usable.find((t) => pred(low(t.label)));
    if (found) return found;
    return usable[Math.min(indexFallback, usable.length - 1)] ?? usable[0];
  };

  const tAdult = pick((l) => /adult|13\+|adulte|senior|grown/.test(l), 0);
  const tChild = pick((l) => /child|kid|enfant|pikinini|minor|2-12|5-12|6-12|7-12|school/.test(l), 1);
  const tInfant = pick((l) => /infant|baby|b[eé]b[eé]|0-4|0–4|toddler|smol/.test(l), 2);

  return {
    totalStandard:
      a * tAdult.original_price_vt + ch * tChild.original_price_vt + inf * tInfant.original_price_vt,
    totalDeal: a * tAdult.deal_price_vt + ch * tChild.deal_price_vt + inf * tInfant.deal_price_vt,
  };
}

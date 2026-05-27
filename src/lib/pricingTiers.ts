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

/** Default slot order for tours / activities — shown as “Adults” and “Children”, not “Tier 1”. */
export const TIER_PRESET_SLOTS = [
  {
    key: 'adult',
    labelEn: 'Adults',
    labelFr: 'Adultes',
    labelBi: 'Adult',
    min_pax: 1,
    max_pax: null as number | null,
  },
  {
    key: 'child',
    labelEn: 'Children',
    labelFr: 'Enfants',
    labelBi: 'Pikinini',
    min_pax: 0,
    max_pax: null as number | null,
  },
  {
    key: 'infant',
    labelEn: 'Infants',
    labelFr: 'Bébés',
    labelBi: 'Bebi',
    min_pax: 0,
    max_pax: null as number | null,
  },
] as const;

export function tierPresetLabel(slotIndex: number, language: 'en' | 'fr' | 'bi' = 'en'): string {
  const slot = TIER_PRESET_SLOTS[slotIndex];
  if (!slot) return language === 'fr' ? 'Autre' : language === 'bi' ? 'Narawan' : 'Other';
  if (language === 'fr') return slot.labelFr;
  if (language === 'bi') return slot.labelBi;
  return slot.labelEn;
}

export function emptyPricingTier(slotIndex = 0): PricingTierInput {
  const slot = TIER_PRESET_SLOTS[slotIndex] ?? TIER_PRESET_SLOTS[0];
  return {
    label: slot.labelEn,
    min_pax: slot.min_pax,
    max_pax: slot.max_pax,
    original_price_vt: 0,
    deal_price_vt: 0,
  };
}

/** New tiered listings start with Adult + Children rows (not empty / “Tier 1”). */
export function defaultPricingTiersForNewListing(): PricingTierInput[] {
  return [emptyPricingTier(0), emptyPricingTier(1)];
}

function normalizeTierLabelForSlot(label: string, slotIndex: number): string {
  const trimmed = (label || '').trim();
  if (!trimmed) return TIER_PRESET_SLOTS[slotIndex]?.labelEn ?? trimmed;
  if (/^tier\s*\d+$/i.test(trimmed)) {
    return TIER_PRESET_SLOTS[slotIndex]?.labelEn ?? trimmed;
  }
  return trimmed;
}

/** Load DB tiers and ensure Adult / Child slots exist for the editor UI. */
export function pricingTiersForEditor(value: unknown): PricingTierInput[] {
  const parsed = pricingTiersFromDb(value);
  if (parsed.length === 0) return defaultPricingTiersForNewListing();

  const out = parsed.map((row, index) => ({
    ...row,
    label: normalizeTierLabelForSlot(row.label, index),
    min_pax:
      index === 0
        ? Math.max(1, row.min_pax || 1)
        : index === 1
          ? Math.max(0, row.min_pax)
          : row.min_pax,
  }));

  while (out.length < 2) {
    out.push(emptyPricingTier(out.length));
  }
  return out;
}

/** Public listing: normalize “Tier 1” → Adults / Children without adding empty rows. */
export function pricingTiersForDisplay(value: unknown): PricingTierInput[] {
  return pricingTiersFromDb(value).map((row, index) => ({
    ...row,
    label: normalizeTierLabelForSlot(row.label, index),
  }));
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
 * When flat `deal_price` / `original_price` are zero but JSON tiers exist, cards still need a headline VT.
 * Uses the tier with the lowest StikmNek (deal) price as a “from” style representative pair.
 */
export function representativePerPersonPricesFromTiers(
  pricingTiers: unknown,
): { original_price_vt: number; deal_price_vt: number } | null {
  const rows = pricingTiersFromDb(pricingTiers).filter(
    (t) =>
      t.original_price_vt > 0 &&
      t.deal_price_vt >= 0 &&
      t.deal_price_vt < t.original_price_vt,
  );
  if (rows.length === 0) return null;
  let best = rows[0];
  for (const t of rows) {
    if (t.deal_price_vt < best.deal_price_vt) best = t;
  }
  return { original_price_vt: best.original_price_vt, deal_price_vt: best.deal_price_vt };
}

/** Deep equality for edit forms / change detection (null max_pax matches undefined). */
export function pricingTiersEqual(a: PricingTierInput[], b: PricingTierInput[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    const maxA = x.max_pax == null || x.max_pax === undefined ? null : Math.floor(Number(x.max_pax));
    const maxB = y.max_pax == null || y.max_pax === undefined ? null : Math.floor(Number(y.max_pax));
    if (
      (x.label || '').trim() !== (y.label || '').trim() ||
      Math.floor(Number(x.min_pax) || 0) !== Math.floor(Number(y.min_pax) || 0) ||
      maxA !== maxB ||
      Number(x.original_price_vt) !== Number(y.original_price_vt) ||
      Number(x.deal_price_vt) !== Number(y.deal_price_vt)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Booking inquiry totals from tier rows × Adults / Children / Infants.
 * Single tier: per-person rate applies to adults + children only (infants free unless a dedicated infant tier exists in multi-tier mode).
 * Multiple tiers: match adult / child labels; infants bill only when a row matches infant keywords (otherwise 0 VT).
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
    const payingPax = Math.max(1, a + ch);
    return {
      totalStandard: payingPax * t.original_price_vt,
      totalDeal: payingPax * t.deal_price_vt,
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
  const infantTier = usable.find((t) =>
    /infant|baby|b[eé]b[eé]|0-4|0–4|toddler|smol/.test(low(t.label)),
  );
  const tInfant: PricingTierInput = infantTier ?? {
    label: '',
    min_pax: 0,
    max_pax: null,
    original_price_vt: 0,
    deal_price_vt: 0,
  };

  return {
    totalStandard:
      a * tAdult.original_price_vt + ch * tChild.original_price_vt + inf * tInfant.original_price_vt,
    totalDeal: a * tAdult.deal_price_vt + ch * tChild.deal_price_vt + inf * tInfant.deal_price_vt,
  };
}

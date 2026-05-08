import { pricingTiersFromDb, computeTieredBookingTotals } from '@/lib/pricingTiers';

export type PartyCounts = { adults: number; children: number; infants: number };

/** Aligns with verify-redemption Edge Function defaults. */
export function partyCountsFromTouristProfile(row: {
  num_adults?: number | null;
  num_children?: number | null;
  num_infants?: number | null;
} | null | undefined): PartyCounts {
  if (!row) return { adults: 1, children: 0, infants: 0 };
  const aRaw = row.num_adults;
  const cRaw = row.num_children;
  const iRaw = row.num_infants;
  if (aRaw == null && cRaw == null && iRaw == null) {
    return { adults: 1, children: 0, infants: 0 };
  }
  return {
    adults: Math.max(0, Math.floor(Number(aRaw ?? 0))),
    children: Math.max(0, Math.floor(Number(cRaw ?? 0))),
    infants: Math.max(0, Math.floor(Number(iRaw ?? 0))),
  };
}

export function partyFromValidityApi(party?: {
  adults?: number;
  children?: number;
  infants?: number;
} | null): PartyCounts {
  if (!party || typeof party !== 'object') {
    return { adults: 1, children: 0, infants: 0 };
  }
  return {
    adults: Math.max(0, Math.floor(Number(party.adults ?? 0))),
    children: Math.max(0, Math.floor(Number(party.children ?? 0))),
    infants: Math.max(0, Math.floor(Number(party.infants ?? 0))),
  };
}

function hasUsableTieredPricing(pricingTiers: unknown): boolean {
  const tiers = pricingTiersFromDb(pricingTiers);
  return tiers.some(
    (t) =>
      t.original_price_vt > 0 &&
      t.deal_price_vt >= 0 &&
      t.deal_price_vt < t.original_price_vt,
  );
}

export type RedemptionSavingsBreakdown = {
  savedAmount: number;
  totalStandard: number;
  totalDeal: number;
  isTiered: boolean;
  /** Per-person savings for flat pricing (VT). */
  unitSavings: number;
  /** For flat: adults + children (infants excluded). For tiered: paying headcount (adults + children, min 1). */
  partyBillingCount: number;
  savingsLine: string;
};

export function computeRedemptionSavingsForListing(
  listing: {
    pricing_tiers?: unknown;
    original_price?: number | null;
    deal_price?: number | null;
  },
  party: PartyCounts,
): RedemptionSavingsBreakdown {
  if (hasUsableTieredPricing(listing.pricing_tiers)) {
    const tiers = pricingTiersFromDb(listing.pricing_tiers);
    const { totalStandard, totalDeal } = computeTieredBookingTotals(
      tiers,
      party.adults,
      party.children,
      party.infants,
    );
    const ts = Math.round(totalStandard);
    const td = Math.round(totalDeal);
    const saved = Math.max(0, ts - td);
    const payingForDisplay = Math.max(1, party.adults + party.children);
    const savingsLine =
      `Party: ${party.adults} adult(s)` +
      (party.children ? `, ${party.children} child(ren)` : '') +
      (party.infants ? `, ${party.infants} infant(s)` : '') +
      ` — ${ts.toLocaleString()} VT standard → ${td.toLocaleString()} VT StikmNek (${saved.toLocaleString()} VT saved)`;
    return {
      savedAmount: saved,
      totalStandard: ts,
      totalDeal: td,
      isTiered: true,
      unitSavings: 0,
      partyBillingCount: payingForDisplay,
      savingsLine,
    };
  }

  const o = Number(listing.original_price);
  // If a listing has no discount configured yet, `deal_price` is often null/undefined.
  // Treat that as "no discount" (deal == original) rather than "free".
  const d = listing.deal_price == null ? o : Number(listing.deal_price);
  const partySize = Math.max(1, party.adults + party.children);
  if (!Number.isFinite(o) || !Number.isFinite(d) || o <= d) {
    return {
      savedAmount: 0,
      totalStandard: Number.isFinite(o) ? Math.round(o * partySize) : 0,
      totalDeal: Number.isFinite(d) ? Math.round(d * partySize) : 0,
      isTiered: false,
      unitSavings: 0,
      partyBillingCount: partySize,
      savingsLine: '—',
    };
  }
  const unit = Math.round(o - d);
  const saved = Math.max(0, unit * partySize);
  const savingsLine = `${unit.toLocaleString()} VT × ${partySize} ${partySize === 1 ? 'person' : 'people'} = ${saved.toLocaleString()} VT total saved`;
  return {
    savedAmount: saved,
    totalStandard: Math.round(o * partySize),
    totalDeal: Math.round(d * partySize),
    isTiered: false,
    unitSavings: unit,
    partyBillingCount: partySize,
    savingsLine,
  };
}

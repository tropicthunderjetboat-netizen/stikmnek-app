import { categoryUsesPerUnitPricing, unitLabelForCategory } from '@/lib/categoryPricing';
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

/** Ages 6+ on the tourist profile (adults + children). */
export function profileSixPlusCount(profile: PartyCounts): number {
  return Math.max(0, profile.adults + profile.children);
}

/**
 * People ages 6+ allowed on a redemption visit — the pass capacity paid for at checkout (`max_people`).
 * Profile party size is used for adult/child/infant splits only, not to lower the pass cap.
 */
export function effectiveRedeemCapSixPlus(opts: {
  passMaxPeople?: number | null;
  profile?: PartyCounts;
  passType?: string;
}): number {
  const passCap =
    typeof opts.passMaxPeople === 'number' && opts.passMaxPeople > 0
      ? Math.floor(opts.passMaxPeople)
      : null;
  if (passCap != null) return passCap;
  const profile = opts.profile ?? { adults: 1, children: 0, infants: 0 };
  const sixPlus = profileSixPlusCount(profile);
  const passType = String(opts.passType ?? 'dynamic').toLowerCase();
  return passType === 'dynamic' ? Math.max(1, sixPlus) : Math.max(1, sixPlus + profile.infants);
}

export function hasUsableTieredPricing(pricingTiers: unknown): boolean {
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
  /** Per-person or per-item savings for flat pricing (VT). */
  unitSavings: number;
  /** For flat per-person: adults + children. For per-unit: item quantity. For tiered: paying headcount. */
  partyBillingCount: number;
  savingsLine: string;
  perUnit?: boolean;
  itemQuantity?: number;
};

export function computeRedemptionSavingsForListing(
  listing: {
    pricing_tiers?: unknown;
    original_price?: number | null;
    deal_price?: number | null;
    category?: string | null;
  },
  party: PartyCounts,
  options?: { itemQuantity?: number },
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
  const d = listing.deal_price == null ? o : Number(listing.deal_price);
  const perUnit = categoryUsesPerUnitPricing(String(listing.category ?? ''));
  const billCount = perUnit
    ? Math.max(1, Math.floor(Number(options?.itemQuantity) || 1))
    : Math.max(1, party.adults + party.children);

  if (!Number.isFinite(o) || !Number.isFinite(d) || o <= d) {
    return {
      savedAmount: 0,
      totalStandard: Number.isFinite(o) ? Math.round(o * billCount) : 0,
      totalDeal: Number.isFinite(d) ? Math.round(d * billCount) : 0,
      isTiered: false,
      unitSavings: 0,
      partyBillingCount: billCount,
      savingsLine: '—',
      perUnit,
      itemQuantity: perUnit ? billCount : undefined,
    };
  }
  const unit = Math.round(o - d);
  const saved = Math.max(0, unit * billCount);
  const unitLabels = unitLabelForCategory(String(listing.category ?? ''));
  const unitWord = billCount === 1 ? unitLabels.singular : unitLabels.plural;
  const savingsLine = perUnit
    ? `${unit.toLocaleString()} VT × ${billCount} ${unitWord} = ${saved.toLocaleString()} VT total saved`
    : `${unit.toLocaleString()} VT × ${billCount} ${billCount === 1 ? 'person' : 'people'} = ${saved.toLocaleString()} VT total saved`;
  return {
    savedAmount: saved,
    totalStandard: Math.round(o * billCount),
    totalDeal: Math.round(d * billCount),
    isTiered: false,
    unitSavings: unit,
    partyBillingCount: billCount,
    savingsLine,
    perUnit,
    itemQuantity: perUnit ? billCount : undefined,
  };
}

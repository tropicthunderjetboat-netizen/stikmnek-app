import type { Business } from '@/data/businesses';
import {
  effectiveListingDealPrice,
  effectiveListingOriginalPrice,
  listingHasActiveDiscount,
} from '@/data/businesses';
import { clampPartySize } from '@/data/pricing';
import { categoryUsesPerUnitPricing } from '@/lib/categoryPricing';
import { formatVT } from '@/lib/utils';
import { approximateVatuFromAud } from '@/lib/passValueDisplay';

export type TripSavingsEstimate = {
  /** Approximate total VT saved if the group used pass prices on every saved place with a deal. */
  totalVt: number;
  /** Saved places that contributed a positive discount. */
  placesWithSavings: number;
  /** Ages 6+ used for the estimate. */
  partySize: number;
};

/**
 * Rough per-listing savings for trip planning — not a booking quote.
 * Ages 6+ × headline unit discount for per-person / tour-style listings;
 * one booking unit for shopping / transport / accommodation.
 * Venue age bands (13+ vs 18+) are ignored on purpose — estimate only.
 */
export function estimateListingTripSavingsVt(
  business: Business,
  partySizeSixPlus: number,
): number {
  if (!listingHasActiveDiscount(business)) return 0;
  const orig = effectiveListingOriginalPrice(business);
  const deal = effectiveListingDealPrice(business);
  if (!(orig > 0 && deal > 0 && deal < orig)) return 0;
  const unit = orig - deal;
  const party = clampPartySize(partySizeSixPlus);
  if (categoryUsesPerUnitPricing(String(business.category || ''))) {
    return Math.round(unit);
  }
  return Math.round(unit * party);
}

export function estimateTripSavings(
  listings: Business[],
  partySizeSixPlus: number,
): TripSavingsEstimate {
  const partySize = clampPartySize(partySizeSixPlus || 1);
  let totalVt = 0;
  let placesWithSavings = 0;
  for (const b of listings) {
    const saved = estimateListingTripSavingsVt(b, partySize);
    if (saved > 0) {
      totalVt += saved;
      placesWithSavings += 1;
    }
  }
  return { totalVt, placesWithSavings, partySize };
}

/** Short tourist-facing line; empty when nothing to show. */
export function tripSavingsSummaryLine(
  estimate: TripSavingsEstimate,
  language: 'en' | 'fr' = 'en',
): string {
  if (estimate.totalVt <= 0 || estimate.placesWithSavings <= 0) return '';
  const amount = formatVT(estimate.totalVt);
  const n = estimate.placesWithSavings;
  const p = estimate.partySize;
  if (language === 'fr') {
    return `Environ ${amount} d’économies pour ${p} pers. (6+) sur ${n} lieu${n > 1 ? 'x' : ''}`;
  }
  return `About ${amount} saved for ${p} ${p === 1 ? 'person' : 'people'} (ages 6+) across ${n} place${n === 1 ? '' : 's'}`;
}

/** Optional second line comparing rough pass cost in VT. */
export function tripSavingsVsPassLine(
  savingsVt: number,
  passPriceAud: number,
  language: 'en' | 'fr' = 'en',
): string {
  if (savingsVt <= 0 || !(passPriceAud > 0)) return '';
  const passVt = approximateVatuFromAud(passPriceAud);
  if (passVt <= 0) return '';
  if (savingsVt >= passVt) {
    if (language === 'fr') {
      return `Ça couvre déjà un pass (~${formatVT(passVt)} à titre indicatif)`;
    }
    return `That already covers a pass (~${formatVT(passVt)} rough VT)`;
  }
  const gap = passVt - savingsVt;
  if (language === 'fr') {
    return `Plus que ~${formatVT(gap)} et le pass est rentabilisé (estimatif)`;
  }
  return `About ${formatVT(gap)} more and the pass pays for itself (estimate)`;
}

/**
 * Derive pass cart hints from tourist registration fields (demographics + travel dates).
 * Keeps pricing aligned with `calculatePassPrice` / Edge `pricingDynamic.ts`.
 */
import { inclusiveCalendarDaysBetween } from '@/lib/passValidity';
import { calculatePassPrice, clampPartySize } from '@/data/pricing';

/** Subset of `user_profiles` used for pass defaults (avoids importing AppContext here). */
export type PassRegistrationHints = {
  num_adults?: number | null;
  num_children?: number | null;
  expected_arrival_date?: string | null;
  expected_departure_date?: string | null;
};

/**
 * True when arrival/departure span at least two calendar days (multi-day stay).
 * Used only when the user has not explicitly chosen short vs extended.
 */
export function inferIsExtendedPassFromTripDates(profile: PassRegistrationHints | null): boolean {
  if (!profile) return false;
  const a = String(profile.expected_arrival_date ?? '').slice(0, 10);
  const d = String(profile.expected_departure_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const inclusiveDays = inclusiveCalendarDaysBetween(a, d);
  return inclusiveDays != null && inclusiveDays >= 2;
}

export interface OptimalPassFromRegistration {
  partySize: number;
  isExtended: boolean;
  totalPriceAud: number;
}

/**
 * “Pure” registration-based suggestion: adults + children (infants excluded) and
 * extended pass when the trip spans multiple calendar days. Ignores saved
 * `party_size` / `preferred_pass_duration` — use for analytics or copy; checkout
 * defaults use `defaultPassCartFromProfile` in AppContext.
 */
export function calculateOptimalPassFromRegistration(
  profile: PassRegistrationHints | null,
): OptimalPassFromRegistration {
  const adults = profile?.num_adults ?? 0;
  const children = profile?.num_children ?? 0;
  const combined = adults + children;
  const partySize = clampPartySize(combined > 0 ? combined : 1);
  const isExtended = inferIsExtendedPassFromTripDates(profile);
  return {
    partySize,
    isExtended,
    totalPriceAud: calculatePassPrice(partySize, isExtended),
  };
}

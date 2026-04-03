/**
 * Trip guidance + party-size recommendation helpers for pass purchase UI.
 */
import type { UserProfile } from '@/contexts/AppContext';
import type { PassProductConfig, PassProductId } from '@/data/pricing';
import { inclusiveCalendarDaysBetween } from '@/lib/passValidity';

export interface PassTripGuidance {
  /** Inclusive calendar days between arrival and departure (1 if dates missing). */
  tripDays: number;
  /** Adults + children only — infants excluded (pass capacity). */
  partyCountExInfants: number;
  /** True when no pass in the catalog can cover this trip even with Share Bonus. */
  showSupportHint: boolean;
}

function clampInt(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.floor(x));
}

type CapacityMode = 'base' | 'share';

function peopleAfterShare(p: PassProductConfig): number {
  return p.shareBonus?.totalPeopleAfterShare ?? (p.basePeople + (p.shareBonus?.extraPeople || 0));
}

function daysAfterShare(p: PassProductConfig): number {
  return p.shareBonus?.totalDaysAfterShare ?? (p.baseDays + (p.shareBonus?.extraDays || 0));
}

function capsForMode(pass: PassProductConfig, mode: CapacityMode): { people: number; days: number } {
  if (mode === 'base') {
    return { people: Math.max(1, pass.basePeople), days: Math.max(1, pass.baseDays) };
  }
  return {
    people: Math.max(1, peopleAfterShare(pass)),
    days: Math.max(1, daysAfterShare(pass)),
  };
}

function coversTrip(
  pass: PassProductConfig,
  mode: CapacityMode,
  totalPeople: number,
  totalDays: number,
): boolean {
  const { people, days } = capsForMode(pass, mode);
  return totalPeople <= people && totalDays <= days;
}

/**
 * Feasibility for guidance / support hint uses **adults + children only** (infants excluded).
 */
export function getPassTripGuidance(
  userProfile: UserProfile,
  passProducts: PassProductConfig[],
  _opts?: { language?: 'en' | 'fr' | 'bi' },
): PassTripGuidance | null {
  if (!userProfile || !passProducts || passProducts.length === 0) return null;

  const adults = clampInt(userProfile.num_adults, 1);
  const children = clampInt(userProfile.num_children, 0);
  const partyCountExInfants = Math.max(1, adults + children);

  const arrival = String((userProfile as { expected_arrival_date?: string }).expected_arrival_date ?? '').slice(0, 10);
  const departure = String((userProfile as { expected_departure_date?: string }).expected_departure_date ?? '').slice(0, 10);
  const tripDays =
    arrival && departure ? inclusiveCalendarDaysBetween(arrival, departure) ?? 1 : 1;

  const canCoverWithShare = passProducts.some((p) =>
    coversTrip(p, 'share', partyCountExInfants, tripDays),
  );

  return {
    tripDays,
    partyCountExInfants,
    showSupportHint: !canCoverWithShare,
  };
}

// ─── Party-size “Recommended” badge: adults + children only; infants excluded ───

function clampPartyCount(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.floor(x));
}

/**
 * Recommended pass tier from headcount (**adults + children**). Infants are ignored.
 */
export function recommendedPassForPartySize(adults: unknown, children: unknown): PassProductId {
  const a = clampPartyCount(adults);
  const c = clampPartyCount(children);
  const n = Math.max(1, a + c);
  if (n <= 4) return 'family_explorer';
  if (n <= 6) return 'extended_group_adventure';
  if (n <= 8) return 'ultimate_crew_experience';
  return 'mega_group_experience';
}

/**
 * Same rules as {@link recommendedPassForPartySize}, reading only profile fields (no infants).
 */
export function recommendedPassFromUserProfile(
  profile: Pick<UserProfile, 'num_adults' | 'num_children'> | null | undefined,
): PassProductId | null {
  if (!profile) return null;
  return recommendedPassForPartySize(profile.num_adults, profile.num_children);
}

/**
 * Short note when trip length exceeds this pass’s base discount days.
 * No calendar dates — numbers only for quick scanning.
 */
export function buildPassStayMismatchMessage(
  arrival: string,
  departure: string,
  passBaseDays: number,
  passFullDays: number,
  shareExtraDays: number,
  language: 'en' | 'fr' | 'bi',
): string | null {
  const a = String(arrival).slice(0, 10);
  const dep = String(departure).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(dep)) return null;

  const tripDays = inclusiveCalendarDaysBetween(a, dep);
  if (tripDays == null || tripDays <= passBaseDays) return null;

  const baseDays = Math.max(1, passBaseDays);
  const fullDays = Math.max(baseDays, passFullDays);
  const exceedsShareWindow = tripDays > fullDays;

  if (language === 'fr') {
    let s = `Séjour : ${tripDays} j · Pass : ${baseDays} j de réduction avant bonus.`;
    if (shareExtraDays > 0) {
      s += ` Partage après achat → jusqu’à ${fullDays} j.`;
    } else {
      s += ` Bonus = surtout plus de personnes.`;
    }
    if (exceedsShareWindow) s += ` Séjour plus long que ce pass.`;
    return s;
  }

  if (language === 'bi') {
    let s = `Trip: ${tripDays} dei · Pas: ${baseDays} dei diskount bifo bonus.`;
    if (shareExtraDays > 0) {
      s += ` Serem afta bai → kasem ${fullDays} dei.`;
    } else {
      s += ` Bonus = moa pipol.`;
    }
    if (exceedsShareWindow) s += ` Trip i lonmoa pas.`;
    return s;
  }

  let s = `Trip: ${tripDays} days · Pass: ${baseDays} discount day${baseDays > 1 ? 's' : ''} before Share Bonus.`;
  if (shareExtraDays > 0) {
    s += ` Share after purchase → up to ${fullDays} day${fullDays > 1 ? 's' : ''}.`;
  } else {
    s += ` Share Bonus adds people here, not days.`;
  }
  if (exceedsShareWindow) s += ` Stay is longer than this pass covers.`;
  return s;
}

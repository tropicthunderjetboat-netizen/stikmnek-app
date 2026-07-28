/**
 * Anonymous trip planner state (localStorage) until the tourist buys a pass.
 * No login required to browse / heart places.
 */

import { clampPartySize } from '@/data/pricing';

export const TRIP_STORAGE_KEY = 'stikmnek_trip_v1';
export const PENDING_CHECKOUT_KEY = 'stikmnek_pending_checkout';
/** Standalone party-size key used by feed explainer (Who’s coming?). */
export const PARTY_SIZE_KEY = 'partySize';

export type TripLength = 'day' | '2-4' | '5-7';

export type TripState = {
  /** Offering (or business) ids saved to the trip */
  savedPlaceIds: string[];
  tripLength: TripLength | null;
  /** Travelers ages 6+ */
  paidPeople: number;
  vibeTripLengthDone: boolean;
  vibePartyDone: boolean;
  softNudgeDismissed: boolean;
};

export type PendingCheckout = {
  partySize: number;
  isExtended: boolean;
};

const DEFAULT_TRIP: TripState = {
  savedPlaceIds: [],
  tripLength: null,
  paidPeople: 1,
  vibeTripLengthDone: false,
  vibePartyDone: false,
  softNudgeDismissed: false,
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readPartySizeFromStorage(): number | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PARTY_SIZE_KEY);
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return null;
    return clampPartySize(n);
  } catch {
    return null;
  }
}

export function writePartySizeToStorage(n: number): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PARTY_SIZE_KEY, String(clampPartySize(n)));
  } catch {
    /* ignore */
  }
}

export function loadTripState(): TripState {
  if (!canUseStorage()) return { ...DEFAULT_TRIP };
  try {
    const raw = window.localStorage.getItem(TRIP_STORAGE_KEY);
    if (!raw) {
      const fromParty = readPartySizeFromStorage();
      return fromParty != null ? { ...DEFAULT_TRIP, paidPeople: fromParty } : { ...DEFAULT_TRIP };
    }
    const parsed = JSON.parse(raw) as Partial<TripState>;
    const ids = Array.isArray(parsed.savedPlaceIds)
      ? parsed.savedPlaceIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const tripLength =
      parsed.tripLength === 'day' || parsed.tripLength === '2-4' || parsed.tripLength === '5-7'
        ? parsed.tripLength
        : null;
    const fromParty = readPartySizeFromStorage();
    const paidPeople = clampPartySize(
      fromParty ?? (Number(parsed.paidPeople) || 1),
    );
    return {
      savedPlaceIds: ids,
      tripLength,
      paidPeople,
      vibeTripLengthDone: Boolean(parsed.vibeTripLengthDone),
      vibePartyDone: Boolean(parsed.vibePartyDone) || fromParty != null,
      softNudgeDismissed: Boolean(parsed.softNudgeDismissed),
    };
  } catch {
    return { ...DEFAULT_TRIP };
  }
}

export function saveTripState(next: TripState): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(next));
    writePartySizeToStorage(next.paidPeople);
    window.dispatchEvent(new Event('stikmnek-trip-updated'));
  } catch {
    /* quota / private mode */
  }
}

export function tripLengthToIsExtended(tripLength: TripLength | null): boolean {
  // Day trip → 1-day pass; multi-day → 7-day (+A$15) so checkout matches the plan.
  return tripLength === '2-4' || tripLength === '5-7';
}

export function checkoutFromTrip(trip: TripState): PendingCheckout {
  return {
    partySize: clampPartySize(trip.paidPeople || 1),
    isExtended: tripLengthToIsExtended(trip.tripLength),
  };
}

export function savePendingCheckout(pending: PendingCheckout): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({
        partySize: clampPartySize(pending.partySize),
        isExtended: Boolean(pending.isExtended),
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Read pending checkout without clearing (for signup copy). */
export function peekPendingCheckout(): PendingCheckout | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingCheckout>;
    return {
      partySize: clampPartySize(Number(parsed.partySize) || 1),
      isExtended: Boolean(parsed.isExtended),
    };
  } catch {
    return null;
  }
}

export function consumePendingCheckout(): PendingCheckout | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingCheckout>;
    return {
      partySize: clampPartySize(Number(parsed.partySize) || 1),
      isExtended: Boolean(parsed.isExtended),
    };
  } catch {
    return null;
  }
}

export const TAP_HINT_KEY = 'stikmnek_swipe_tap_hint_seen';

export function hasSeenTapHint(): boolean {
  if (!canUseStorage()) return true;
  try {
    return window.localStorage.getItem(TAP_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTapHintSeen(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(TAP_HINT_KEY, '1');
  } catch {
    /* ignore */
  }
}

import type { Business } from '@/data/businesses';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';

/** Client-side favorite token (matches loadFavorites / toggleFavorite). */
export function favoriteKeyForProfile(profileId: string): string {
  return `biz:${profileId}`;
}

export function favoriteKeyForOffering(offeringId: string): string {
  return `off:${offeringId}`;
}

export function favoriteKeysFromDbRows(
  rows: { business_id: string; offering_id?: string | null }[],
): string[] {
  return rows.map((r) =>
    r.offering_id ? favoriteKeyForOffering(String(r.offering_id)) : favoriteKeyForProfile(String(r.business_id)),
  );
}

/** True if this listing row is favorited (exact offering, or legacy whole-venue for same profile). */
export function isListingFavorited(favoriteKeys: string[], business: Business): boolean {
  const pid = profileBusinessIdFor(business);
  const offKey = business.id !== pid ? favoriteKeyForOffering(business.id) : null;
  if (offKey && favoriteKeys.includes(offKey)) return true;
  if (favoriteKeys.includes(favoriteKeyForProfile(pid))) return true;
  return false;
}

/**
 * Rows to show on tourist favorites screens: one card per offering favorite, one per legacy biz favorite.
 */
export function businessesMatchingFavoriteKeys(all: Business[], favoriteKeys: string[]): Business[] {
  const out: Business[] = [];
  const seenOffering = new Set<string>();
  const seenBizFallback = new Set<string>();

  for (const key of favoriteKeys) {
    if (key.startsWith('off:')) {
      const oid = key.slice(4);
      const b = all.find((x) => x.id === oid);
      if (b && !seenOffering.has(b.id)) {
        out.push(b);
        seenOffering.add(b.id);
      }
    } else if (key.startsWith('biz:')) {
      const pid = key.slice(4);
      if (seenBizFallback.has(pid)) continue;
      const first = all.find((x) => profileBusinessIdFor(x) === pid);
      if (first) {
        out.push(first);
        seenBizFallback.add(pid);
      }
    }
  }
  return out;
}

/** Active offerings for a profile, oldest first (same order as SQL window backfill). */
export type OfferingCreatedRow = { id: string; created_at: string };

/** When `offering_id` was not stamped on approve, pending uploads often have created_at before the live row. */
export const RECENT_LISTING_GALLERY_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * If the strict time partition yields no rows for the newest deal, merge approved untagged photos
 * created after the second-newest offering was created (typical window for a new submission on an
 * existing profile). Guarded by `RECENT_LISTING_GALLERY_FALLBACK_MS` on the newest offering only.
 */
export function supplementUntaggedPhotosForRecentNewestOffering<T extends { created_at: string }>(
  untaggedApprovedPhotos: T[],
  offeringId: string,
  activeOfferingsOldestFirst: OfferingCreatedRow[],
  nowMs: number = Date.now(),
): T[] {
  const rows = activeOfferingsOldestFirst;
  if (rows.length < 2 || untaggedApprovedPhotos.length === 0) return [];
  const newest = rows[rows.length - 1];
  if (String(newest.id) !== String(offeringId)) return [];
  const tNew = Date.parse(String(newest.created_at || ''));
  if (Number.isNaN(tNew) || nowMs - tNew > RECENT_LISTING_GALLERY_FALLBACK_MS) return [];
  const tPrev = Date.parse(String(rows[rows.length - 2].created_at || ''));
  if (Number.isNaN(tPrev)) return [];
  return untaggedApprovedPhotos.filter((p) => {
    const t = Date.parse(String(p.created_at || ''));
    return !Number.isNaN(t) && t >= tPrev;
  });
}

/**
 * When `business_photos.offering_id` is null (legacy), assign each photo to at most one
 * active offering by partitioning on `photo.created_at` vs offerings ordered by `created_at`.
 * First offering gets photos with created_at strictly before the second offering's created_at;
 * middle offerings get [own created_at, next's created_at); last gets >= own created_at.
 */
export function legacyUntaggedPhotoBelongsToOffering(
  photoCreatedAt: string,
  offeringId: string,
  activeOfferingsOldestFirst: OfferingCreatedRow[],
): boolean {
  const rows = activeOfferingsOldestFirst;
  if (!rows.length) return false;
  const idx = rows.findIndex((r) => String(r.id) === String(offeringId));
  if (idx < 0) return false;
  const t = Date.parse(photoCreatedAt);
  if (Number.isNaN(t)) return false;

  if (rows.length === 1) return true;

  if (idx === 0) {
    const tNext = Date.parse(rows[1].created_at);
    if (Number.isNaN(tNext)) return false;
    return t < tNext;
  }

  if (idx === rows.length - 1) {
    const tSelf = Date.parse(rows[idx].created_at);
    if (Number.isNaN(tSelf)) return false;
    return t >= tSelf;
  }

  const tSelf = Date.parse(rows[idx].created_at);
  const tNext = Date.parse(rows[idx + 1].created_at);
  if (Number.isNaN(tSelf) || Number.isNaN(tNext)) return false;
  return t >= tSelf && t < tNext;
}

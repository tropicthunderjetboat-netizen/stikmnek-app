/** Active offerings for a profile, oldest first (same order as SQL window backfill). */
export type OfferingCreatedRow = { id: string; created_at: string };

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

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBusinessImageUrl, getPhotoDisplayUrl } from '@/lib/utils';
import {
  legacyUntaggedPhotoBelongsToOffering,
  supplementUntaggedPhotosForRecentNewestOffering,
} from '@/lib/offeringPhotoPartition';
import type { OfferingCreatedRow } from '@/lib/offeringPhotoPartition';

type PhotoRow = {
  id: string;
  url: string;
  file_path: string;
  is_main: boolean;
  created_at: string;
  status?: string;
};

/**
 * Approved gallery rows for one offering (same legacy rules as `PhotoGallery`, then capped at 5 for the editor).
 */
export async function fetchApprovedPhotosForOffering(
  client: SupabaseClient,
  profileBusinessId: string,
  offeringId: string,
  supabaseUrl: string,
): Promise<PhotoRow[]> {
  const oid = String(offeringId || '').trim();
  const bid = String(profileBusinessId || '').trim();
  if (!oid || !bid) return [];

  let { data, error } = await client
    .from('business_photos')
    .select('id, url, file_path, is_main, created_at, status')
    .eq('business_id', bid)
    .eq('status', 'approved')
    .eq('offering_id', oid)
    .order('is_main', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[fetchApprovedPhotosForOffering] tagged:', error);
    return [];
  }

  let rows = (data || []) as PhotoRow[];

  if (rows.length === 0) {
    const { count, error: cntErr } = await client
      .from('business_offerings')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', bid)
      .eq('active', true);
    const offerCount = !cntErr && typeof count === 'number' ? count : 99;

    const legacy = await client
      .from('business_photos')
      .select('id, url, file_path, is_main, created_at, status')
      .eq('business_id', bid)
      .eq('status', 'approved')
      .is('offering_id', null)
      .order('is_main', { ascending: false })
      .order('created_at', { ascending: true });

    if (legacy.error || !legacy.data?.length) return [];

    const list = legacy.data as PhotoRow[];
    // `offerCount === 0` must NOT fall through as "<= 1" — that pooled every legacy photo onto one deal.
    if (offerCount === 1) {
      rows = list;
    } else if (offerCount > 1) {
      const { data: ord, error: oErr } = await client
        .from('business_offerings')
        .select('id, created_at')
        .eq('business_id', bid)
        .eq('active', true)
        .order('created_at', { ascending: true });
      if (!oErr && ord?.length) {
        const ordered = ord as OfferingCreatedRow[];
        rows = list.filter((p) =>
          legacyUntaggedPhotoBelongsToOffering(p.created_at, oid, ordered),
        );
        if (rows.length === 0) {
          const extra = supplementUntaggedPhotosForRecentNewestOffering(list, oid, ordered);
          if (extra.length > 0) rows = extra;
        }
      }
    } else {
      rows = [];
    }
  }

  const approved = rows.filter((p) => String(p.status || '').toLowerCase() === 'approved');
  /** Listing editor enforces the same cap as `PhotoUploader` (public gallery may show more). */
  return approved.slice(0, 5);
}

/**
 * Hero / card cover URL for one listing: approved gallery photos first (same rules as
 * `PhotoGallery`), then the offering `image` field. Avoids stale or profile-fallback URLs
 * blocking real gallery photos.
 */
export async function resolveListingCoverImageUrl(
  client: SupabaseClient,
  profileBusinessId: string,
  offeringId: string,
  listingImageField: string | undefined | null,
  supabaseUrl: string,
): Promise<string> {
  const photos = await fetchApprovedPhotosForOffering(client, profileBusinessId, offeringId, supabaseUrl);
  for (const p of photos) {
    const url = getPhotoDisplayUrl(p, supabaseUrl) || String(p.url || '').trim();
    if (url) return url;
  }
  const fromListing =
    getBusinessImageUrl(listingImageField, supabaseUrl) || String(listingImageField || '').trim();
  return fromListing;
}

/** Map DB rows to `PhotoUploader` / submit payload shape. */
export function photoRowsToUploadedPhotos(
  rows: PhotoRow[],
  supabaseUrl: string,
): Array<{
  id: string;
  url: string;
  filePath: string;
  name: string;
  size: number;
  preview: string;
}> {
  return rows.map((p, i) => {
    const url = getPhotoDisplayUrl(p, supabaseUrl) || String(p.url || '').trim();
    return {
      id: p.id,
      url,
      filePath: String(p.file_path || ''),
      name: `photo-${i + 1}`,
      size: 0,
      preview: url,
    };
  });
}

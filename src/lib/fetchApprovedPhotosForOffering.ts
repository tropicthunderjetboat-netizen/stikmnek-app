import type { SupabaseClient } from '@supabase/supabase-js';
import { getPhotoDisplayUrl } from '@/lib/utils';
import { legacyUntaggedPhotoBelongsToOffering } from '@/lib/offeringPhotoPartition';
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
 * Approved gallery rows for a listing (matches public `PhotoGallery` resolution).
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
    if (offerCount <= 1) {
      rows = list;
    } else {
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
      }
    }
  }

  return rows.filter((p) => String(p.status || '').toLowerCase() === 'approved');
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

import type { SupabaseClient } from '@supabase/supabase-js';

function normalizeUrl(u: string): string {
  return String(u || '').trim();
}

function storagePathFromPublicUrl(url: string): string {
  const u = normalizeUrl(url);
  const marker = '/storage/v1/object/public/business-photos/';
  const i = u.indexOf(marker);
  if (i < 0) return '';
  return decodeURIComponent(u.slice(i + marker.length).split('?')[0] || '');
}

/**
 * Replace the approved gallery for one offering with the editor's photo list.
 * Deletes removed photos, inserts new ones, sets cover (`is_main` + first URL).
 */
export async function syncEmbeddedEditGalleryPhotos(args: {
  client: SupabaseClient;
  userId: string;
  profileBusinessId: string;
  offeringId: string;
  photos: Array<{ id?: string; url: string; filePath?: string }>;
}): Promise<{ inserted: number; deleted: number; error: string | null }> {
  const pid = String(args.profileBusinessId || '').trim();
  const oid = String(args.offeringId || '').trim();
  if (!pid || !oid) return { inserted: 0, deleted: 0, error: null };

  const desired = args.photos
    .map((p, index) => {
      const url = normalizeUrl(p.url);
      if (!url) return null;
      const filePath =
        String(p.filePath || '').trim() || storagePathFromPublicUrl(url) || `legacy/${encodeURIComponent(url)}`;
      return { url, filePath, isMain: index === 0 };
    })
    .filter((p): p is { url: string; filePath: string; isMain: boolean } => Boolean(p));

  if (desired.length === 0) {
    return { inserted: 0, deleted: 0, error: 'At least one photo is required.' };
  }

  const desiredUrlSet = new Set(desired.map((p) => p.url));

  const { data: existing, error: fetchErr } = await args.client
    .from('business_photos')
    .select('id, url, file_path')
    .eq('business_id', pid)
    .eq('offering_id', oid)
    .eq('status', 'approved');

  if (fetchErr) return { inserted: 0, deleted: 0, error: fetchErr.message };

  let deleted = 0;
  for (const row of existing || []) {
    const url = normalizeUrl(String(row.url || ''));
    if (!desiredUrlSet.has(url)) {
      const fp = String(row.file_path || '').trim();
      if (fp && !fp.startsWith('legacy/')) {
        await args.client.storage.from('business-photos').remove([fp]);
      }
      const { error: delErr } = await args.client.from('business_photos').delete().eq('id', row.id);
      if (delErr) return { inserted: 0, deleted, error: delErr.message };
      deleted++;
    }
  }

  const existingUrls = new Set((existing || []).map((r) => normalizeUrl(String(r.url || ''))));

  let inserted = 0;
  for (const p of desired) {
    if (existingUrls.has(p.url)) continue;
    const { error } = await args.client.from('business_photos').insert({
      business_id: pid,
      offering_id: oid,
      url: p.url,
      file_path: p.filePath,
      uploaded_by: args.userId,
      is_main: p.isMain,
      status: 'approved',
    });
    if (error) return { inserted, deleted, error: error.message };
    inserted++;
  }

  await args.client
    .from('business_photos')
    .update({ is_main: false })
    .eq('business_id', pid)
    .eq('offering_id', oid);

  const primary = desired[0];
  if (primary.filePath && !primary.filePath.startsWith('legacy/')) {
    await args.client
      .from('business_photos')
      .update({ is_main: true })
      .eq('business_id', pid)
      .eq('offering_id', oid)
      .eq('file_path', primary.filePath);
  } else {
    await args.client
      .from('business_photos')
      .update({ is_main: true })
      .eq('business_id', pid)
      .eq('offering_id', oid)
      .eq('url', primary.url);
  }

  return { inserted, deleted, error: null };
}

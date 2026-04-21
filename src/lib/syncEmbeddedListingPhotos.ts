import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * `submit_edit` updates `business_offerings.image` but does not insert `business_photos`.
 * Public `PhotoGallery` prefers approved DB rows, so new uploads from the full listing editor
 * must be inserted here (same pattern as the dashboard Photos tab).
 */
export async function syncEmbeddedEditGalleryPhotos(args: {
  client: SupabaseClient;
  userId: string;
  profileBusinessId: string;
  offeringId: string;
  photos: Array<{ url: string; filePath?: string }>;
  /** Normalized URLs already present when the editor opened (from approved `business_photos`). */
  existingUrlKeys: Set<string>;
}): Promise<{ inserted: number; error: string | null }> {
  const pid = String(args.profileBusinessId || '').trim();
  const oid = String(args.offeringId || '').trim();
  if (!pid || !oid) return { inserted: 0, error: null };

  const keyOf = (u: string) => String(u || '').trim();
  let inserted = 0;

  for (const p of args.photos) {
    const url = keyOf(p.url);
    const fp = String(p.filePath || '').trim();
    if (!url || !fp) continue;
    if (args.existingUrlKeys.has(url)) continue;

    const { error } = await args.client.from('business_photos').insert({
      business_id: pid,
      offering_id: oid,
      url: p.url,
      file_path: fp,
      uploaded_by: args.userId,
      is_main: false,
      status: 'approved',
    });
    if (error) return { inserted, error: error.message };
    args.existingUrlKeys.add(url);
    inserted++;
  }

  if (inserted > 0 && args.photos[0]) {
    const primary = args.photos[0];
    const fp0 = String(primary.filePath || '').trim();
    const url0 = keyOf(primary.url);
    await args.client
      .from('business_photos')
      .update({ is_main: false })
      .eq('business_id', pid)
      .eq('offering_id', oid);
    if (fp0) {
      await args.client
        .from('business_photos')
        .update({ is_main: true })
        .eq('business_id', pid)
        .eq('offering_id', oid)
        .eq('file_path', fp0);
    } else if (url0) {
      await args.client
        .from('business_photos')
        .update({ is_main: true })
        .eq('business_id', pid)
        .eq('offering_id', oid)
        .eq('url', url0);
    }
  }

  return { inserted, error: null };
}

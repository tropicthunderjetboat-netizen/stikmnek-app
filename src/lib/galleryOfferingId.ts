import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve `business_offerings.id` for gallery queries on an approved listing row.
 * Unified rows use `id` = offering when multi-listing; profile-only rows need a DB lookup.
 */
export async function resolveGalleryOfferingId(
  client: SupabaseClient,
  listingRowId: string,
  profileBusinessId: string,
): Promise<string> {
  const lid = String(listingRowId || '').trim();
  const pid = String(profileBusinessId || '').trim();
  if (!lid) return pid;
  if (pid && lid !== pid) return lid;

  const { data } = await client
    .from('business_offerings')
    .select('id')
    .eq('business_id', pid || lid)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ? String(data.id) : lid;
}

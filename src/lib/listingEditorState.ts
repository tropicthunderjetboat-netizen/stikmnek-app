import type { SupabaseClient } from '@supabase/supabase-js';
import type { Business } from '@/data/businesses';
import {
  BUSINESS_PROFILE_EMBED_COLS,
  OFFERING_LISTING_COLUMNS,
  mapJoinedOfferingToBusiness,
} from '@/lib/businessOfferingMap';

/**
 * Builds the same `Business` object the public listing uses: one `business_offerings` row
 * joined logically with the master `businesses` profile (same as `BusinessDetail` / discovery).
 */
export async function fetchListingEditorBusiness(
  client: SupabaseClient,
  profileBusinessId: string,
  offeringId: string,
  supabaseUrl: string,
): Promise<Business | null> {
  const pid = String(profileBusinessId).trim();
  const oid = String(offeringId).trim();
  if (!pid || !oid) return null;

  const [offRes, profRes] = await Promise.all([
    client
      .from('business_offerings')
      .select(OFFERING_LISTING_COLUMNS)
      .eq('id', oid)
      .eq('business_id', pid)
      .maybeSingle(),
    client.from('businesses').select(BUSINESS_PROFILE_EMBED_COLS).eq('id', pid).maybeSingle(),
  ]);

  // #region agent log
  fetch('http://127.0.0.1:7527/ingest/1d246a66-fce1-41c9-9015-ebb5a8c5e87f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'df574b' },
    body: JSON.stringify({
      sessionId: 'df574b',
      runId: 'pre-fix',
      hypothesisId: 'H2',
      location: 'listingEditorState.ts:fetchListingEditorBusiness',
      message: 'parallel offering+profile fetch result',
      data: {
        offErr: offRes.error?.message ?? null,
        offHasRow: Boolean(offRes.data),
        profErr: profRes.error?.message ?? null,
        profHasRow: Boolean(profRes.data),
        oidLen: oid.length,
        pidLen: pid.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (offRes.error || !offRes.data) {
    console.warn('[fetchListingEditorBusiness] offering:', offRes.error?.message);
    return null;
  }
  if (profRes.error || !profRes.data) {
    console.warn('[fetchListingEditorBusiness] profile:', profRes.error?.message);
    return null;
  }

  try {
    return mapJoinedOfferingToBusiness(
      offRes.data as Record<string, unknown>,
      profRes.data as Record<string, unknown>,
      supabaseUrl,
    );
  } catch (e) {
    console.warn('[fetchListingEditorBusiness] map:', e);
    return null;
  }
}

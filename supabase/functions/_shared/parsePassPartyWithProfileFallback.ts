/**
 * Parse pass party + extended from request; fall back to user_profiles when body is incomplete.
 * Dedicated module so Edge deploy bundles resolve this export reliably (avoids stale shared chunks).
 */

import { clampPartySize, parsePartySizeAndExtended } from './pricingDynamic.ts';

/** Minimal Supabase client shape for `user_profiles` lookup (service-role Edge). */
type SupabaseProfileClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }> };
    };
  };
};

/**
 * Parse party + extended from request body; if missing/invalid, fill partySize from
 * `user_profiles` (num_adults + num_children, else party_size) for the authenticated user.
 */
export async function parsePassPartyWithProfileFallback(
  body: Record<string, unknown>,
  supabase: SupabaseProfileClient,
  userId: string,
): Promise<{ partySize: number; isExtended: boolean } | null> {
  const direct = parsePartySizeAndExtended(body);
  if (direct) return direct;

  const { data: prof, error } = await supabase
    .from('user_profiles')
    .select('num_adults, num_children, party_size')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[parsePassPartyWithProfileFallback] user_profiles read failed:', error.message);
  }

  const row = prof as Record<string, unknown> | null | undefined;
  const adults = Math.max(0, Math.floor(Number(row?.num_adults ?? 0)));
  const children = Math.max(0, Math.floor(Number(row?.num_children ?? 0)));
  const combined = adults + children;

  const merged: Record<string, unknown> = { ...body };

  if (combined > 0) {
    merged.partySize = clampPartySize(combined);
    console.warn('[parsePassPartyWithProfileFallback] filled partySize from num_adults+num_children', {
      userId,
      combined,
    });
    return parsePartySizeAndExtended(merged);
  }

  if (row != null && row.party_size != null && row.party_size !== '') {
    merged.partySize = clampPartySize(Number(row.party_size));
    console.warn('[parsePassPartyWithProfileFallback] filled partySize from party_size column', { userId });
    return parsePartySizeAndExtended(merged);
  }

  return null;
}

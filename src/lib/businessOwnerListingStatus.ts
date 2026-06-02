import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * True when the owner saved a business profile but has no live offering and no
 * pending submission awaiting admin review — they should submit a deal next.
 */
export async function checkBusinessOwnerNeedsFirstListing(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: profiles, error: profileErr } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', userId);

  if (profileErr || !profiles?.length) return false;

  const profileIds = profiles.map((p) => String(p.id)).filter(Boolean);
  if (profileIds.length === 0) return false;

  const [offeringsRes, pendingRes] = await Promise.all([
    supabase.from('business_offerings').select('id').in('business_id', profileIds).limit(1),
    supabase
      .from('pending_businesses')
      .select('id')
      .eq('owner_id', userId)
      .eq('status', 'pending')
      .limit(1),
  ]);

  if (offeringsRes.error || pendingRes.error) return false;

  const hasLiveOffering = (offeringsRes.data?.length ?? 0) > 0;
  const hasPendingSubmission = (pendingRes.data?.length ?? 0) > 0;
  return !hasLiveOffering && !hasPendingSubmission;
}

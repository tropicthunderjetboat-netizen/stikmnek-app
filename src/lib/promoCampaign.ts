/**
 * Client helpers for limited free-pass promos (e.g. FIRST25).
 */

import { supabase } from '@/lib/supabase';

export const FIRST25_CAMPAIGN_CODE = 'FIRST25';

export type PromoCampaignStatus = {
  id: string;
  code: string;
  label: string;
  max_claims: number;
  claims_count: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  remaining: number;
  available: boolean;
};

function isWithinWindow(startsAt: string | null, endsAt: string | null, now = new Date()): boolean {
  if (startsAt) {
    const s = new Date(startsAt).getTime();
    if (Number.isFinite(s) && s > now.getTime()) return false;
  }
  if (endsAt) {
    const e = new Date(endsAt).getTime();
    if (Number.isFinite(e) && e < now.getTime()) return false;
  }
  return true;
}

/** Fetch public status for the checkout banner. Returns null if inactive/full/missing. */
export async function fetchPromoCampaignStatus(
  code: string = FIRST25_CAMPAIGN_CODE,
): Promise<PromoCampaignStatus | null> {
  const { data, error } = await supabase
    .from('promo_campaigns')
    .select('id, code, label, max_claims, claims_count, is_active, starts_at, ends_at')
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn('[promo] fetch status', error.message);
    return null;
  }

  const max = Number(data.max_claims) || 0;
  const claimed = Number(data.claims_count) || 0;
  const remaining = Math.max(0, max - claimed);
  const available =
    Boolean(data.is_active) &&
    remaining > 0 &&
    isWithinWindow(data.starts_at ?? null, data.ends_at ?? null);

  return {
    id: String(data.id),
    code: String(data.code),
    label: String(data.label ?? ''),
    max_claims: max,
    claims_count: claimed,
    is_active: Boolean(data.is_active),
    starts_at: data.starts_at ?? null,
    ends_at: data.ends_at ?? null,
    remaining,
    available,
  };
}

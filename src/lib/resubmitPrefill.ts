/**
 * Resubmit flow: merge `pending_businesses` with linked `businesses` profile and
 * `business_offerings` so owners keep every field when fixing a rejected listing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { pricingTiersFromDb, type PricingTierInput } from '@/lib/pricingTiers';
import { listingCategoryFromOffering } from '@/lib/businessOfferingMap';

const PROFILE_RESUBMIT_COLS =
  'id, name, category, description, owner_id, location, hours, opening_hours, phone, email, contact_email, business_email, whatsapp_number, map_url, website, image, original_price, deal_price, discount';

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s;
}

function pickStr(...candidates: unknown[]): string {
  for (const c of candidates) {
    const t = str(c);
    if (t) return t;
  }
  return '';
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Match `BusinessListingForm` duration inference for discount window. */
export function inferListingDuration(validFrom: string, validUntil: string): string {
  const from = new Date(`${validFrom.replace(/T.*/, '')}T12:00:00`).getTime();
  const until = new Date(`${validUntil.replace(/T.*/, '')}T12:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until) || until < from) return '1_month';
  const days = Math.round((until - from) / 86400000);
  const presets: { value: string; days: number }[] = [
    { value: '1_day', days: 1 },
    { value: '1_week', days: 7 },
    { value: '2_weeks', days: 14 },
    { value: '1_month', days: 30 },
    { value: '3_months', days: 90 },
    { value: '6_months', days: 180 },
    { value: '1_year', days: 365 },
  ];
  const exact = presets.find((d) => d.days === days);
  if (exact) return exact.value;
  let best: { value: string; diff: number } | null = null;
  for (const d of presets) {
    const diff = Math.abs(days - d.days);
    if (diff <= 3 && (!best || diff < best.diff)) best = { value: d.value, diff };
  }
  return best?.value ?? '1_month';
}

export type DashboardResubmitFormValues = {
  name: string;
  category: string;
  description: string;
  discount: string;
  originalPrice: string;
  discountPercent: string;
  dealPrice: string;
  location: string;
  phone: string;
  email: string;
  hours: string;
  image: string;
  whatsappNumber: string;
  mapUrl: string;
  website: string;
  discountValidFrom: string;
  listingDuration: string;
};

export type ResubmitPrefillMergeResult = {
  form: DashboardResubmitFormValues;
  pricingTiers: PricingTierInput[];
};

type PhotoRow = {
  id: string;
  url: string;
  file_path: string;
  is_main: boolean;
  created_at: string;
  status?: string;
};

function profileHours(p: Record<string, unknown> | null | undefined): string {
  if (!p) return '';
  return pickStr(p.hours, p.opening_hours);
}

function profileEmail(p: Record<string, unknown> | null | undefined): string {
  if (!p) return '';
  return pickStr(p.email, p.contact_email, p.business_email);
}

/**
 * Merge listing fields: pending row wins when non-empty; otherwise offering, then profile.
 */
export function mergeResubmitListingPrefill(args: {
  pending: Record<string, unknown>;
  profile?: Record<string, unknown> | null;
  offering?: Record<string, unknown> | null;
}): ResubmitPrefillMergeResult {
  const { pending, profile, offering } = args;

  const titleFromOffering = offering ? str(offering.title) : '';
  const name = pickStr(pending.name, titleFromOffering, profile?.name);

  let category: string = str(pending.category);
  if (!category && offering) {
    category = listingCategoryFromOffering(offering, profile?.category ?? pending.category);
  }
  if (!category && profile) category = str(profile.category);
  if (!category) category = 'dining';

  const description = pickStr(
    pending.description,
    offering?.description,
    profile?.description,
  );

  const discount = pickStr(pending.discount, offering?.discount);

  const orig = num(pending.original_price) || num(offering?.original_price) || num(profile?.original_price);
  const deal = num(pending.deal_price) || num(offering?.deal_price) || num(profile?.deal_price);

  const discountPercent =
    orig > 0 && deal > 0 && deal < orig ? String(Math.round((1 - deal / orig) * 100)) : '';

  const location = pickStr(pending.location, profile?.location);
  const phone = pickStr(pending.phone, profile?.phone);
  const email = pickStr(pending.email, profileEmail(profile));
  const hours = pickStr(pending.hours, profileHours(profile));
  const image = pickStr(pending.image, offering?.image, profile?.image);
  const whatsappNumber = pickStr(pending.whatsapp_number, profile?.whatsapp_number);

  const mapUrl = pickStr(pending.map_url, offering?.map_url, profile?.map_url);
  const website = pickStr(pending.website, offering?.website, profile?.website);

  const dfRaw = pickStr(pending.discount_valid_from, offering?.discount_valid_from);
  const duRaw = pickStr(pending.discount_valid_until, offering?.discount_valid_until);
  const discountValidFrom = dfRaw ? dfRaw.split('T')[0] : new Date().toISOString().split('T')[0];
  const listingDuration =
    dfRaw && duRaw ? inferListingDuration(dfRaw, duRaw) : '1_month';

  const tiersFromPending = pricingTiersFromDb(pending.pricing_tiers);
  const tiersFromOffering =
    tiersFromPending.length === 0 ? pricingTiersFromDb(offering?.pricing_tiers) : [];
  const pricingTiers = tiersFromPending.length > 0 ? tiersFromPending : tiersFromOffering;

  return {
    form: {
      name,
      category: String(category || 'dining'),
      description,
      discount,
      originalPrice: orig > 0 ? String(orig) : '',
      discountPercent,
      dealPrice: deal > 0 ? String(deal) : '',
      location,
      phone,
      email,
      hours,
      image,
      whatsappNumber,
      mapUrl,
      website,
      discountValidFrom,
      listingDuration,
    },
    pricingTiers,
  };
}

export async function fetchResubmitProfileAndOffering(
  client: SupabaseClient,
  pending: Record<string, unknown>,
): Promise<{ profile: Record<string, unknown> | null; offering: Record<string, unknown> | null }> {
  const bid = str(pending.business_id);
  if (!bid) return { profile: null, offering: null };

  const { data: profile, error: pErr } = await client
    .from('businesses')
    .select(PROFILE_RESUBMIT_COLS)
    .eq('id', bid)
    .maybeSingle();
  if (pErr) {
    console.warn('[resubmitPrefill] profile fetch:', pErr.message);
  }

  const { data: offerings, error: oErr } = await client
    .from('business_offerings')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: true });

  if (oErr) {
    console.warn('[resubmitPrefill] offerings fetch:', oErr.message);
    return { profile: (profile as Record<string, unknown>) || null, offering: null };
  }

  const activeList = ((offerings || []) as Record<string, unknown>[]).filter(
    (o) => o.active !== false,
  );
  if (activeList.length === 0) {
    return { profile: (profile as Record<string, unknown>) || null, offering: null };
  }

  const pname = str(pending.name).toLowerCase();
  let offering: Record<string, unknown> | null = null;
  if (activeList.length === 1) {
    offering = activeList[0]!;
  } else if (pname) {
    offering =
      activeList.find((o) => str(o.title).toLowerCase() === pname) || activeList[0]! || null;
  } else {
    offering = activeList[0]!;
  }

  return { profile: (profile as Record<string, unknown>) || null, offering };
}

/** Gallery rows still linked to this pending submission (excludes rejected photos). */
export async function fetchPendingSubmissionGalleryPhotos(
  client: SupabaseClient,
  pendingId: string,
): Promise<PhotoRow[]> {
  const pid = String(pendingId || '').trim();
  if (!pid) return [];

  const { data, error } = await client
    .from('business_photos')
    .select('id, url, file_path, is_main, created_at, status')
    // Support multiple schema/linking variants:
    // - current: `pending_id` links to pending_businesses.id
    // - stable admin link: `submission_pending_id` preserved after approval
    // - legacy: some deployments stored pending_businesses.id in `business_id`
    .or(`pending_id.eq.${pid},submission_pending_id.eq.${pid},business_id.eq.${pid}`);

  if (error) {
    console.warn('[resubmitPrefill] gallery fetch:', error.message);
    return [];
  }

  const rows = (data || []) as PhotoRow[];
  const filtered = rows.filter((r) => String(r.status || '').toLowerCase() !== 'rejected');
  filtered.sort((a, b) => {
    if (a.is_main && !b.is_main) return -1;
    if (!a.is_main && b.is_main) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  return filtered.slice(0, 5);
}

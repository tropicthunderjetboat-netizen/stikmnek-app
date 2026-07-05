import type { SupabaseClient } from '@supabase/supabase-js';
import type { Business } from '@/data/businesses';
import {
  BUSINESS_LISTINGS_VIEW_COLUMNS,
  BUSINESS_PROFILE_EMBED_COLS,
  mapJoinedOfferingToBusiness,
  OFFERING_LISTING_COLUMNS,
  splitBusinessListingsViewRow,
  unwrapPostgrestEmbed,
} from '@/lib/businessOfferingMap';

export type ListingsFetchResult = {
  businesses: Business[];
  source: 'business_listings_view' | 'business_offerings_join' | 'none';
  error: string | null;
};

function mapViewRows(
  offeringRows: Record<string, unknown>[],
  supabaseUrl: string,
  logPrefix: string,
): Business[] {
  const mapped: Business[] = [];
  for (const row of offeringRows) {
    const { o: offering, b: profile } = splitBusinessListingsViewRow(row);
    if (!profile?.id) {
      console.warn(`${logPrefix} Skipping row (missing profile):`, row?.id);
      continue;
    }
    try {
      mapped.push(mapJoinedOfferingToBusiness(offering, profile, supabaseUrl));
    } catch (mapErr) {
      console.warn(`${logPrefix} Skipping offering:`, profile.name, mapErr);
    }
  }
  return mapped;
}

function mapOfferingJoinRows(
  rows: Record<string, unknown>[],
  supabaseUrl: string,
  logPrefix: string,
): Business[] {
  const mapped: Business[] = [];
  for (const row of rows) {
    const profile = unwrapPostgrestEmbed(row.businesses);
    if (!profile?.id) {
      console.warn(`${logPrefix} Skipping row (missing businesses embed):`, row?.id);
      continue;
    }
    const { businesses: _embed, ...offering } = row;
    try {
      mapped.push(
        mapJoinedOfferingToBusiness(offering as Record<string, unknown>, profile, supabaseUrl),
      );
    } catch (mapErr) {
      console.warn(`${logPrefix} Skipping offering join:`, profile.name, mapErr);
    }
  }
  return mapped;
}

/**
 * Resolve a single offering (by `business_offerings.id`) into a `Business`.
 * Used for deep links (`/deal/:slug`) when the listing isn't already in memory.
 * Tries `business_listings_view` first, then the `business_offerings` + `businesses` join.
 */
export async function fetchOfferingById(
  supabase: SupabaseClient,
  supabaseUrl: string,
  offeringId: string,
): Promise<Business | null> {
  const DBG = '[fetchOfferingById]';
  const id = String(offeringId ?? '').trim();
  if (!id) return null;

  const { data: viewRow, error: viewErr } = await supabase
    .from('business_listings_view')
    .select(BUSINESS_LISTINGS_VIEW_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (!viewErr && viewRow) {
    const { o, b } = splitBusinessListingsViewRow(viewRow as Record<string, unknown>);
    if (b?.id) {
      try {
        return mapJoinedOfferingToBusiness(o, b, supabaseUrl);
      } catch (mapErr) {
        console.warn(`${DBG} view row map failed:`, mapErr);
      }
    }
  } else if (viewErr) {
    console.warn(`${DBG} business_listings_view failed:`, viewErr.message);
  }

  const { data: joinRow, error: joinErr } = await supabase
    .from('business_offerings')
    .select(`${OFFERING_LISTING_COLUMNS}, businesses(${BUSINESS_PROFILE_EMBED_COLS})`)
    .eq('id', id)
    .maybeSingle();

  if (!joinErr && joinRow) {
    const row = joinRow as Record<string, unknown>;
    const profile = unwrapPostgrestEmbed(row.businesses);
    if (profile?.id) {
      const { businesses: _embed, ...offering } = row;
      try {
        return mapJoinedOfferingToBusiness(offering as Record<string, unknown>, profile, supabaseUrl);
      } catch (mapErr) {
        console.warn(`${DBG} join row map failed:`, mapErr);
      }
    }
  } else if (joinErr) {
    console.warn(`${DBG} business_offerings join failed:`, joinErr.message);
  }

  return null;
}

export type BusinessProfilePageData = {
  id: string;
  name: string;
  location: string;
  logoUrl: string | null;
  description: string;
  rating: number;
  reviewCount: number;
  offerings: Business[];
};

const PROFILE_PAGE_COLS =
  'id, name, description, location, rating, review_count, logo_url, image, active';

/**
 * Public business profile: company row + all active offerings (for `/host/:slug` pages).
 */
export async function fetchBusinessProfilePage(
  supabase: SupabaseClient,
  supabaseUrl: string,
  profileBusinessId: string,
): Promise<BusinessProfilePageData | null> {
  const id = String(profileBusinessId ?? '').trim();
  if (!id) return null;

  const { data: prof, error: pErr } = await supabase
    .from('businesses')
    .select(PROFILE_PAGE_COLS)
    .eq('id', id)
    .maybeSingle();

  if (pErr || !prof) return null;

  const profile = prof as Record<string, unknown>;
  if (profile.active === false) return null;

  const { data: offs, error: oErr } = await supabase
    .from('business_offerings')
    .select(OFFERING_LISTING_COLUMNS)
    .eq('business_id', id)
    .eq('active', true)
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (oErr) return null;

  const offerings: Business[] = [];
  for (const row of (offs || []) as Record<string, unknown>[]) {
    try {
      offerings.push(mapJoinedOfferingToBusiness(row, profile, supabaseUrl));
    } catch {
      /* skip malformed row */
    }
  }

  return {
    id,
    name: String(profile.name ?? '').trim() || 'Business',
    location: String(profile.location ?? '').trim(),
    logoUrl:
      String(profile.logo_url ?? profile.image ?? '').trim() || null,
    description: String(profile.description ?? '').trim(),
    rating: Number(profile.rating) || 0,
    reviewCount: Number(profile.review_count) || 0,
    offerings,
  };
}

/**
 * Load active tourist listings. Tries `business_listings_view` first (current schema),
 * then falls back to `business_offerings` + `businesses` if the view is missing or errors
 * (e.g. production DB migration not applied yet).
 */
export async function fetchActiveListings(
  supabase: SupabaseClient,
  supabaseUrl: string,
  options?: { signal?: AbortSignal },
): Promise<ListingsFetchResult> {
  const DBG = '[fetchActiveListings]';

  let viewQuery = supabase
    .from('business_listings_view')
    .select(BUSINESS_LISTINGS_VIEW_COLUMNS)
    .eq('active', true)
    .order('featured', { ascending: false })
    .order('title', { ascending: true });
  if (options?.signal) viewQuery = viewQuery.abortSignal(options.signal);

  const { data: viewRows, error: viewErr } = await viewQuery;

  if (!viewErr && viewRows && viewRows.length > 0) {
    return {
      businesses: mapViewRows(viewRows as Record<string, unknown>[], supabaseUrl, DBG),
      source: 'business_listings_view',
      error: null,
    };
  }

  if (viewErr) {
    console.warn(`${DBG} business_listings_view failed:`, viewErr.message, viewErr);
  } else if (viewRows?.length === 0) {
    console.warn(`${DBG} business_listings_view returned 0 rows — trying join fallback`);
  }

  let joinQuery = supabase
    .from('business_offerings')
    .select(`${OFFERING_LISTING_COLUMNS}, businesses(${BUSINESS_PROFILE_EMBED_COLS})`)
    .eq('active', true)
    .order('featured', { ascending: false })
    .order('title', { ascending: true });
  if (options?.signal) joinQuery = joinQuery.abortSignal(options.signal);

  const { data: joinRows, error: joinErr } = await joinQuery;

  if (!joinErr && joinRows && joinRows.length > 0) {
    return {
      businesses: mapOfferingJoinRows(joinRows as Record<string, unknown>[], supabaseUrl, DBG),
      source: 'business_offerings_join',
      error: viewErr?.message
        ? `Listings loaded via backup (view error: ${viewErr.message})`
        : null,
    };
  }

  const errMsg =
    joinErr?.message ||
    viewErr?.message ||
    (viewRows?.length === 0 && (!joinRows || joinRows.length === 0)
      ? 'No active listings in database'
      : 'Could not load listings');

  console.error(`${DBG} All sources failed:`, { viewErr, joinErr });

  return {
    businesses: [],
    source: 'none',
    error: errMsg,
  };
}

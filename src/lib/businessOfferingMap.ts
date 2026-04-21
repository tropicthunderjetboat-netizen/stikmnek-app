import type { Business, Category } from '@/data/businesses';
import { categories } from '@/data/businesses';
import { getBusinessImageUrl } from '@/lib/utils';

const CATEGORY_KEYS = new Set(categories.map((c) => c.key));

/** PostgREST column list for `business_offerings` rows (no embed). */
export const OFFERING_LISTING_COLUMNS =
  'id, business_id, title, description, description_fr, description_bi, discount, original_price, deal_price, image, map_url, website, discount_valid_from, discount_valid_until, whatsapp_number, pricing_tiers, tags, featured, active, created_at, updated_at';

/** Parent `businesses` columns when embedded from `business_offerings` (left join — no `!inner`). */
export const BUSINESS_PROFILE_EMBED_COLS =
  'id, name, category, owner_id, location, lat, lng, hours, opening_hours, phone, email, contact_email, business_email, whatsapp_number, rating, review_count, featured, active, map_url, website, tags';

/**
 * `businesses.hours` is often `''` after migrations while `opening_hours` holds the text.
 * `??` alone would keep the empty string and hide `opening_hours` (same for whitespace-only).
 */
export function businessHoursFromProfileRow(b: Record<string, unknown>): string {
  const primary = String(b.hours ?? '').trim();
  if (primary) return primary;
  return String(b.opening_hours ?? '').trim();
}

function offeringPrimaryImage(o: Record<string, unknown>): string {
  const direct = String(o.image ?? '').trim();
  if (direct) return direct;
  const imgs = o.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
  }
  return '';
}

function asCategory(raw: unknown): Category {
  if (typeof raw === 'string' && CATEGORY_KEYS.has(raw as Category)) return raw as Category;
  return 'dining';
}

/** Match DB / UI strings like `Tours` or ` TOURS ` to a canonical category key. */
export function normalizeListingCategoryKey(raw: unknown): Category | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  return CATEGORY_KEYS.has(k as Category) ? (k as Category) : null;
}

/**
 * Per-listing category for filters: first canonical key in `business_offerings.tags`;
 * else parent `businesses.category` if valid; else `'activities'` so the row always has a tab bucket.
 */
export function listingCategoryFromOffering(o: Record<string, unknown>, profileCategory: unknown): Category {
  const tags = o.tags == null ? [] : Array.isArray(o.tags) ? (o.tags as unknown[]) : [];
  for (const t of tags) {
    if (typeof t === 'string') {
      const nk = normalizeListingCategoryKey(t);
      if (nk) return nk;
    }
  }
  const fromProfile = normalizeListingCategoryKey(profileCategory);
  if (fromProfile) return fromProfile;
  return 'activities';
}

/**
 * When `deal_price` is missing, zero, or not below `original_price`, treat as "no discount"
 * so UI never shows 0 VT vs full price (looks like 100% off).
 */
function normalizedListPrices(originalRaw: unknown, dealRaw: unknown): { originalPrice: number; dealPrice: number } {
  const orig = Number(originalRaw);
  const origN = Number.isFinite(orig) && orig >= 0 ? orig : 0;
  if (dealRaw == null || dealRaw === '') {
    return { originalPrice: origN, dealPrice: origN };
  }
  const deal = Number(dealRaw);
  if (!Number.isFinite(deal) || deal < 0) {
    return { originalPrice: origN, dealPrice: origN };
  }
  if (origN > 0 && deal === 0) {
    return { originalPrice: origN, dealPrice: origN };
  }
  if (origN > 0 && deal >= origN) {
    return { originalPrice: origN, dealPrice: origN };
  }
  if (origN === 0 && deal > 0) {
    return { originalPrice: 0, dealPrice: deal };
  }
  return { originalPrice: origN, dealPrice: deal };
}

/**
 * Maps a `business_offerings` row + embedded `businesses` profile to the app's `Business` shape.
 * `id` is the offering id (per-deal). `profileBusinessId` is `businesses.id` for reviews, favorites, photos, redemptions.
 */
export function mapJoinedOfferingToBusiness(
  o: Record<string, unknown>,
  b: Record<string, unknown>,
  supabaseUrl: string,
): Business {
  const oActive = o.active !== false;
  const cat = listingCategoryFromOffering(o, b.category);
  const img = offeringPrimaryImage(o);
  const oContact = (o.contact_email as string) || (o.contactEmail as string) || '';
  const { originalPrice, dealPrice } = normalizedListPrices(o.original_price, o.deal_price);
  const oid = o.id != null ? String(o.id).trim() : '';
  if (!oid) {
    throw new Error('mapJoinedOfferingToBusiness: offering id is required');
  }
  return {
    id: oid,
    profileBusinessId: String(b.id),
    name: String(o.title || b.name || '').trim() || 'Offer',
    category: cat,
    description: String(o.description ?? ''),
    descriptionFr: String((o.description_fr ?? o.description) ?? ''),
    descriptionBi: String((o.description_bi ?? o.description) ?? ''),
    image: getBusinessImageUrl(img, supabaseUrl),
    rating: Number(b.rating) || 0,
    reviewCount: Number(b.review_count) || 0,
    discount: String(o.discount ?? ''),
    originalPrice,
    dealPrice,
    location: String(b.location ?? ''),
    lat: Number(b.lat) || 0,
    lng: Number(b.lng) || 0,
    mapUrl: (o.map_url as string) || (b.map_url as string) || null,
    map_url: (o.map_url as string) || (b.map_url as string) || null,
    website: (o.website as string) || (b.website as string) || null,
    hours: businessHoursFromProfileRow(b),
    phone: String(b.phone ?? ''),
    contactEmail:
      oContact ||
      (b.email as string) ||
      (b.contact_email as string) ||
      (b.business_email as string) ||
      null,
    whatsappNumber: (o.whatsapp_number as string) || (b.whatsapp_number as string) || null,
    whatsapp_number: (o.whatsapp_number as string) || (b.whatsapp_number as string) || null,
    tags: Array.isArray(o.tags) ? (o.tags as string[]) : Array.isArray(b.tags) ? (b.tags as string[]) : [],
    featured: Boolean(o.featured) || Boolean(b.featured),
    ownerId: (b.owner_id as string) || null,
    superStarCount: Number(b.super_star_count) || 0,
    pricingTiers: o.pricing_tiers ?? null,
    /** Tourist discovery uses offering `active`; profile `active` is separate (stub / owner hide). */
    active: oActive,
    profileName: String(b.name ?? '').trim() || undefined,
    discountValidFrom: isoDateOnly(o.discount_valid_from),
    discountValidUntil: isoDateOnly(o.discount_valid_until),
  };
}

/** Favorites, reviews, photos, QR/redemption still use `businesses.id`. */
export function profileBusinessIdFor(b: Business): string {
  return b.profileBusinessId ?? b.id;
}

/** PostgREST embed: `businesses` may be object or single-element array. */
export function unwrapPostgrestEmbed(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) return first as Record<string, unknown>;
    return null;
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return null;
}

function isoDateOnly(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.includes('T') ? s.split('T')[0]! : s.slice(0, 10);
}

/** Unified dashboard rows use `_profileBusinessId`; public `Business` uses `profileBusinessId`. */
export function effectiveProfileBusinessId(x: {
  id: string;
  profileBusinessId?: string | null;
  _profileBusinessId?: string | null;
}): string {
  return (x.profileBusinessId ?? x._profileBusinessId ?? x.id) as string;
}


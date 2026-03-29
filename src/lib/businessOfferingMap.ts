import type { Business, Category } from '@/data/businesses';
import { categories } from '@/data/businesses';
import { getBusinessImageUrl } from '@/lib/utils';

const CATEGORY_KEYS = new Set(categories.map((c) => c.key));

function asCategory(raw: unknown): Category {
  if (typeof raw === 'string' && CATEGORY_KEYS.has(raw as Category)) return raw as Category;
  return 'dining';
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
  const cat = asCategory(b.category);
  const img = (o.image as string) || '';
  return {
    id: String(o.id),
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
    originalPrice: Number(o.original_price) || 0,
    dealPrice: Number(o.deal_price) || 0,
    location: String(b.location ?? ''),
    lat: Number(b.lat) || 0,
    lng: Number(b.lng) || 0,
    mapUrl: (o.map_url as string) || (b.map_url as string) || null,
    map_url: (o.map_url as string) || (b.map_url as string) || null,
    website: (o.website as string) || (b.website as string) || null,
    hours: String(b.hours ?? b.opening_hours ?? ''),
    phone: String(b.phone ?? ''),
    contactEmail:
      (b.email as string) || (b.contact_email as string) || (b.business_email as string) || null,
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
  };
}

/** Favorites, reviews, photos, QR/redemption still use `businesses.id`. */
export function profileBusinessIdFor(b: Business): string {
  return b.profileBusinessId ?? b.id;
}

/** Unified dashboard rows use `_profileBusinessId`; public `Business` uses `profileBusinessId`. */
export function effectiveProfileBusinessId(x: {
  id: string;
  profileBusinessId?: string | null;
  _profileBusinessId?: string | null;
}): string {
  return (x.profileBusinessId ?? x._profileBusinessId ?? x.id) as string;
}

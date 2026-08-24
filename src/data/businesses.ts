import { pricingTiersFromDb, representativePerPersonPricesFromTiers } from '@/lib/pricingTiers';

export type Category =
  | 'dining'
  | 'activities'
  | 'tours'
  | 'shopping'
  | 'spa'
  | 'accommodation'
  | 'transportation';

/** Raw `business_offerings` row shape when embedded from PostgREST (before mapping to `Business`). */
export type EmbeddedBusinessOfferingRow = {
  id?: string;
  active?: boolean;
  description?: string | null;
  /** Alias some schemas use; DB column is usually `description`. */
  description_html?: string | null;
  description_fr?: string | null;
  description_bi?: string | null;
  deal_price?: number | null;
  original_price?: number | null;
  image?: string | null;
  banner_url?: string | null;
  pricing_tiers?: unknown;
  tier_pricing?: unknown;
  map_url?: string | null;
  website?: string | null;
  whatsapp_number?: string | null;
  location_lat?: number | null;
  location_long?: number | null;
};

export interface Business {
  id: string;
  /**
   * Master `businesses` row when this listing row comes from `business_offerings`.
   * Use for favorites, reviews, `business_photos`, and redemption APIs (still keyed by profile id).
   */
  profileBusinessId?: string;
  /** Trading / venue name from profile (optional subtitle vs offer `title`). */
  profileName?: string;
  /** Business logo URL from the master `businesses` profile. */
  profileLogoUrl?: string | null;
  /**
   * Embedded offerings from `select('*, business_offerings(*)')` (optional).
   * Cleared in most UI paths after mapping with `mapJoinedOfferingToBusiness`.
   */
  business_offerings?: EmbeddedBusinessOfferingRow[];
  name: string;
  category: Category;
  description: string;
  descriptionFr: string;
  descriptionBi: string;
  image: string;
  rating: number;
  reviewCount: number;
  discount: string;
  originalPrice: number;
  dealPrice: number;
  location: string;
  lat: number;
  lng: number;
  /** Google Maps share / pin URL from listing (DB `map_url`). */
  mapUrl?: string | null;
  map_url?: string | null;
  website?: string | null;
  hours: string;
  phone: string;
  /** Public contact email from listing (if column exists in DB). */
  contactEmail?: string | null;
  whatsappNumber?: string | null;
  /** Same as DB `whatsapp_number` when row is passed through without mapping. */
  whatsapp_number?: string | null;
  tags: string[];
  featured: boolean;
  ownerId?: string | null;
  superStarCount?: number;
  /** Tiered pricing JSON from `pricing_tiers` (Tours / Activities). */
  pricingTiers?: unknown;
  /**
   * Listing visibility: for rows from `business_offerings`, this follows the offering’s `active`.
   * Master profile `businesses.active` may differ (e.g. stub false while deals are live).
   */
  active?: boolean;
  /** From `business_offerings.discount_valid_from` (YYYY-MM-DD). */
  discountValidFrom?: string | null;
  /** From `business_offerings.discount_valid_until` (YYYY-MM-DD). */
  discountValidUntil?: string | null;
  /** Admin-verified credentials (from `business_listings_view`, public flags only). */
  credVerifiedTourismPermit?: boolean;
  credVerifiedLiabilityInsurance?: boolean;
  credVerifiedAssociationCredentials?: boolean;
  credVerifiedFirstAid?: boolean;
  credVerifiedCount?: number;
}

/** First active (or first) embedded offering — safe vs missing `business_offerings`. */
export function primaryEmbeddedOffering(
  b: Pick<Business, 'business_offerings'> | null | undefined,
): EmbeddedBusinessOfferingRow | null {
  const arr = b?.business_offerings;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const activeFirst = arr.find((o) => o && o.active !== false);
  return activeFirst ?? arr[0] ?? null;
}

/** Rich HTML/text from embedded offering (`description_html` or `description`). */
export function primaryOfferingDescriptionHtml(b: Business | null | undefined): string {
  const o = primaryEmbeddedOffering(b);
  if (!o) return '';
  return String(o.description_html ?? o.description ?? '').trim();
}

function tierHeadlinePrices(b: Business) {
  const o = primaryEmbeddedOffering(b);
  const raw =
    b.pricingTiers ??
    (b as Record<string, unknown>).pricing_tiers ??
    o?.pricing_tiers ??
    (o as Record<string, unknown> | undefined)?.tier_pricing;
  return representativePerPersonPricesFromTiers(raw);
}

/** Flat / offering columns on the listing row (may be wrong for tours when only tiers were filled). */
function flatListingPricePair(b: Business): { orig: number; deal: number } {
  const flatO = Number(b.originalPrice);
  const flatD = Number(b.dealPrice);
  const o = primaryEmbeddedOffering(b);
  const offO = Number(o?.original_price);
  const offD = Number(o?.deal_price);
  const orig =
    Number.isFinite(flatO) && flatO > 0 ? flatO : Number.isFinite(offO) && offO > 0 ? offO : 0;
  const deal =
    Number.isFinite(flatD) && flatD > 0 ? flatD : Number.isFinite(offD) && offD > 0 ? offD : 0;
  return { orig, deal };
}

/** Deal / list price with fallback to embedded offering and tier JSON (legacy tier-only rows). */
export function effectiveListingDealPrice(b: Business): number {
  const th = tierHeadlinePrices(b);
  const { orig: fo, deal: fd } = flatListingPricePair(b);
  const flatShowsDiscount = fo > 0 && fd > 0 && fd < fo;
  if (th && !flatShowsDiscount) return th.deal_price_vt;
  if (fd > 0) return fd;
  if (th) return th.deal_price_vt;
  return 0;
}

export function effectiveListingOriginalPrice(b: Business): number {
  const th = tierHeadlinePrices(b);
  const { orig: fo, deal: fd } = flatListingPricePair(b);
  const flatShowsDiscount = fo > 0 && fd > 0 && fd < fo;
  if (th && !flatShowsDiscount) return th.original_price_vt;
  if (fo > 0) return fo;
  if (th) return th.original_price_vt;
  return 0;
}

/** Percent off for an active Pass deal, or null when the listing has no price discount. */
export function listingDiscountPercent(b: Business): number | null {
  if (!listingHasActiveDiscount(b)) return null;
  const orig = effectiveListingOriginalPrice(b);
  const deal = effectiveListingDealPrice(b);
  if (orig > 0 && deal > 0 && deal < orig) {
    return Math.round(((orig - deal) / orig) * 100);
  }
  return null;
}

/** True when there is a real StikmNek deal (deal strictly below standard list price). */
export function listingHasActiveDiscount(b: Business): boolean {
  const deal = effectiveListingDealPrice(b);
  const orig = effectiveListingOriginalPrice(b);
  if (orig > 0 && deal > 0 && deal < orig) return true;

  // Fallback: tiered rows may exist even when the “headline” pair is not present/mapped.
  const o = primaryEmbeddedOffering(b);
  const raw =
    b.pricingTiers ??
    (b as Record<string, unknown>).pricing_tiers ??
    o?.pricing_tiers ??
    (o as Record<string, unknown> | undefined)?.tier_pricing;
  const tiers = pricingTiersFromDb(raw);
  return tiers.some((t) => t.original_price_vt > 0 && t.deal_price_vt > 0 && t.deal_price_vt < t.original_price_vt);
}

/** A text offer exists even when there is no numeric price discount (e.g. "Free dessert"). */
export function listingHasNonPriceOffer(b: Business): boolean {
  const label = String(b.discount ?? '').trim();
  if (!label) return false;
  if (listingHasActiveDiscount(b)) return false;
  // Leftover "20% off" copy is not a real add-on when prices are not discounted.
  if (/\d+\s*%/.test(label)) return false;
  return true;
}

/** Offer badge to show on cards/details: price discount or free add-on text. */
export function listingOfferBadgeText(b: Business): string | null {
  const label = String(b.discount ?? '').trim();
  if (listingHasActiveDiscount(b) && label) return label;
  if (listingHasActiveDiscount(b)) {
    const deal = effectiveListingDealPrice(b);
    const orig = effectiveListingOriginalPrice(b);
    if (orig > 0 && deal > 0 && deal < orig) {
      return `${Math.round((1 - deal / orig) * 100)}% OFF`;
    }
  }
  if (listingHasNonPriceOffer(b) && label) return label;
  return null;
}

/** Headline price for cards and detail (discounted price, or list price when no deal). */
export function customerFacingListPrice(b: Business): number {
  const deal = effectiveListingDealPrice(b);
  const orig = effectiveListingOriginalPrice(b);
  if (listingHasActiveDiscount(b)) return deal;
  if (orig > 0) return orig;
  return deal;
}

export function effectiveListingDescriptionPlain(b: Business): string {
  const fromFlat = (b.description || '').trim();
  if (fromFlat) return fromFlat;
  return primaryOfferingDescriptionHtml(b);
}

/**
 * A listing's discount has lapsed: today's UTC calendar date is strictly after
 * `discountValidUntil` (date-only, YYYY-MM-DD). Listings without an end date never expire.
 * Used to hide expired deals from tourists while owners/admins can still reactivate them.
 */
export function listingDiscountExpired(b: Pick<Business, 'discountValidUntil'>): boolean {
  const until = String(b.discountValidUntil ?? '').slice(0, 10);
  if (!until) return false;
  const todayUtc = new Date().toISOString().slice(0, 10);
  return until < todayUtc;
}

/**
 * Canonical pipeline for tourist UI: offerings from `loadBusinesses` (`Business.id` = offering id).
 * Use everywhere (Hero, categories, map, search, deals grid, leaderboard) so counts and cards match.
 * Expired deals (past `discountValidUntil`) are hidden here until an owner/admin reactivates them.
 */
export function touristFacingOfferings(db: Business[]): Business[] {
  return db.filter((b) => b.active !== false && !listingDiscountExpired(b));
}

/** Non-empty WhatsApp on listing (camelCase from mapper or snake_case passthrough). */
export function businessListingWhatsAppRaw(biz: Business): string {
  const raw = biz.whatsappNumber ?? biz.whatsapp_number;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function businessListingHasWhatsApp(biz: Business): boolean {
  return businessListingWhatsAppRaw(biz).length > 0;
}

/**
 * @deprecated Prefer `touristFacingOfferings` — kept for older imports; second arg ignored (no mock fallback).
 */
export function publicListingBusinesses(db: Business[], _local: Business[] = []): Business[] {
  void _local;
  return touristFacingOfferings(db);
}




export interface Review {
  id: string;
  businessId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
  avatar: string;
}

export const categories: { key: Category; label: string; labelFr: string; labelBi: string; icon: string }[] = [
  { key: 'dining', label: 'Dining', labelFr: 'Restauration', labelBi: 'Kakae', icon: 'utensils' },
  { key: 'activities', label: 'Activities', labelFr: 'Activités', labelBi: 'Aktiviti', icon: 'waves' },
  { key: 'tours', label: 'Tours', labelFr: 'Visites', labelBi: 'Tua', icon: 'compass' },
  { key: 'transportation', label: 'Transportation', labelFr: 'Transport', labelBi: 'Transport', icon: 'car' },
  { key: 'shopping', label: 'Shopping', labelFr: 'Shopping', labelBi: 'Soping', icon: 'shopping-bag' },
  { key: 'spa', label: 'Spa & Wellness', labelFr: 'Spa & Bien-être', labelBi: 'Spa & Helt', icon: 'heart' },
  { key: 'accommodation', label: 'Accommodation', labelFr: 'Hébergement', labelBi: 'Ples blong slip', icon: 'home' },
];

/** Canonical keys for selects, filters, and admin forms. */
export const CATEGORY_SELECT_KEYS: Category[] = categories.map((c) => c.key);

export function categoryLabelForKey(
  key: string,
  language: 'en' | 'fr' | 'bi' = 'en',
): string {
  const c = categories.find((x) => x.key === key);
  if (!c) {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  if (language === 'fr') return c.labelFr;
  if (language === 'bi') return c.labelBi;
  return c.label;
}

// Fallback data used when DB hasn't loaded yet
// Prices are in Vanuatu Vatu (VT)
export const businesses: Business[] = [
  { id: 'b1', name: 'Waterfront Bar & Grill', category: 'dining', description: 'Enjoy fresh seafood with stunning harbour views. Our signature coconut crab is a must-try!', descriptionFr: 'Savourez des fruits de mer frais avec une vue imprenable sur le port.', descriptionBi: 'Enjoem fres sifud wetem nambawan viu blong haba.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856900792_67ead30b.jpg', rating: 4.8, reviewCount: 124, discount: '25% OFF', originalPrice: 5500, dealPrice: 4125, location: 'Seafront, Port Vila', lat: -17.7416, lng: 168.3120, hours: '11:00 AM - 10:00 PM', phone: '+678 22345', tags: ['seafood', 'waterfront', 'dinner'], featured: true },
  { id: 'b2', name: 'Nambawan Café', category: 'dining', description: 'Authentic Melanesian cuisine meets modern flavors.', descriptionFr: 'La cuisine mélanésienne authentique rencontre les saveurs modernes.', descriptionBi: 'Tru Melanesian kakae i mitim modern flavas.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856911430_8432056a.png', rating: 4.6, reviewCount: 89, discount: '20% OFF', originalPrice: 3500, dealPrice: 2800, location: 'Main Street, Port Vila', lat: -17.7390, lng: 168.3110, hours: '7:00 AM - 9:00 PM', phone: '+678 23456', tags: ['local cuisine', 'breakfast', 'lunch'], featured: true },
  { id: 'b3', name: 'Tropical Breeze Restaurant', category: 'dining', description: 'Fine dining with a tropical twist.', descriptionFr: 'Gastronomie avec une touche tropicale.', descriptionBi: 'Nambawan kakae wetem tropikal tanis.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856910655_1d6c7b2d.png', rating: 4.9, reviewCount: 201, discount: '30% OFF', originalPrice: 8500, dealPrice: 5950, location: 'Iririki Island Resort', lat: -17.7450, lng: 168.3050, hours: '6:00 PM - 11:00 PM', phone: '+678 24567', tags: ['fine dining', 'fusion', 'romantic'], featured: true },
  { id: 'b4', name: 'Vila Sunset Lounge', category: 'dining', description: 'Cocktails and tapas with the best sunset views.', descriptionFr: 'Cocktails et tapas avec les meilleures vues du coucher de soleil.', descriptionBi: 'Koktels mo tapas wetem beswan sunset viu.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856918924_80900148.png', rating: 4.5, reviewCount: 67, discount: '15% OFF', originalPrice: 4500, dealPrice: 3825, location: 'Erakor Lagoon', lat: -17.7520, lng: 168.3200, hours: '4:00 PM - 12:00 AM', phone: '+678 25678', tags: ['cocktails', 'sunset', 'live music'], featured: false },
  { id: 'b5', name: 'Blue Lagoon Snorkeling', category: 'activities', description: 'Explore vibrant coral reefs and swim with tropical fish.', descriptionFr: 'Explorez des récifs coralliens vibrants.', descriptionBi: 'Eksploarem nambawan korel rif.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856938935_27ebc816.png', rating: 4.9, reviewCount: 312, discount: '35% OFF', originalPrice: 10000, dealPrice: 6500, location: 'Blue Lagoon, Efate', lat: -17.6800, lng: 168.3500, hours: '8:00 AM - 4:00 PM', phone: '+678 26789', tags: ['snorkeling', 'marine life', 'adventure'], featured: true },
  { id: 'b6', name: 'Vanuatu Kayak Adventures', category: 'activities', description: 'Paddle through mangroves and hidden coves.', descriptionFr: 'Pagayez à travers les mangroves.', descriptionBi: 'Padol tru mangrov mo haed kof.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856947762_e1259494.png', rating: 4.7, reviewCount: 156, discount: '20% OFF', originalPrice: 7000, dealPrice: 5600, location: 'Mele Bay', lat: -17.7100, lng: 168.2800, hours: '7:00 AM - 6:00 PM', phone: '+678 27890', tags: ['kayaking', 'nature', 'sunset'], featured: false },
  { id: 'b7', name: 'Hideaway Island Diving', category: 'activities', description: 'Discover the underwater post office and marine sanctuary.', descriptionFr: 'Découvrez le bureau de poste sous-marin.', descriptionBi: 'Faenem andawota pos ofis.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856935987_2414e599.jpg', rating: 4.8, reviewCount: 245, discount: '25% OFF', originalPrice: 15000, dealPrice: 11250, location: 'Hideaway Island', lat: -17.7150, lng: 168.2650, hours: '8:00 AM - 5:00 PM', phone: '+678 28901', tags: ['diving', 'PADI', 'marine sanctuary'], featured: true },
  { id: 'b8', name: 'Cascade Waterfall Trek', category: 'activities', description: 'Guided jungle trek to the stunning Mele Cascades.', descriptionFr: 'Randonnée guidée dans la jungle.', descriptionBi: 'Gaeded jangol trek go long Mele Cascades.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856951990_2d695c38.png', rating: 4.6, reviewCount: 189, discount: '15% OFF', originalPrice: 5000, dealPrice: 4250, location: 'Mele Village', lat: -17.7000, lng: 168.2900, hours: '8:00 AM - 3:00 PM', phone: '+678 29012', tags: ['trekking', 'waterfall', 'nature'], featured: false },
  { id: 'b9', name: 'Ekasup Cultural Village', category: 'tours', description: 'Experience authentic Ni-Vanuatu culture.', descriptionFr: 'Vivez la culture authentique Ni-Vanuatu.', descriptionBi: 'Eksperiens tru Ni-Vanuatu kalsa.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856976443_5ee434da.png', rating: 4.9, reviewCount: 278, discount: '20% OFF', originalPrice: 6500, dealPrice: 5200, location: 'Ekasup Village', lat: -17.7350, lng: 168.2950, hours: '9:00 AM - 4:00 PM', phone: '+678 30123', tags: ['culture', 'traditional', 'kava'], featured: true },
  { id: 'b10', name: 'Port Vila Heritage Walk', category: 'tours', description: 'Discover the colonial history and vibrant markets.', descriptionFr: 'Découvrez l\'histoire coloniale et les marchés vibrants.', descriptionBi: 'Faenem kolonial histri mo nambawan maket.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856985705_805475fe.png', rating: 4.5, reviewCount: 134, discount: '10% OFF', originalPrice: 4500, dealPrice: 4050, location: 'Port Vila Town', lat: -17.7380, lng: 168.3140, hours: '8:00 AM - 12:00 PM', phone: '+678 31234', tags: ['history', 'walking tour', 'markets'], featured: false },
  { id: 'b11', name: 'Tanna Volcano Day Trip', category: 'tours', description: 'Fly to Tanna and witness Mount Yasur active volcano.', descriptionFr: 'Envolez-vous vers Tanna et admirez le volcan actif.', descriptionBi: 'Flae go long Tanna mo lukim Mount Yasur volkeno.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856973624_1b887f4a.jpg', rating: 4.9, reviewCount: 356, discount: '15% OFF', originalPrice: 45000, dealPrice: 38250, location: 'Tanna Island', lat: -19.5300, lng: 169.4400, hours: 'Departs 7:00 AM', phone: '+678 32345', tags: ['volcano', 'adventure', 'day trip'], featured: true },
  { id: 'b12', name: 'Chief Roi Mata Tour', category: 'tours', description: 'Visit the UNESCO World Heritage site.', descriptionFr: 'Visitez le site du patrimoine mondial de l\'UNESCO.', descriptionBi: 'Visitim UNESCO World Heritage saet.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856981439_d4c47fd2.png', rating: 4.7, reviewCount: 198, discount: '20% OFF', originalPrice: 9500, dealPrice: 7600, location: 'North Efate', lat: -17.6500, lng: 168.3800, hours: '9:00 AM - 3:00 PM', phone: '+678 33456', tags: ['UNESCO', 'heritage', 'history'], featured: false },
  { id: 'b13', name: 'Erakor Island Spa', category: 'spa', description: 'Luxury spa treatments using local volcanic mud and coconut oil.', descriptionFr: 'Soins spa de luxe utilisant de la boue volcanique locale.', descriptionBi: 'Lakseri spa tritmen wetem lokal volkenik mad.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857000182_f55ad882.jpg', rating: 4.8, reviewCount: 167, discount: '30% OFF', originalPrice: 12000, dealPrice: 8400, location: 'Erakor Island', lat: -17.7550, lng: 168.3250, hours: '9:00 AM - 7:00 PM', phone: '+678 34567', tags: ['spa', 'massage', 'relaxation'], featured: true },
  { id: 'b14', name: 'Paradise Cove Resort', category: 'accommodation', description: 'Beachfront bungalows with private beach access.', descriptionFr: 'Bungalows en bord de mer avec accès privé.', descriptionBi: 'Bichfron bangalo wetem praevet bich akses.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856999889_357acdad.jpg', rating: 4.7, reviewCount: 223, discount: '25% OFF', originalPrice: 23000, dealPrice: 17250, location: 'North Shore, Efate', lat: -17.6700, lng: 168.3600, hours: 'Check-in: 2:00 PM', phone: '+678 35678', tags: ['resort', 'beachfront', 'luxury'], featured: true },
  { id: 'b15', name: 'Vanuatu Handicraft Market', category: 'shopping', description: 'Authentic handmade crafts, wood carvings, and traditional textiles.', descriptionFr: 'Artisanat authentique fait main.', descriptionBi: 'Tru handmade kraft, wud kavin.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857002898_1909faf0.jpg', rating: 4.4, reviewCount: 98, discount: '15% OFF', originalPrice: 3000, dealPrice: 2550, location: 'Central Market, Port Vila', lat: -17.7400, lng: 168.3160, hours: '7:00 AM - 5:00 PM', phone: '+678 36789', tags: ['crafts', 'souvenirs', 'local art'], featured: false },
  { id: 'b16', name: 'Coconut Palms Wellness', category: 'spa', description: 'Traditional Melanesian healing combined with modern wellness.', descriptionFr: 'Guérison mélanésienne traditionnelle combinée au bien-être moderne.', descriptionBi: 'Tradisonal Melanesian hilin kombaenem wetem modern welnes.', image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857004548_0b22487d.jpg', rating: 4.6, reviewCount: 112, discount: '20% OFF', originalPrice: 7500, dealPrice: 6000, location: 'Vila Bay', lat: -17.7480, lng: 168.3080, hours: '6:00 AM - 8:00 PM', phone: '+678 37890', tags: ['yoga', 'wellness', 'meditation'], featured: false },
];

/** Default seed/demo listings (b1–b16). Kept on the public site as filler; hidden from admin/staff tools. */
export const SEED_BUSINESS_IDS = new Set(businesses.map((b) => b.id));

export function isSeedBusiness(
  row: { id?: string | null; profileBusinessId?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  const id = String(row.id ?? '').trim();
  const profileId = String(row.profileBusinessId ?? '').trim();
  return (
    (id.length > 0 && SEED_BUSINESS_IDS.has(id)) ||
    (profileId.length > 0 && SEED_BUSINESS_IDS.has(profileId))
  );
}

/** Partner listings only — excludes seed filler rows (for admin/staff dashboards). */
export function partnerBusinessesFrom(rows: Business[]): Business[] {
  return rows.filter((b) => !isSeedBusiness(b));
}


export const sampleReviews: Review[] = [
  { id: 'r1', businessId: 'b1', userName: 'Sarah M.', rating: 5, comment: 'Absolutely incredible seafood! The coconut crab was the best I\'ve ever had.', date: '2026-02-01', avatar: 'SM' },
  { id: 'r2', businessId: 'b1', userName: 'Jean-Pierre L.', rating: 5, comment: 'Magnifique! Le poisson était parfaitement préparé.', date: '2026-01-28', avatar: 'JL' },
  { id: 'r3', businessId: 'b5', userName: 'Mike T.', rating: 5, comment: 'Best snorkeling experience of my life!', date: '2026-02-05', avatar: 'MT' },
  { id: 'r4', businessId: 'b9', userName: 'Emma W.', rating: 5, comment: 'Such an authentic cultural experience.', date: '2026-01-30', avatar: 'EW' },
  { id: 'r5', businessId: 'b11', userName: 'David K.', rating: 5, comment: 'Mount Yasur is absolutely breathtaking.', date: '2026-02-08', avatar: 'DK' },
  { id: 'r6', businessId: 'b13', userName: 'Lisa R.', rating: 4, comment: 'The volcanic mud treatment was amazing.', date: '2026-02-03', avatar: 'LR' },
  { id: 'r7', businessId: 'b3', userName: 'Tom H.', rating: 5, comment: 'Fine dining at its best.', date: '2026-01-25', avatar: 'TH' },
  { id: 'r8', businessId: 'b7', userName: 'Anna S.', rating: 5, comment: 'The underwater post office is so unique!', date: '2026-02-10', avatar: 'AS' },
];

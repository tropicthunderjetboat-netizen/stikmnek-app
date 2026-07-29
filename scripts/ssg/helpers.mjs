/** Shared helpers for build-time static HTML generation. */

export const SITE_ORIGIN = (process.env.VITE_SITE_URL || 'https://www.stikmnek.com').replace(
  /\/$/,
  '',
);

export const SUPABASE_URL = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://hbaflbmfptobyfqbudrt.supabase.co'
).replace(/\/$/, '');

export const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYWZsYm1mcHRvYnlmcWJ1ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTMwMTIsImV4cCI6MjA4NzI4OTAxMn0.Ukdx0PKI6cpoEdKGcV4LgcgumkhDIfiIXbmVMgbqKL0';

export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-facebook-preview.jpg?v=20260720`;

const CATEGORY_LABELS = {
  dining: 'Dining',
  activities: 'Activities',
  tours: 'Tours',
  transportation: 'Transportation',
  shopping: 'Shopping',
  spa: 'Spa & Wellness',
  accommodation: 'Accommodation',
};

const SCHEMA_TYPE_BY_CATEGORY = {
  dining: 'FoodEstablishment',
  spa: 'DaySpa',
  accommodation: 'LodgingBusiness',
  shopping: 'Store',
  // tours / activities / transportation are trip/service listings → TouristTrip
  // (see listingJsonLd). TouristAttraction reserved for real places only.
};

/** Categories modeled as TouristTrip + provider, not as the place/business itself. */
const TOURIST_TRIP_CATEGORIES = new Set(['tours', 'activities', 'transportation']);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const GENERIC_TITLES = new Set(['', 'offer', 'main offer']);
const GENERIC_PROFILE_SLUGS = new Set([
  'your-business',
  'your-businesses',
  'business',
  'my-business',
  'company',
  'offer',
  'listing',
]);

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyText(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function listingDisplayTitle(offeringTitle, profileName) {
  const ot = String(offeringTitle ?? '').trim();
  const pn = String(profileName ?? '').trim();
  if (ot && !GENERIC_TITLES.has(ot.toLowerCase())) return ot;
  if (pn) return pn;
  return 'Offer';
}

export function dealSlugFor(id, name) {
  const words = slugifyText(name);
  return words ? `${words}-${id}` : id;
}

export function partnerSlugFor(id, name) {
  const words = slugifyText(String(name ?? '').trim());
  if (!words || GENERIC_PROFILE_SLUGS.has(words)) return id;
  return `${words}-${id}`;
}

export function categoryLabel(key) {
  return CATEGORY_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Deals');
}

export function schemaTypeForCategory(key) {
  if (TOURIST_TRIP_CATEGORIES.has(key)) return 'TouristTrip';
  return SCHEMA_TYPE_BY_CATEGORY[key] || 'LocalBusiness';
}

export function providerTypeForCategory(key) {
  if (key === 'tours' || key === 'activities') return 'TravelAgency';
  return 'LocalBusiness';
}

export function resolveImageUrl(raw) {
  const val = String(raw || '').trim();
  if (!val) return DEFAULT_OG_IMAGE;
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  const path = val.replace(/^\//, '');
  const bucket = path.startsWith('images/') ? 'images' : 'business-photos';
  const storagePath = path.startsWith('images/') ? path.slice(7) : path;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
}

export function listingDiscountExpired(until) {
  const day = String(until ?? '').slice(0, 10);
  if (!day) return false;
  const todayUtc = new Date().toISOString().slice(0, 10);
  return day < todayUtc;
}

export function formatVT(amount) {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (!Number.isFinite(num)) return null;
  return `VT ${Math.round(num).toLocaleString('en-US')}`;
}

export function normalizeCategory(raw, tags) {
  const fromTag = Array.isArray(tags)
    ? tags.map((t) => String(t).toLowerCase()).find((t) => t in CATEGORY_LABELS)
    : null;
  const key = String(fromTag || raw || 'activities')
    .toLowerCase()
    .replace(/^transport$/, 'transportation');
  return key in CATEGORY_LABELS ? key : 'activities';
}

export async function fetchJson(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Active tourist-facing listings (mirrors fetchActiveListings + touristFacingOfferings).
 */
export async function loadListings() {
  let rows = [];
  // Prefer offerings+profile join for SSG: business_listings_view can fail under
  // anon when the view touches business_credentials (permission denied).
  try {
    rows = await fetchJson(
      'business_offerings?active=eq.true&select=id,business_id,title,description,discount,original_price,deal_price,image,discount_valid_until,tags,featured,active,businesses(id,name,category,location,lat,lng,phone,rating,review_count,description,logo_url,image,active)&order=featured.desc,title.asc',
    );
  } catch (err) {
    console.warn('[ssg] offerings join failed, trying business_listings_view:', err.message);
    rows = await fetchJson(
      'business_listings_view?active=eq.true&select=id,business_id,profile_business_id,profile_name,title,description,discount,original_price,deal_price,image,discount_valid_until,tags,featured,active,category,location,lat,lng,phone,rating,review_count&order=featured.desc,title.asc',
    );
  }

  const listings = [];
  for (const row of rows || []) {
    const embed = row.businesses;
    const profile = Array.isArray(embed) ? embed[0] : embed;
    const offeringId = String(row.id ?? '').trim();
    if (!offeringId) continue;
    if (row.active === false) continue;
    if (listingDiscountExpired(row.discount_valid_until)) continue;

    const profileId = String(
      row.profile_business_id ?? row.business_id ?? profile?.id ?? '',
    ).trim();
    const profileName = String(row.profile_name ?? profile?.name ?? '').trim();
    const title = listingDisplayTitle(row.title, profileName);
    const category = normalizeCategory(row.category ?? profile?.category, row.tags);
    const description = stripHtml(row.description ?? profile?.description ?? '');
    const location = String(row.location ?? profile?.location ?? '').trim();
    const discount = String(row.discount ?? '').trim();
    const originalPrice = Number(row.original_price);
    const dealPrice = Number(row.deal_price);

    listings.push({
      offeringId,
      profileId,
      title,
      profileName: profileName || title,
      category,
      description,
      location,
      discount,
      originalPrice: Number.isFinite(originalPrice) ? originalPrice : null,
      dealPrice: Number.isFinite(dealPrice) ? dealPrice : null,
      image: resolveImageUrl(row.image ?? profile?.logo_url ?? profile?.image),
      lat: row.lat ?? profile?.lat ?? null,
      lng: row.lng ?? profile?.lng ?? null,
      phone: String(row.phone ?? profile?.phone ?? '').trim(),
      rating: Number(row.rating ?? profile?.rating) || 0,
      reviewCount: Number(row.review_count ?? profile?.review_count) || 0,
      profileDescription: stripHtml(profile?.description ?? row.business_description_raw ?? ''),
      dealPath: `/deal/${dealSlugFor(offeringId, title)}`,
      partnerPath: profileId
        ? `/partner/${partnerSlugFor(profileId, profileName || title)}`
        : null,
    });
  }
  return listings;
}

export function groupPartners(listings) {
  const byId = new Map();
  for (const listing of listings) {
    if (!listing.profileId) continue;
    let partner = byId.get(listing.profileId);
    if (!partner) {
      partner = {
        id: listing.profileId,
        name: listing.profileName,
        location: listing.location,
        description: listing.profileDescription || listing.description,
        category: listing.category,
        image: listing.image,
        phone: listing.phone,
        lat: listing.lat,
        lng: listing.lng,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        partnerPath: listing.partnerPath,
        offerings: [],
      };
      byId.set(listing.profileId, partner);
    }
    partner.offerings.push(listing);
    if (!partner.location && listing.location) partner.location = listing.location;
    if (!partner.description && listing.description) partner.description = listing.description;
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/** Parse "10% OFF" / "20%" → 10 / 20, or derive from prices. */
export function discountPercentFromListing(listing) {
  const fromText = String(listing.discount ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
  if (fromText) {
    const n = Number(fromText[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const deal = listing.dealPrice;
  const orig = listing.originalPrice;
  if (
    deal != null &&
    orig != null &&
    orig > 0 &&
    deal > 0 &&
    deal < orig
  ) {
    return Math.round(((orig - deal) / orig) * 1000) / 10;
  }
  return null;
}

export function offerDiscountDescription(listing) {
  const pct = discountPercentFromListing(listing);
  const deal = listing.dealPrice != null && listing.dealPrice > 0 ? formatVT(listing.dealPrice) : null;
  const orig =
    listing.originalPrice != null && listing.originalPrice > 0
      ? formatVT(listing.originalPrice)
      : null;
  const discountLabel = String(listing.discount ?? '').trim();

  const parts = [];
  if (discountLabel) {
    parts.push(`${discountLabel} for StikmNek Pass holders`);
  } else if (pct != null) {
    parts.push(`${pct}% off for StikmNek Pass holders`);
  } else {
    parts.push('Special StikmNek Pass holder pricing');
  }

  if (deal && orig && listing.dealPrice < listing.originalPrice) {
    parts.push(`(pass price ${deal}; was ${orig})`);
  } else if (deal) {
    parts.push(`(pass price ${deal})`);
  }

  return parts.join(' ');
}

export function offerJsonLd(listing) {
  const pct = discountPercentFromListing(listing);
  const offer = {
    '@type': 'Offer',
    name: listing.title,
    description: offerDiscountDescription(listing),
    url: `${SITE_ORIGIN}${listing.dealPath}`,
    priceCurrency: 'VUV',
    availability: 'https://schema.org/InStock',
  };

  if (listing.dealPrice != null && listing.dealPrice > 0) {
    offer.price = String(listing.dealPrice);
  }
  if (pct != null) {
    offer.discount = `${pct}%`;
  }

  const specs = [];
  if (listing.dealPrice != null && listing.dealPrice > 0) {
    const saleSpec = {
      '@type': 'UnitPriceSpecification',
      priceType: 'https://schema.org/SalePrice',
      price: String(listing.dealPrice),
      priceCurrency: 'VUV',
    };
    if (pct != null) {
      saleSpec.name = 'StikmNek Pass price';
      saleSpec.description = `${pct}% off for StikmNek Pass holders`;
    }
    specs.push(saleSpec);
  }
  if (
    listing.originalPrice != null &&
    listing.originalPrice > 0 &&
    (listing.dealPrice == null ||
      listing.dealPrice <= 0 ||
      listing.originalPrice > listing.dealPrice)
  ) {
    specs.push({
      '@type': 'UnitPriceSpecification',
      priceType: 'https://schema.org/ListPrice',
      price: String(listing.originalPrice),
      priceCurrency: 'VUV',
      name: 'Regular price',
    });
  }
  if (specs.length) offer.priceSpecification = specs;

  return offer;
}

function providerJsonLd(listingOrPartner) {
  const category = listingOrPartner.category;
  const name =
    listingOrPartner.profileName ||
    listingOrPartner.name ||
    listingOrPartner.title ||
    'StikmNek partner';
  const provider = {
    '@type': providerTypeForCategory(category),
    name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: listingOrPartner.location || 'Port Vila',
      addressCountry: 'VU',
    },
  };
  if (listingOrPartner.phone) provider.telephone = listingOrPartner.phone;
  if (listingOrPartner.partnerPath) {
    provider.url = `${SITE_ORIGIN}${listingOrPartner.partnerPath}`;
  }
  if (listingOrPartner.lat != null && listingOrPartner.lng != null) {
    provider.geo = {
      '@type': 'GeoCoordinates',
      latitude: listingOrPartner.lat,
      longitude: listingOrPartner.lng,
    };
  }
  return provider;
}

function placeAddressAndContact(data, listingOrPartner) {
  data.address = {
    '@type': 'PostalAddress',
    addressLocality: listingOrPartner.location || 'Port Vila',
    addressCountry: 'VU',
  };
  if (listingOrPartner.phone) data.telephone = listingOrPartner.phone;
  if (listingOrPartner.lat != null && listingOrPartner.lng != null) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: listingOrPartner.lat,
      longitude: listingOrPartner.lng,
    };
  }
  if (listingOrPartner.rating > 0 && listingOrPartner.reviewCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(listingOrPartner.rating),
      reviewCount: String(listingOrPartner.reviewCount),
    };
  }
}

function partnerSchemaType(category) {
  if (category === 'tours' || category === 'activities') return 'TravelAgency';
  return SCHEMA_TYPE_BY_CATEGORY[category] || 'LocalBusiness';
}

/**
 * Per-deal or partner-page JSON-LD.
 * Tours/activities/transportation → TouristTrip + provider.
 * Dining/spa/stays/shopping → LocalBusiness subtype with makesOffer.
 * Descriptions are never truncated mid-sentence.
 */
export function localBusinessJsonLd(listingOrPartner, { isPartner = false } = {}) {
  const category = listingOrPartner.category;
  const name = isPartner ? listingOrPartner.name : listingOrPartner.title;
  const path = isPartner ? listingOrPartner.partnerPath : listingOrPartner.dealPath;
  const description =
    stripHtml(listingOrPartner.description || '') ||
    `${name} — local Vanuatu deals on StikmNek`;

  if (!isPartner && TOURIST_TRIP_CATEGORIES.has(category)) {
    return {
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name,
      description,
      url: `${SITE_ORIGIN}${path}`,
      image: listingOrPartner.image || DEFAULT_OG_IMAGE,
      provider: providerJsonLd(listingOrPartner),
      offers: offerJsonLd(listingOrPartner),
    };
  }

  const data = {
    '@context': 'https://schema.org',
    '@type': isPartner ? partnerSchemaType(category) : schemaTypeForCategory(category),
    name,
    description,
    url: `${SITE_ORIGIN}${path}`,
    image: listingOrPartner.image || DEFAULT_OG_IMAGE,
  };
  placeAddressAndContact(data, listingOrPartner);

  if (isPartner && Array.isArray(listingOrPartner.offerings)) {
    data.makesOffer = listingOrPartner.offerings.map(offerJsonLd);
  } else {
    data.makesOffer = offerJsonLd(listingOrPartner);
  }
  return data;
}

/** Unused UUID helper kept for future slug validation. */
export function looksLikeUuid(value) {
  return UUID_RE.test(String(value ?? ''));
}

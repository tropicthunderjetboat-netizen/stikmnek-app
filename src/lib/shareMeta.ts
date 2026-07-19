import type { Business } from '@/data/businesses';
import { listingOfferBadgeText } from '@/data/businesses';
import { absoluteDealUrl } from '@/lib/dealUrl';
import { getBusinessImageUrl } from '@/lib/utils';
import { SUPABASE_URL } from '@/lib/supabase';

/** Site-relative fallback when a listing has no usable primary image. */
export const DEFAULT_OG_IMAGE_PATH = '/og-facebook-preview.jpg';

const SITE_ORIGIN_FALLBACK = 'https://www.stikmnek.com';

export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return SITE_ORIGIN_FALLBACK;
}

/** Turn a path or absolute URL into an absolute URL (required for OG crawlers). */
export function absoluteAssetUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl ?? '').trim();
  if (!raw) return `${siteOrigin()}${DEFAULT_OG_IMAGE_PATH}`;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${siteOrigin()}${path}`;
}

/**
 * Resolve a listing image for Open Graph / Twitter cards.
 * Falls back to `/og-facebook-preview.jpg` when missing or placeholder-only.
 */
export function resolveDealOgImageUrl(
  imageOrPath: string | null | undefined,
  supabaseUrl: string = SUPABASE_URL,
): string {
  const resolved = getBusinessImageUrl(imageOrPath, supabaseUrl).trim();
  if (
    resolved &&
    !resolved.includes('placeholder') &&
    (resolved.startsWith('http://') || resolved.startsWith('https://') || resolved.startsWith('/'))
  ) {
    return absoluteAssetUrl(resolved);
  }
  return absoluteAssetUrl(DEFAULT_OG_IMAGE_PATH);
}

export type DealShareMeta = {
  title: string;
  description: string;
  image: string;
  url: string;
};

function plainListingBlurb(business: Business): string {
  return String(business.description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build share / OG meta for a specific deal listing. */
export function buildDealShareMeta(business: Business): DealShareMeta {
  const offer = listingOfferBadgeText(business) || String(business.discount || '').trim();
  const location = String(business.location || '').trim();
  const blurb = plainListingBlurb(business);

  const title = offer
    ? `${business.name} · ${offer} | StikmNek`
    : `${business.name} · StikmNek`;

  const lead = offer
    ? `${offer} at ${business.name}${location ? ` · ${location}` : ''}.`
    : `${business.name}${location ? ` in ${location}` : ''} on StikmNek.`;

  const description = `${lead}${blurb ? ` ${blurb}` : ' Vanuatu’s local deals & experiences.'}`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  return {
    title,
    description,
    image: resolveDealOgImageUrl(business.image),
    url: absoluteDealUrl(business),
  };
}

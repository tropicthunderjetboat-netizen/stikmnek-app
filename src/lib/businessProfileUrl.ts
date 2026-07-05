/**
 * Shareable business profile URLs: `/partner/<readable-name>-<profileBusinessId>`.
 *
 * Opens a public page with all live deals for that company — one link owners can
 * paste in Facebook comments without picking a specific listing each time.
 *
 * Legacy `/host/...` links still resolve (same slug format).
 */
import { offeringIdFromDealSlug, slugifyText } from '@/lib/dealUrl';

export const PARTNER_PATH_PREFIX = '/partner/';

/** @deprecated Use PARTNER_PATH_PREFIX — kept for legacy link resolution */
export const HOST_PATH_PREFIX = '/host/';

const GENERIC_PROFILE_SLUGS = new Set([
  'your-business',
  'your-businesses',
  'business',
  'my-business',
  'company',
  'offer',
  'listing',
]);

function isGenericProfileSlugName(name: string): boolean {
  const slug = slugifyText(name);
  if (!slug) return true;
  return GENERIC_PROFILE_SLUGS.has(slug);
}

export function businessProfileSlugFor(
  profile: Pick<{ id: string; name: string }, 'id' | 'name'>,
): string {
  const id = String(profile.id ?? '').trim();
  if (!id) return '';
  const words = slugifyText(String(profile.name ?? '').trim());
  if (!words || isGenericProfileSlugName(profile.name)) {
    return id;
  }
  return `${words}-${id}`;
}

export function businessProfilePath(
  profile: Pick<{ id: string; name: string }, 'id' | 'name'>,
): string {
  return `${PARTNER_PATH_PREFIX}${businessProfileSlugFor(profile)}`;
}

export function absoluteBusinessProfileUrl(
  profile: Pick<{ id: string; name: string }, 'id' | 'name'>,
): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.stikmnek.com';
  return `${origin}${businessProfilePath(profile)}`;
}

/** Extract the profile business UUID from a partner/host slug, or null if none is present. */
export function businessIdFromPartnerSlug(slug: string): string | null {
  const trimmed = String(slug ?? '').trim();
  if (!trimmed) return null;
  const fromSuffix = offeringIdFromDealSlug(trimmed);
  if (fromSuffix) return fromSuffix;
  // Slug may be UUID-only (no readable prefix).
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/** @deprecated Use businessIdFromPartnerSlug */
export const businessIdFromHostSlug = businessIdFromPartnerSlug;

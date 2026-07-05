/**
 * Shareable business profile URLs: `/host/<readable-name>-<profileBusinessId>`.
 *
 * Opens a public page with all live deals for that company — one link owners can
 * paste in Facebook comments without picking a specific listing each time.
 */
import { offeringIdFromDealSlug, slugifyText } from '@/lib/dealUrl';

export const HOST_PATH_PREFIX = '/host/';

export function businessProfileSlugFor(
  profile: Pick<{ id: string; name: string }, 'id' | 'name'>,
): string {
  const id = String(profile.id ?? '').trim();
  const words = slugifyText(profile.name ?? '');
  return words ? `${words}-${id}` : id;
}

export function businessProfilePath(
  profile: Pick<{ id: string; name: string }, 'id' | 'name'>,
): string {
  return `${HOST_PATH_PREFIX}${businessProfileSlugFor(profile)}`;
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

/** Extract the profile business UUID from a host slug, or null if none is present. */
export function businessIdFromHostSlug(slug: string): string | null {
  return offeringIdFromDealSlug(slug);
}

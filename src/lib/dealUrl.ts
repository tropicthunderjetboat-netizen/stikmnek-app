/**
 * Shareable per-deal URLs: `/deal/<readable-title>-<offeringId>`.
 *
 * The readable prefix is cosmetic (nice for Facebook / WhatsApp); the trailing
 * offering UUID is the source of truth we resolve against, so renaming a deal
 * never breaks an already-shared link.
 */
import type { Business } from '@/data/businesses';

export const DEAL_PATH_PREFIX = '/deal/';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TRAILING_UUID_RE = new RegExp(`(${UUID_RE.source})$`, 'i');

/** Lowercase, ASCII, hyphen-separated. Strips accents and punctuation. */
export function slugifyText(input: string): string {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** `<slugified-name>-<offeringId>` (falls back to the id alone when the name is empty). */
export function dealSlugForBusiness(b: Pick<Business, 'id' | 'name'>): string {
  const id = String(b.id ?? '').trim();
  const words = slugifyText(b.name ?? '');
  return words ? `${words}-${id}` : id;
}

/** Relative path: `/deal/<slug>`. */
export function dealPathForBusiness(b: Pick<Business, 'id' | 'name'>): string {
  return `${DEAL_PATH_PREFIX}${dealSlugForBusiness(b)}`;
}

/** Absolute URL for sharing (Share button, social previews). */
export function absoluteDealUrl(b: Pick<Business, 'id' | 'name'>): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.stikmnek.com';
  return `${origin}${dealPathForBusiness(b)}`;
}

/** Extract the offering UUID from a deal slug, or null if none is present. */
export function offeringIdFromDealSlug(slug: string): string | null {
  const m = String(slug ?? '').match(TRAILING_UUID_RE);
  return m ? m[1] : null;
}

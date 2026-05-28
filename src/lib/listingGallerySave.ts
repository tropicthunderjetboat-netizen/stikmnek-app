import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchApprovedPhotosForOffering } from '@/lib/fetchApprovedPhotosForOffering';
import { getPhotoDisplayUrl } from '@/lib/utils';

/** Public Storage URL — not blob/data preview. */
export function isPersistedPhotoUrl(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (u.startsWith('blob:') || u.startsWith('data:')) return false;
  return u.startsWith('http://') || u.startsWith('https://');
}

export function normalizeGalleryPhotoUrl(url: string): string {
  return String(url || '').trim().split('?')[0] || '';
}

export function galleryPhotoUrlKey(urls: string[]): string {
  return [...urls]
    .map(normalizeGalleryPhotoUrl)
    .filter(Boolean)
    .sort()
    .join('\n');
}

export type GalleryPhotoPayload = { url: string; filePath?: string; isMain?: boolean };

export function buildGalleryPayloadFromPhotos(
  photos: Array<{ url?: string; filePath?: string }>,
): GalleryPhotoPayload[] {
  return photos
    .map((p, index) => ({
      url: String(p.url || '').trim(),
      filePath: String(p.filePath || '').trim() || undefined,
      isMain: index === 0,
    }))
    .filter((p) => isPersistedPhotoUrl(p.url));
}

export function galleryPhotosChanged(
  currentUrls: string[],
  baselineUrls: Iterable<string>,
): boolean {
  const current = currentUrls.filter(isPersistedPhotoUrl);
  const baseline = [...baselineUrls].filter(isPersistedPhotoUrl);
  if (current.length !== baseline.length) return true;
  return galleryPhotoUrlKey(current) !== galleryPhotoUrlKey(baseline);
}

/** After edge sync, confirm approved rows in DB match what we sent. */
export async function verifyGallerySavedCount(args: {
  client: SupabaseClient;
  profileBusinessId: string;
  offeringId: string;
  supabaseUrl: string;
  expectedCount: number;
}): Promise<{ savedCount: number; savedUrls: string[] }> {
  const rows = await fetchApprovedPhotosForOffering(
    args.client,
    args.profileBusinessId,
    args.offeringId,
    args.supabaseUrl,
  );
  const savedUrls = rows
    .map((r) => getPhotoDisplayUrl(r, args.supabaseUrl) || String(r.url || '').trim())
    .filter(isPersistedPhotoUrl);
  return { savedCount: savedUrls.length, savedUrls };
}

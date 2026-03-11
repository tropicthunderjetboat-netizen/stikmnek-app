import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as Vanuatu Vatu (VT) currency.
 * e.g. formatVT(5500) => "VT 5,500"
 * e.g. formatVT(45000) => "VT 45,000"
 */
export function formatVT(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'VT 0';
  return `VT ${Math.round(num).toLocaleString('en-US')}`;
}

/**
 * Resolve display URL for a business photo.
 * Uses url if valid; otherwise builds public URL from file_path (Supabase storage).
 */
export function getPhotoDisplayUrl(
  photo: { url?: string; file_path?: string },
  supabaseUrl: string
): string {
  const u = photo?.url?.trim();
  if (u && (u.startsWith('http://') || u.startsWith('https://'))) return u;
  const fp = photo?.file_path?.trim();
  if (fp) {
    const base = supabaseUrl.replace(/\/$/, '');
    return `${base}/storage/v1/object/public/business-photos/${fp.replace(/^\//, '')}`;
  }
  return '';
}

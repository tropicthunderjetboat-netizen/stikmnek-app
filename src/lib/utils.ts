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

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?.*)?$/i;

/**
 * Resolve business image URL for display.
 * Handles: full URLs, Supabase storage paths (business-photos or images bucket).
 * Skips building storage URLs for non-image paths (e.g. column names, API paths).
 */
export function getBusinessImageUrl(
  imageOrPath: string | undefined | null,
  supabaseUrl: string
): string {
  const val = (imageOrPath || '').trim();
  if (!val) return '';
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  // Allow storage paths with folders even without a file extension (e.g. UUID keys).
  if (!IMAGE_EXT.test(val) && !val.includes('/')) return '';
  const base = supabaseUrl.replace(/\/$/, '');
  const path = val.replace(/^\//, '');
  const bucket = path.startsWith('images/') ? 'images' : 'business-photos';
  const storagePath = path.startsWith('images/') ? path.slice(7) : path;
  return `${base}/storage/v1/object/public/${bucket}/${storagePath}`;
}

/** WhatsApp from app model (`whatsappNumber`) or DB column (`whatsapp_number`). */
export function getBusinessWhatsAppRaw(biz: {
  whatsappNumber?: string | null;
  whatsapp_number?: string | null;
}): string {
  return String(biz.whatsappNumber ?? biz.whatsapp_number ?? '').trim();
}

/** Digits only for `wa.me` links (international, no +). */
export function digitsForWaMe(raw: string): string {
  return raw.replace(/\D/g, '');
}

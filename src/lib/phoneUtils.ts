/** Strip to digits only (for validation / export). */
export function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/**
 * Normalize a Vanuatu-oriented number for WhatsApp export (E.164-style).
 * e.g. "7724354" → "+6787724354", "+678 772 4354" → "+6787724354"
 */
export function normalizeWhatsAppForExport(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';

  const digits = digitsOnly(raw);
  if (!digits) return raw;

  if (raw.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.startsWith('678') && digits.length >= 10) {
    return `+${digits}`;
  }
  if (digits.length === 7) {
    return `+678${digits}`;
  }
  return `+${digits}`;
}

/** wa.me link without leading + in path segment. */
export function whatsAppChatUrl(value: string): string {
  const normalized = normalizeWhatsAppForExport(value);
  const digits = digitsOnly(normalized);
  return digits ? `https://wa.me/${digits}` : '';
}

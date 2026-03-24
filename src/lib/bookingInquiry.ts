/**
 * Professional StikmNek booking inquiry copy for WhatsApp (wa.me) links.
 * Text is URL-encoded by buildBookingInquiryWhatsAppUrl via encodeURIComponent.
 */

export type BookingInquiryMessageParams = {
  businessName: string;
  /** ISO YYYY-MM-DD, a display string, or e.g. "To be confirmed" for listing shortcuts */
  visitDate: string;
  adults: number;
  children: number;
  infants?: number;
  /** Pre-formatted, e.g. from formatVT(totalDeal) */
  estimatedPriceWithDiscount: string;
  userName: string;
};

/** Format YYYY-MM-DD for human-readable message lines; passthrough for non-ISO or TBC. */
export function formatVisitDateForMessage(visitDate: string): string {
  const t = (visitDate || '').trim();
  if (!t || t === 'To be confirmed') return 'To be confirmed';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }
  return t;
}

export function buildBookingInquiryMessage(p: BookingInquiryMessageParams): string {
  const business = (p.businessName || 'there').trim();
  const dateLabel = formatVisitDateForMessage(p.visitDate);
  const a = Math.max(0, Math.floor(Number(p.adults) || 0));
  const c = Math.max(0, Math.floor(Number(p.children) || 0));
  const inf = Math.max(0, Math.floor(Number(p.infants ?? 0) || 0));
  let party = `${a} Adults, ${c} Children`;
  if (inf > 0) party += `, ${inf} Infants`;
  const price = (p.estimatedPriceWithDiscount || 'VT 0').trim();
  const signer = (p.userName || 'Guest').trim();

  return [
    `Hi ${business},`,
    'I found you on StikmNek and would like to inquire about a booking.',
    `📅 *Date:* ${dateLabel}`,
    `👥 *Party:* ${party}`,
    `💰 *Estimated Price (with discount):* ${price}`,
    'Is this date available?',
    'Thanks,',
    signer,
  ].join('\n');
}

/**
 * @param waDigits — digits-only international number (no +), suitable for wa.me/{digits}
 */
export function buildBookingInquiryWhatsAppUrl(
  waDigits: string,
  p: BookingInquiryMessageParams,
): string {
  const digits = String(waDigits || '').replace(/\D/g, '');
  if (digits.length < 5) return '';
  const text = buildBookingInquiryMessage(p);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

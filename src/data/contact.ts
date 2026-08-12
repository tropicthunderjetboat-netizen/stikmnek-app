/** Public support / contact inbox (mailto links, legal pages, SEO). */
export const SUPPORT_EMAIL = 'stikmnek@gmail.com';

/**
 * Outreach WhatsApp for concierge business onboarding (digits only, e.g. 6787766107).
 * Set this to enable "Message our team" links on /for-business. Leave empty to hide the button.
 * Public UI must say StikmNek team / our team — never a personal name.
 */
export const OUTREACH_WHATSAPP = '';

/** Short concierge capture — works on low data, no login required. */
export const CONCIERGE_CAPTURE_MESSAGE = `Perfect — I can set up your StikmNek listing for you.

What we need is a short description of your business, your deal for tourists, and a few photos.

A deal can be something like:
- 10% off
- 20% off
- free drink with a meal
- free dessert
- kids free

Just send these 5 things on WhatsApp:

1. Business name
2. Your deal for tourists (example: 20% off food, free coffee with breakfast, kids free)
3. Your location
4. Your phone or WhatsApp number
5. 3 photos

I'll create the listing for you — no signup needed.`;

export function supportMailtoUrl(subject?: string): string {
  const base = `mailto:${SUPPORT_EMAIL}`;
  if (!subject) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}

export function outreachWhatsAppUrl(text?: string): string | null {
  const digits = OUTREACH_WHATSAPP.replace(/\D/g, '');
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

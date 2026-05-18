/** Public support / contact inbox (mailto links, legal pages, SEO). */
export const SUPPORT_EMAIL = 'stikmnek@gmail.com';

export function supportMailtoUrl(subject?: string): string {
  const base = `mailto:${SUPPORT_EMAIL}`;
  if (!subject) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}

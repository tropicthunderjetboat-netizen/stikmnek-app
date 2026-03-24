import DOMPurify from 'dompurify';

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
  ],
  ALLOWED_ATTR: [] as string[],
};

export function sanitizeBusinessDescriptionHtml(html: string): string {
  return DOMPurify.sanitize(html || '', SANITIZE_CONFIG);
}

/** Plain text for share, clipboard, CSV, and character limits. */
export function plainTextFromHtml(html: string): string {
  if (!html || !String(html).trim()) return '';
  const el = document.createElement('div');
  el.innerHTML = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  return (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function hasMeaningfulDescriptionContent(html: string): boolean {
  return plainTextFromHtml(html).length > 0;
}

/** True if the string likely contains HTML tags (vs legacy plain text). */
export function looksLikeRichDescriptionHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test((s || '').trim());
}

import DOMPurify from 'dompurify';

/** Max plain-text length (after stripping HTML) for business descriptions across forms and API payloads. */
export const BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX = 2000;

/** Plain-text length at or above which the UI shows a “near limit” hint (~90% of max). */
export const BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT = Math.floor(
  BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX * 0.9,
);

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

/** Cap HTML length for RPC / Edge JSON payloads (Postgres TEXT is huge; huge strings still slow the API). */
export const BUSINESS_DESCRIPTION_HTML_STORAGE_MAX = 120_000;

export function trimBusinessDescriptionHtmlForStorage(html: string): string {
  const s = html ?? '';
  if (s.length <= BUSINESS_DESCRIPTION_HTML_STORAGE_MAX) return s;
  return s.slice(0, BUSINESS_DESCRIPTION_HTML_STORAGE_MAX);
}

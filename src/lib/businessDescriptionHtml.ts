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

/**
 * Detects SQL / migration dumps accidentally pasted into `description` (plain or HTML-wrapped).
 * Never render these on dashboards or public pages.
 */
export function looksLikeSqlOrTechnicalDump(s: string): boolean {
  const raw = (s || '').trim();
  if (raw.length < 24) return false;
  const t = plainTextFromHtml(raw) || raw;
  if (t.length < 24) return false;
  const u = t.toUpperCase();
  let score = 0;
  if (u.includes('ALTER TABLE')) score += 2;
  if (u.includes('CREATE POLICY')) score += 2;
  if (u.includes('ROW LEVEL SECURITY')) score += 2;
  if (u.includes('GRANT SELECT')) score += 2;
  if (u.includes('ENABLE ROW')) score += 1;
  if (u.includes('DROP POLICY')) score += 2;
  if (u.includes('CREATE TABLE')) score += 1;
  if (u.includes('REFERENCES PUBLIC.')) score += 1;
  if (u.includes('USING (') && u.includes('SELECT')) score += 1;
  if (/--\s*(BUSINESS_|PUBLIC\.|ENSURE)/i.test(t)) score += 1;
  return score >= 3;
}

import { next } from '@vercel/edge';

/**
 * Edge Middleware — rich link previews for shared deals.
 *
 * Social crawlers (Facebook, WhatsApp, Twitter/X, LinkedIn, Slack, Discord, etc.)
 * don't run JavaScript, so they only ever see the static tags in `index.html`.
 * For `/deal/:slug` we intercept *crawler* requests, fetch the deal from Supabase,
 * and return a tiny HTML document with per-deal Open Graph / Twitter tags.
 *
 * Real browsers fall through to `next()` and get the normal SPA (which then renders
 * its own client-side <Helmet> tags). This keeps the app behaviour unchanged for humans.
 */
export const config = {
  matcher: '/deal/:path*',
};

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://hbaflbmfptobyfqbudrt.supabase.co';

// Public anon key (RLS-guarded, safe to ship — same key already in the client bundle).
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYWZsYm1mcHRvYnlmcWJ1ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTMwMTIsImV4cCI6MjA4NzI4OTAxMn0.Ukdx0PKI6cpoEdKGcV4LgcgumkhDIfiIXbmVMgbqKL0';

const DEFAULT_IMAGE = 'https://www.stikmnek.com/og-facebook-preview.jpg?v=20260720';

const CRAWLER_RE =
  /facebookexternalhit|facebookcatalog|facebot|twitterbot|whatsapp|slackbot|slack-imgproxy|linkedinbot|discordbot|telegrambot|pinterest|redditbot|googlebot|bingbot|applebot|embedly|quora link preview|outbrain|vkshare|skypeuripreview|nuzzel|google-structured-data-testing-tool|bitlybot|tumblr/i;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function offeringIdFromSlug(slug: string): string | null {
  const m = slug.match(new RegExp(`(${UUID_RE.source})$`, 'i'));
  return m ? m[1] : null;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Mirror of `getBusinessImageUrl` for the storage-path case (crawler-side, no Vite). */
function resolveImageUrl(raw: string): string {
  const val = (raw || '').trim();
  if (!val) return DEFAULT_IMAGE;
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  const base = SUPABASE_URL.replace(/\/$/, '');
  const path = val.replace(/^\//, '');
  const bucket = path.startsWith('images/') ? 'images' : 'business-photos';
  const storagePath = path.startsWith('images/') ? path.slice(7) : path;
  return `${base}/storage/v1/object/public/${bucket}/${storagePath}`;
}

type DealMeta = { title: string; description: string; image: string };

async function fetchDeal(offeringId: string): Promise<DealMeta | null> {
  const base = SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  };

  const sources = [
    `${base}/rest/v1/business_listings_view?id=eq.${offeringId}&select=title,description,image,profile_name&limit=1`,
    `${base}/rest/v1/business_offerings?id=eq.${offeringId}&select=title,description,image&limit=1`,
  ];

  for (const url of sources) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const rows = (await res.json()) as Record<string, unknown>[];
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) continue;
      const rawTitle = String(row.title ?? '').trim();
      const profileName = String(row.profile_name ?? '').trim();
      const title =
        rawTitle && rawTitle.toLowerCase() !== 'offer' && rawTitle.toLowerCase() !== 'main offer'
          ? rawTitle
          : profileName || 'Deal on StikmNek';
      const description =
        String(row.description ?? '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200) || `${title} — Vanuatu’s local deals & experiences on StikmNek.`;
      return { title, description, image: resolveImageUrl(String(row.image ?? '')) };
    } catch {
      // Try next source.
    }
  }
  return null;
}

function renderHtml(meta: DealMeta, canonicalUrl: string): string {
  const title = escapeHtml(`${meta.title} · StikmNek`);
  const description = escapeHtml(meta.description);
  const image = escapeHtml(meta.image);
  const url = escapeHtml(canonicalUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="StikmNek" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:secure_url" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
</head>
<body>
<h1>${escapeHtml(meta.title)}</h1>
<p>${description}</p>
<p><a href="${url}">View this deal on StikmNek</a></p>
</body>
</html>`;
}

export default async function middleware(request: Request): Promise<Response> {
  const ua = request.headers.get('user-agent') || '';

  // Real browsers → serve the SPA unchanged.
  if (!CRAWLER_RE.test(ua)) {
    return next();
  }

  const url = new URL(request.url);
  const slug = decodeURIComponent(url.pathname.replace(/^\/deal\//, '').replace(/\/$/, ''));
  const offeringId = offeringIdFromSlug(slug);

  // No resolvable id → let the crawler see the default site tags.
  if (!offeringId) {
    return next();
  }

  const meta = await fetchDeal(offeringId);
  if (!meta) {
    return next();
  }

  const canonicalUrl = `${url.origin}${url.pathname}`;
  return new Response(renderHtml(meta, canonicalUrl), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Cache previews at the edge for 5 min; allow stale serving while revalidating.
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}

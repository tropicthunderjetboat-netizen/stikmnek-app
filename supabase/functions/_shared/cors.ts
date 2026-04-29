/**
 * Shared CORS for Edge Functions.
 * Echoes request Origin when it matches CORS_ALLOWED_ORIGINS (comma-separated).
 * If unset, Allow-Origin is * (permissive).
 * Includes apex ↔ www tolerance so https://stikmnek.com and https://www.stikmnek.com
 * both work when only one is listed (reduces browser CORS failures after domain changes).
 */

/**
 * Vercel preview deployments (*.vercel.app). Any preview hostname is allowed when the
 * allowlist includes a stikmnek.com site — preview URLs vary (`stikmnek-…`, `*-git-*-…`, team slug, etc.).
 */
function isVercelPreviewOrigin(origin: string): boolean {
  try {
    return new URL(origin).hostname.toLowerCase().endsWith('.vercel.app');
  } catch {
    return false;
  }
}

function originMatchesAllowList(origin: string, allowed: string[]): boolean {
  const o = origin.trim();
  if (!o) return false;
  if (allowed.includes(o)) return true;
  try {
    const u = new URL(o);
    const host = u.hostname.toLowerCase();
    const noWww = host.startsWith('www.') ? host.slice(4) : host;
    const withWww = host.startsWith('www.') ? host : `www.${host}`;
    const altA = `${u.protocol}//${noWww}${u.port ? `:${u.port}` : ''}`;
    const altB = `${u.protocol}//${withWww}${u.port ? `:${u.port}` : ''}`;
    let altAOrigin = '';
    let altBOrigin = '';
    try {
      altAOrigin = new URL(altA).origin;
    } catch {
      /* ignore */
    }
    try {
      altBOrigin = new URL(altB).origin;
    } catch {
      /* ignore */
    }
    return allowed.some((a) => {
      try {
        const x = new URL(a);
        return (
          x.origin === u.origin ||
          (altAOrigin && x.origin === altAOrigin) ||
          (altBOrigin && x.origin === altBOrigin)
        );
      } catch {
        return a === o;
      }
    });
  } catch {
    return false;
  }
}

export function getSafeCorsHeaders(req: Request): Record<string, string> {
  const raw = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '').trim();
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') ?? '';
  const base: Record<string, string> = {
    // NOTE: keep in sync with browser preflight `Access-Control-Request-Headers`.
    // Supabase clients commonly send: authorization, apikey, content-type, x-client-info.
    // We include a few extra safe headers to avoid brittle CORS failures.
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-supabase-client',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    // Avoid CDN caching one origin's CORS headers for another origin.
    Vary: 'Origin',
  };
  if (allowed.length === 0) {
    base['Access-Control-Allow-Origin'] = '*';
    return base;
  }
  if (origin && originMatchesAllowList(origin, allowed)) {
    base['Access-Control-Allow-Origin'] = origin;
  } else if (
    origin &&
    isVercelPreviewOrigin(origin) &&
    allowed.some((a) => /stikmnek\.com/i.test(a))
  ) {
    // Production allowlist is set, but the request is from a Vercel preview — echo Origin so
    // browser credentialed calls (Authorization + cookies) pass CORS.
    base['Access-Control-Allow-Origin'] = origin;
  } else {
    base['Access-Control-Allow-Origin'] = allowed[0]!;
  }
  return base;
}

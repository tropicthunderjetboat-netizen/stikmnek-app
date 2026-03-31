/**
 * Shared CORS for Edge Functions.
 * Echoes request Origin when it matches CORS_ALLOWED_ORIGINS (comma-separated).
 * If unset, Allow-Origin is * (permissive).
 * Includes apex ↔ www tolerance so https://stikmnek.com and https://www.stikmnek.com
 * both work when only one is listed (reduces browser CORS failures after domain changes).
 */

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
  if (allowed.length === 0) {
    base['Access-Control-Allow-Origin'] = '*';
    return base;
  }
  if (origin && originMatchesAllowList(origin, allowed)) {
    base['Access-Control-Allow-Origin'] = origin;
  } else {
    base['Access-Control-Allow-Origin'] = allowed[0]!;
  }
  return base;
}

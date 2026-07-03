/**
 * Shared CORS for Edge Functions.
 * Echoes request Origin when it matches CORS_ALLOWED_ORIGINS (comma-separated).
 * If unset, Allow-Origin is * (permissive).
 * Includes apex ↔ www tolerance so https://stikmnek.com and https://www.stikmnek.com
 * both work when only one is listed (reduces browser CORS failures after domain changes).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

/**
 * `http://localhost:*`, `127.0.0.1`, `::1` — typical Vite/Next dev servers.
 * Browsers send a real Origin for these; they cannot be spoofed by random websites,
 * so echoing the origin is safe and avoids CORS failures when production
 * `CORS_ALLOWED_ORIGINS` omits every dev port.
 */
function isLocalMachineDevOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
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
  } else if (origin && isLocalMachineDevOrigin(origin)) {
    // Dev: allowlist often lists only production domains; wrong static Allow-Origin breaks fetch()
    // with a generic network error (see FunctionsFetchError in supabase-js).
    base['Access-Control-Allow-Origin'] = origin;
  } else {
    base['Access-Control-Allow-Origin'] = allowed[0]!;
  }
  return base;
}

// ─── Edge auth helpers (JWT validation via anon key) ───

const BEARER_PREFIX = /^Bearer\s+/i;

export type EdgeAuthUser = { id: string; email?: string | null };

export function resolveAnonKey(): { key: string; source: string } | null {
  const rawAppAnon = (Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '').trim();
  const rawSupabaseAnon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
  const rawSupabaseAnonPublic = (Deno.env.get('SUPABASE_ANON_KEY_PUBLIC') ?? '').trim();
  const key = rawAppAnon || rawSupabaseAnon || rawSupabaseAnonPublic;
  if (!key) return null;
  const source = rawAppAnon
    ? 'APP_SUPABASE_ANON_KEY'
    : rawSupabaseAnon
      ? 'SUPABASE_ANON_KEY'
      : 'SUPABASE_ANON_KEY_PUBLIC';
  return { key, source };
}

export function createEdgeClients(): {
  authClient: SupabaseClient;
  serviceClient: SupabaseClient;
  authClientKeySource: string;
  supabaseUrl: string;
} | null {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const anon = resolveAnonKey();
  if (!supabaseUrl || !serviceKey || !anon) return null;
  const authClient = createClient(supabaseUrl, anon.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { authClient, serviceClient, authClientKeySource: anon.source, supabaseUrl };
}

export function jsonResponse(req: Request, data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getSafeCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  req: Request,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse(req, { success: false, error: message, errorCode: status, ...extra }, status);
}

export async function getAuthUserFromRequest(
  authClient: SupabaseClient,
  req: Request,
): Promise<{ user: EdgeAuthUser } | { response: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.trim()) {
    return {
      response: errorResponse(req, 'Missing Authorization header', 401, { reason: 'missing_authorization' }),
    };
  }
  const token = authHeader.replace(BEARER_PREFIX, '').trim();
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) {
    return {
      response: errorResponse(req, 'Invalid or expired session', 401, {
        reason: 'auth_invalid',
        authError: error?.message ?? null,
      }),
    };
  }
  return { user: { id: user.id, email: user.email ?? null } };
}

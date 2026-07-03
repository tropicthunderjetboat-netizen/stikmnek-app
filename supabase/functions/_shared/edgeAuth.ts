import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from './cors.ts';

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

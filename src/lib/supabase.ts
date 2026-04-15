import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════
// SUPABASE CLIENT — Project StikmNek
// Project ref: hbaflbmfptobyfqbudrt
//
// These are PUBLIC credentials (anon key). Safe to commit.
// The anon key can only do what RLS policies allow.
// ═══════════════════════════════════════════════════════════════

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hbaflbmfptobyfqbudrt.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYWZsYm1mcHRvYnlmcWJ1ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTMwMTIsImV4cCI6MjA4NzI4OTAxMn0.Ukdx0PKI6cpoEdKGcV4LgcgumkhDIfiIXbmVMgbqKL0';


// ═══════════════════════════════════════════════════════════════
// DERIVED ENDPOINTS — These are the exact URLs the SDK calls.
// ═══════════════════════════════════════════════════════════════
export const SUPABASE_URL = supabaseUrl;

/**
 * Canonical site URL for auth redirects (reset password, email links).
 * Prefer env override; otherwise use current origin in browser; final fallback is production.
 */
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL && String(import.meta.env.VITE_SITE_URL).trim()) ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://www.stikmnek.com');

export const ENDPOINTS = {
  auth:      `${supabaseUrl}/auth/v1`,
  rest:      `${supabaseUrl}/rest/v1`,
  functions: `${supabaseUrl}/functions/v1`,
  storage:   `${supabaseUrl}/storage/v1`,
  realtime:  `${supabaseUrl}/realtime/v1`,
} as const;


/**
 * In-memory auth lock only (serializes refresh/getSession across async callers).
 * Navigator LockManager is NOT used: on production sites it often hits short timeouts
 * during visibility/refresh storms, which led to _recoverAndRefresh clearing the session
 * and cascading 401s on REST + Edge Functions (see runtime logs).
 */
const lockMap = new Map<string, Promise<any>>();

async function authSessionLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  const existing = lockMap.get(name);
  // Wait for the current lock holder *before* registering ourselves.
  // If we set our gate first, earlier callers can no longer clear the map entry,
  // and concurrent auth operations can overlap and deadlock the SDK/network.
  if (existing) {
    await Promise.race([
      existing,
      new Promise<void>((r) => setTimeout(r, acquireTimeout)),
    ]);
  }

  let resolveGate: (v?: any) => void;
  const gate = new Promise<void>((r) => {
    resolveGate = r;
  });
  lockMap.set(name, gate);

  try {
    return await fn();
  } finally {
    resolveGate!();
    if (lockMap.get(name) === gate) {
      lockMap.delete(name);
    }
  }
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    storageKey: 'stikmnek-auth',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    lock: authSessionLock,
    lockAcquireTimeout: 15000,
  },
});

/** Used by edgeInvoke / PhotoUploader for retry behavior when auth truly stalls. */
export const SESSION_TIMEOUT_MESSAGE =
  'Session retrieval timed out. Please refresh the page or sign in again.';

/**
 * Returns `{ Authorization: Bearer <jwt> }` when a session exists, or `{}` when signed out.
 */
export async function getEdgeAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}


// ═══════════════════════════════════════════════════════════════
// CONNECTION VERIFICATION
// ═══════════════════════════════════════════════════════════════

export interface ConnectionTestResult {
  subsystem: string;
  url: string;
  status: 'ok' | 'error' | 'not_deployed';
  httpStatus?: number;
  latencyMs: number;
  detail: string;
}

export async function verifyConnection(): Promise<ConnectionTestResult[]> {
  const results: ConnectionTestResult[] = [];

  // Auth endpoint
  try {
    const start = performance.now();
    const res = await fetch(`${ENDPOINTS.auth}/settings`, {
      headers: { apikey: supabaseKey },
    });
    const latency = Math.round(performance.now() - start);
    results.push({
      subsystem: 'Auth (GoTrue)',
      url: `${ENDPOINTS.auth}/settings`,
      status: res.ok ? 'ok' : 'error',
      httpStatus: res.status,
      latencyMs: latency,
      detail: res.ok
        ? `Auth service reachable (${latency}ms)`
        : `Auth returned HTTP ${res.status}`,
    });
  } catch (err: any) {
    results.push({
      subsystem: 'Auth (GoTrue)',
      url: `${ENDPOINTS.auth}/settings`,
      status: 'error',
      latencyMs: 0,
      detail: `Network error: ${err.message}`,
    });
  }

  // REST / PostgREST (database)
  try {
    const start = performance.now();
    const res = await fetch(`${ENDPOINTS.rest}/`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    const latency = Math.round(performance.now() - start);
    results.push({
      subsystem: 'Database (PostgREST)',
      url: `${ENDPOINTS.rest}/`,
      status: res.ok ? 'ok' : 'error',
      httpStatus: res.status,
      latencyMs: latency,
      detail: res.ok
        ? `Database API reachable (${latency}ms)`
        : `Database returned HTTP ${res.status}`,
    });
  } catch (err: any) {
    results.push({
      subsystem: 'Database (PostgREST)',
      url: `${ENDPOINTS.rest}/`,
      status: 'error',
      latencyMs: 0,
      detail: `Network error: ${err.message}`,
    });
  }

  // Storage
  try {
    const start = performance.now();
    const res = await fetch(`${ENDPOINTS.storage}/bucket`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    const latency = Math.round(performance.now() - start);
    results.push({
      subsystem: 'Storage',
      url: `${ENDPOINTS.storage}/bucket`,
      status: res.ok ? 'ok' : 'error',
      httpStatus: res.status,
      latencyMs: latency,
      detail: res.ok
        ? `Storage API reachable (${latency}ms)`
        : `Storage returned HTTP ${res.status}`,
    });
  } catch (err: any) {
    results.push({
      subsystem: 'Storage',
      url: `${ENDPOINTS.storage}/bucket`,
      status: 'error',
      latencyMs: 0,
      detail: `Network error: ${err.message}`,
    });
  }

  return results;
}

export async function isSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINTS.auth}/settings`, {
      headers: { apikey: supabaseKey },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}


// ═══════════════════════════════════════════════════════════════
// DIRECT PROFILE INSERT — NO EDGE FUNCTIONS
//
// Inserts a row into user_profiles using the authenticated user's
// JWT + the RLS policy "user_profiles_insert_own".
//
// Writes to ALL profile columns:
//   name, full_name, user_type  (user's new columns)
//   display_name, role          (original columns — kept in sync)
//
// If the trigger handle_new_user() already created the row,
// this function detects it and returns the existing profile.
// If the trigger row exists but is missing the new columns,
// it updates them.
// ═══════════════════════════════════════════════════════════════
export async function directProfileInsert(params: {
  userId: string;
  name: string;
  email: string;
  userType: 'tourist' | 'business' | 'admin';
}): Promise<{ success: boolean; profile?: any; error?: string }> {
  try {
    console.log('[directProfileInsert] START for:', params.email, 'userType:', params.userType);

    // Check if profile already exists (trigger may have created it)
    const { data: existing, error: selectError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', params.userId)
      .maybeSingle();

    if (selectError) {
      console.error('[directProfileInsert] SELECT error:', selectError.message, selectError.code);
    }

    if (existing) {
      console.log('[directProfileInsert] Profile already exists — checking if new columns need updating');

      // NEVER downgrade admin — admins may be set via SQL/Dashboard, not signup metadata
      const existingRole = (existing.role || existing.user_type || '').toLowerCase();
      if (existingRole === 'admin') {
        console.log('[directProfileInsert] Preserving existing admin role');
        return { success: true, profile: existing };
      }

      // If the trigger created the row but didn't populate name/full_name/user_type, update them.
      // Overwrite role/user_type when they don't match signup choice (but never downgrade admin).
      const needsUpdate =
        !existing.name ||
        !existing.full_name ||
        !existing.user_type ||
        (existing.role !== params.userType && existingRole !== 'admin');

      if (needsUpdate) {
        console.log('[directProfileInsert] Updating profile — userType:', params.userType);
        const { data: updated, error: updateError } = await supabase
          .from('user_profiles')
          .update({
            name: existing.name || params.name,
            full_name: existing.full_name || params.name,
            user_type: params.userType,
            display_name: existing.display_name || params.name,
            role: params.userType,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', params.userId)
          .select()
          .single();

        if (updateError) {
          console.warn('[directProfileInsert] UPDATE error:', updateError.message);
          return { success: true, profile: existing }; // Return existing anyway
        }
        console.log('[directProfileInsert] Updated successfully');
        return { success: true, profile: updated };
      }

      return { success: true, profile: existing };
    }

    // Profile doesn't exist — insert it directly
    const { data: inserted, error: insertError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: params.userId,
        name: params.name,
        full_name: params.name,
        user_type: params.userType,
        display_name: params.name,
        role: params.userType,
        email: params.email,
        phone: '',
        onboarding_complete: params.userType !== 'business',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[directProfileInsert] INSERT error:', insertError.message, insertError.code, insertError.details);

      // Conflict = trigger beat us to it — read the profile
      if (insertError.code === '23505') {
        console.log('[directProfileInsert] Conflict (trigger created it) — reading profile');
        const { data: conflictProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', params.userId)
          .maybeSingle();
        if (conflictProfile) {
          return { success: true, profile: conflictProfile };
        }
      }

      return { success: false, error: `DB insert failed: ${insertError.message} (code: ${insertError.code})` };
    }

    console.log('[directProfileInsert] SUCCESS — profile created directly in DB');
    return { success: true, profile: inserted };
  } catch (err: any) {
    console.error('[directProfileInsert] Exception:', err);
    return { success: false, error: err.message };
  }
}


export { supabase };

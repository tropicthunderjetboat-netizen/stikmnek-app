/**
 * StikmNek Backend Diagnostics
 * ─────────────────────────────
 * Run these functions from the DiagnosticPanel or browser console
 * to trace exactly where the "broken wire" is.
 *
 * Usage in console:
 *   import('/src/lib/diagnostics.ts').then(m => m.runFullDiagnostic())
 */

import { supabase } from '@/lib/supabase';

const isDev = import.meta.env.DEV;

/**
 * Wraps Edge Function invokes so failures log a clear console warning and never throw.
 */
async function guardedInvoke(
  fnName: string,
  body: Record<string, unknown>,
  context: string,
): Promise<{ data: unknown; error: { message?: string } | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(fnName, { body });
    if (error) {
      console.warn(
        `[Diagnostics] ${context} — ${fnName}:`,
        error.message || JSON.stringify(error),
        isDev ? '(development build)' : '',
      );
    }
    return { data, error };
  } catch (e) {
    console.warn(
      `[Diagnostics] ${context} — ${fnName} threw:`,
      e instanceof Error ? e.message : e,
      isDev ? '(development build)' : '',
    );
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export interface DiagnosticResult {
  test: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  message: string;
  details?: any;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════
// 1. AUTH CONFIG VERIFICATION
// ═══════════════════════════════════════════════════════════
export async function diagnoseAuthConfig(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const ts = () => new Date().toISOString();

  // Check Supabase URL
  const url = 'https://hbaflbmfptobyfqbudrt.supabase.co';
  results.push({
    test: 'Supabase URL',
    status: 'info',
    message: `URL: ${url.substring(0, 12)}...${url.substring(url.length - 15)}`,
    details: { fullUrl: url },
    timestamp: ts(),
  });

  // Check anon key structure
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYWZsYm1mcHRvYnlmcWJ1ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTMwMTIsImV4cCI6MjA4NzI4OTAxMn0.Ukdx0PKI6cpoEdKGcV4LgcgumkhDIfiIXbmVMgbqKL0';
  try {
    const parts = anonKey.split('.');
    if (parts.length !== 3) {
      results.push({ test: 'Anon Key Format', status: 'fail', message: 'Key is NOT a valid JWT (expected 3 parts, got ' + parts.length + ')', timestamp: ts() });
    } else {
      const payload = JSON.parse(atob(parts[1]));
      const isAnon = payload.role === 'anon';
      const ref = payload.ref;
      const exp = new Date(payload.exp * 1000);
      const isExpired = exp < new Date();

      results.push({
        test: 'Anon Key Format',
        status: isAnon ? 'pass' : 'fail',
        message: isAnon
          ? `Valid anon key for project ref: ${ref}`
          : `WARNING: Key role is "${payload.role}" — expected "anon"`,
        details: {
          role: payload.role,
          ref,
          iss: payload.iss,
          iat: new Date(payload.iat * 1000).toISOString(),
          exp: exp.toISOString(),
          isExpired,
          maskedKey: anonKey.substring(0, 20) + '...' + anonKey.substring(anonKey.length - 10),
        },
        timestamp: ts(),
      });

      if (isExpired) {
        results.push({ test: 'Anon Key Expiry', status: 'fail', message: `KEY IS EXPIRED! Expired on ${exp.toISOString()}`, timestamp: ts() });
      } else {
        results.push({ test: 'Anon Key Expiry', status: 'pass', message: `Key expires: ${exp.toISOString()} (valid)`, timestamp: ts() });
      }

      // Verify ref matches URL
      const urlRef = url.replace('https://', '').split('.')[0];
      if (ref !== urlRef) {
        results.push({ test: 'Key-URL Match', status: 'fail', message: `MISMATCH! Key ref "${ref}" does not match URL ref "${urlRef}"`, timestamp: ts() });
      } else {
        results.push({ test: 'Key-URL Match', status: 'pass', message: `Key ref matches URL ref: ${ref}`, timestamp: ts() });
      }
    }
  } catch (err: any) {
    results.push({ test: 'Anon Key Decode', status: 'fail', message: `Failed to decode key: ${err.message}`, timestamp: ts() });
  }

  // Test actual connectivity to Supabase
  try {
    const startTime = performance.now();
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    });
    const latency = Math.round(performance.now() - startTime);

    results.push({
      test: 'Supabase REST Connectivity',
      status: response.ok || response.status === 200 || response.status === 406 ? 'pass' : 'fail',
      message: `HTTP ${response.status} — latency: ${latency}ms`,
      details: {
        status: response.status,
        statusText: response.statusText,
        latencyMs: latency,
        headers: Object.fromEntries(response.headers.entries()),
      },
      timestamp: ts(),
    });
  } catch (err: any) {
    results.push({
      test: 'Supabase REST Connectivity',
      status: 'fail',
      message: `NETWORK ERROR: ${err.message}. This means the Supabase URL is unreachable.`,
      details: { error: err.message },
      timestamp: ts(),
    });
  }

  // Test Auth endpoint specifically
  try {
    const startTime = performance.now();
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { 'apikey': anonKey },
    });
    const latency = Math.round(performance.now() - startTime);
    const data = await response.json().catch(() => null);

    results.push({
      test: 'Supabase Auth Endpoint',
      status: response.ok ? 'pass' : 'fail',
      message: response.ok
        ? `Auth endpoint reachable (${latency}ms). Email confirmations: ${data?.external?.email ? 'ENABLED' : 'DISABLED'}`
        : `Auth endpoint returned HTTP ${response.status}`,
      details: {
        status: response.status,
        latencyMs: latency,
        emailConfirmation: data?.external?.email,
        phoneConfirmation: data?.external?.phone,
        providers: data?.external ? Object.keys(data.external).filter(k => data.external[k]) : [],
        mailerAutoconfirm: data?.mailer_autoconfirm,
        disableSignup: data?.disable_signup,
      },
      timestamp: ts(),
    });

    // CRITICAL CHECK: Is email confirmation enabled?
    if (data?.external?.email === true && data?.mailer_autoconfirm === false) {
      results.push({
        test: 'Email Confirmation Setting',
        status: 'warn',
        message: 'EMAIL CONFIRMATION IS REQUIRED. Users must click the email link before they appear as "confirmed" in auth.users. If SendGrid is not configured in Supabase Auth > SMTP, confirmation emails will NOT be sent and users will be stuck in limbo.',
        details: {
          emailEnabled: data.external.email,
          autoconfirm: data.mailer_autoconfirm,
          fix: 'Go to Supabase Dashboard > Authentication > Settings > Email and either: (1) Configure custom SMTP with your SendGrid credentials, or (2) Enable "Confirm email" toggle OFF to auto-confirm users.',
        },
        timestamp: ts(),
      });
    }

    // Check if signup is disabled
    if (data?.disable_signup === true) {
      results.push({
        test: 'Signup Enabled',
        status: 'fail',
        message: 'SIGNUP IS DISABLED in Supabase Auth settings! No new users can register.',
        details: { fix: 'Go to Supabase Dashboard > Authentication > Settings > Enable "Allow new users to sign up"' },
        timestamp: ts(),
      });
    }
  } catch (err: any) {
    results.push({
      test: 'Supabase Auth Endpoint',
      status: 'fail',
      message: `Cannot reach auth endpoint: ${err.message}`,
      timestamp: ts(),
    });
  }

  return results;
}


// ═══════════════════════════════════════════════════════════
// 2. SIGN-UP TRACE — Step-by-step with logging
// ═══════════════════════════════════════════════════════════
export async function traceSignUp(
  testEmail: string,
  testPassword: string,
  testName: string = 'Diagnostic Test User',
  testType: 'tourist' | 'business' = 'tourist'
): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const ts = () => new Date().toISOString();

  results.push({
    test: 'SignUp Trace Start',
    status: 'info',
    message: `Tracing sign-up for: ${testEmail} as ${testType}`,
    timestamp: ts(),
  });

  // Step 1: Call supabase.auth.signUp
  let authUser: any = null;
  let hasSession = false;
  try {
    results.push({ test: 'Step 1: Calling supabase.auth.signUp', status: 'info', message: 'Sending request to Supabase Auth...', timestamp: ts() });

    const startTime = performance.now();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: { name: testName, user_type: testType },
      },
    });
    const latency = Math.round(performance.now() - startTime);

    if (authError) {
      results.push({
        test: 'Step 1: Auth Response',
        status: 'fail',
        message: `AUTH ERROR: ${authError.message}`,
        details: {
          errorCode: (authError as any)?.code,
          errorStatus: (authError as any)?.status,
          errorName: (authError as any)?.name,
          fullError: JSON.stringify(authError, null, 2),
          latencyMs: latency,
        },
        timestamp: ts(),
      });
      return results;
    }

    authUser = authData?.user;
    hasSession = !!authData?.session;

    results.push({
      test: 'Step 1: Auth Response',
      status: authUser ? 'pass' : 'fail',
      message: authUser
        ? `User created! ID: ${authUser.id.substring(0, 8)}... | Session: ${hasSession ? 'YES' : 'NO (email confirmation required)'} | Latency: ${latency}ms`
        : `No user returned from signUp (latency: ${latency}ms)`,
      details: {
        userId: authUser?.id,
        email: authUser?.email,
        hasSession,
        emailConfirmedAt: authUser?.email_confirmed_at,
        createdAt: authUser?.created_at,
        userMetadata: authUser?.user_metadata,
        identities: authUser?.identities?.length,
        latencyMs: latency,
      },
      timestamp: ts(),
    });

    // Check for "fake" user (already exists but unconfirmed)
    if (authUser && authUser.identities && authUser.identities.length === 0) {
      results.push({
        test: 'Step 1: Duplicate Check',
        status: 'warn',
        message: 'WARNING: User has 0 identities. This usually means the email is already registered but unconfirmed. Supabase returns a "fake" user object to prevent email enumeration.',
        details: {
          fix: 'Check auth.users in the Supabase dashboard for this email. If it exists, either delete it or have the user confirm their email.',
        },
        timestamp: ts(),
      });
    }
  } catch (err: any) {
    results.push({
      test: 'Step 1: Exception',
      status: 'fail',
      message: `EXCEPTION during signUp: ${err.message}`,
      details: { stack: err.stack },
      timestamp: ts(),
    });
    return results;
  }

  // Step 2: Call create-user-profile edge function
  if (authUser) {
    try {
      results.push({ test: 'Step 2: Calling create-user-profile edge function', status: 'info', message: `Invoking with userId: ${authUser.id.substring(0, 8)}...`, timestamp: ts() });

      const startTime = performance.now();
      const { data: fnResult, error: fnError } = await guardedInvoke(
        'create-user-profile',
        {
          display_name: testName,
          role: testType,
          email: testEmail,
          user_id: authUser.id,
        },
        'traceSignUp Step 2',
      );
      const latency = Math.round(performance.now() - startTime);

      if (fnError) {
        results.push({
          test: 'Step 2: Edge Function Response',
          status: 'fail',
          message: `EDGE FUNCTION ERROR: ${fnError.message || JSON.stringify(fnError)}`,
          details: {
            error: fnError,
            context: (fnError as any)?.context,
            latencyMs: latency,
            possibleCauses: [
              'Edge function not deployed',
              'SUPABASE_SERVICE_ROLE_KEY not set in secrets',
              'Function crashed (check Supabase Dashboard > Edge Functions > Logs)',
              'CORS issue',
            ],
          },
          timestamp: ts(),
        });
      } else {
        results.push({
          test: 'Step 2: Edge Function Response',
          status: fnResult?.success ? 'pass' : 'warn',
          message: fnResult?.success
            ? `Profile created! ID: ${fnResult.profile?.id?.substring(0, 8)}... | Role: ${fnResult.profile?.role} | Latency: ${latency}ms`
            : `Edge function returned: ${JSON.stringify(fnResult)} (latency: ${latency}ms)`,
          details: {
            result: fnResult,
            latencyMs: latency,
          },
          timestamp: ts(),
        });
      }
    } catch (err: any) {
      results.push({
        test: 'Step 2: Exception',
        status: 'fail',
        message: `EXCEPTION calling edge function: ${err.message}`,
        details: {
          stack: err.stack,
          possibleCauses: [
            'Edge function not deployed — run: supabase functions deploy create-user-profile',
            'Network error reaching edge function endpoint',
          ],
        },
        timestamp: ts(),
      });
    }
  }

  // Step 3: Verify user exists in auth.users (via getUser if we have a session)
  if (hasSession) {
    try {
      const { data: { user: verifiedUser }, error } = await supabase.auth.getUser();
      results.push({
        test: 'Step 3: Verify Auth User (getUser)',
        status: verifiedUser ? 'pass' : 'fail',
        message: verifiedUser
          ? `Verified! User ${verifiedUser.id.substring(0, 8)}... exists in auth.users`
          : `getUser returned null. Error: ${error?.message || 'none'}`,
        details: { user: verifiedUser, error },
        timestamp: ts(),
      });
    } catch (err: any) {
      results.push({
        test: 'Step 3: Verify Auth User',
        status: 'fail',
        message: `Exception: ${err.message}`,
        timestamp: ts(),
      });
    }
  } else {
    results.push({
      test: 'Step 3: Verify Auth User',
      status: 'warn',
      message: 'Cannot verify via getUser — no session (email confirmation required). Check auth.users in Supabase Dashboard directly.',
      timestamp: ts(),
    });
  }

  // Step 4: Check user_profiles table directly
  if (authUser) {
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      results.push({
        test: 'Step 4: Verify user_profiles Row',
        status: profile ? 'pass' : 'warn',
        message: profile
          ? `Profile found in user_profiles! Role: ${profile.role}, Name: ${profile.display_name}`
          : `No profile found in user_profiles for user ${authUser.id.substring(0, 8)}... Error: ${error?.message || 'none (RLS may be blocking — check with service_role)'}`,
        details: { profile, error },
        timestamp: ts(),
      });
    } catch (err: any) {
      results.push({
        test: 'Step 4: Verify user_profiles Row',
        status: 'fail',
        message: `Exception querying user_profiles: ${err.message}`,
        timestamp: ts(),
      });
    }
  }

  return results;
}


// ═══════════════════════════════════════════════════════════
// 3. EDGE FUNCTION CONNECTIVITY TEST
// ═══════════════════════════════════════════════════════════
export async function diagnoseEdgeFunctions(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const ts = () => new Date().toISOString();

  const functions = [
    { name: 'sentry-relay', body: { action: 'health' }, expectKey: 'success' },
    { name: 'create-user-profile', body: { display_name: 'DIAGNOSTIC_TEST', role: 'tourist', email: 'diagnostic@test.local', user_id: '00000000-0000-0000-0000-000000000000' }, expectKey: 'success' },
    { name: 'manage-business', body: { action: 'list_categories' }, expectKey: null },
    { name: 'send-email', body: { action: 'health_check' }, expectKey: null },
    { name: 'process-card-payment', body: { action: 'health_check' }, expectKey: null },
  ];

  for (const fn of functions) {
    try {
      const startTime = performance.now();
      const { data, error } = await guardedInvoke(
        fn.name,
        fn.body as Record<string, unknown>,
        'diagnoseEdgeFunctions',
      );
      const latency = Math.round(performance.now() - startTime);

      if (error) {
        // Check if it's a 404 (not deployed) vs other error
        const is404 = error.message?.includes('404') || (error as any)?.status === 404;
        results.push({
          test: `Edge Function: ${fn.name}`,
          status: 'fail',
          message: is404
            ? `NOT DEPLOYED — Function "${fn.name}" does not exist. Deploy with: supabase functions deploy ${fn.name}`
            : `ERROR: ${error.message || JSON.stringify(error)}`,
          details: { error, latencyMs: latency, is404 },
          timestamp: ts(),
        });
      } else {
        results.push({
          test: `Edge Function: ${fn.name}`,
          status: 'pass',
          message: `Reachable (${latency}ms). Response: ${JSON.stringify(data).substring(0, 200)}`,
          details: { data, latencyMs: latency },
          timestamp: ts(),
        });
      }
    } catch (err: any) {
      results.push({
        test: `Edge Function: ${fn.name}`,
        status: 'fail',
        message: `EXCEPTION: ${err.message}`,
        details: { error: err.message },
        timestamp: ts(),
      });
    }
  }

  return results;
}


// ═══════════════════════════════════════════════════════════
// 4. SENTRY RELAY DIAGNOSTIC
// ═══════════════════════════════════════════════════════════
export async function diagnoseSentry(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const ts = () => new Date().toISOString();

  // Health check
  try {
    const { data, error } = await guardedInvoke(
      'sentry-relay',
      { action: 'health' },
      'diagnoseSentry health',
    );

    if (error) {
      results.push({
        test: 'Sentry Relay Health',
        status: 'fail',
        message: `Sentry relay unreachable: ${error.message}`,
        details: { error },
        timestamp: ts(),
      });
      return results;
    }

    results.push({
      test: 'Sentry Relay Health',
      status: data?.success ? 'pass' : 'fail',
      message: data?.success
        ? `Relay is UP. Sentry configured: ${data.sentry_configured ? 'YES' : 'NO'}`
        : `Relay returned unexpected: ${JSON.stringify(data)}`,
      details: data,
      timestamp: ts(),
    });

    if (!data?.sentry_configured) {
      results.push({
        test: 'Sentry DSN Secret',
        status: 'fail',
        message: 'SENTRY_DSN is NOT set in Edge Function secrets. Sentry will receive 0 events.',
        details: {
          fix: 'Run: supabase secrets set SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/456789',
        },
        timestamp: ts(),
      });
      return results;
    }
  } catch (err: any) {
    results.push({
      test: 'Sentry Relay Health',
      status: 'fail',
      message: `Exception: ${err.message}`,
      timestamp: ts(),
    });
    return results;
  }

  // Send a test message
  try {
    const { data, error } = await guardedInvoke(
      'sentry-relay',
      {
        action: 'capture_message',
        message: 'DIAGNOSTIC TEST — If you see this in Sentry, the relay is working',
        level: 'info',
        tags: { source: 'stikmnek-diagnostic', test: 'true' },
        extra: { diagnosticTimestamp: ts(), userAgent: navigator.userAgent },
      },
      'diagnoseSentry test message',
    );

    results.push({
      test: 'Sentry Test Message',
      status: !error && data?.success ? 'pass' : 'fail',
      message: !error && data?.success
        ? 'Test message sent to Sentry! Check your Sentry dashboard for an event tagged "stikmnek-diagnostic".'
        : `Failed to send test message: ${error?.message || JSON.stringify(data)}`,
      details: { data, error },
      timestamp: ts(),
    });
  } catch (err: any) {
    results.push({
      test: 'Sentry Test Message',
      status: 'fail',
      message: `Exception: ${err.message}`,
      timestamp: ts(),
    });
  }

  return results;
}


// ═══════════════════════════════════════════════════════════
// 5. DATABASE TABLE ACCESSIBILITY
// ═══════════════════════════════════════════════════════════
export async function diagnoseDatabase(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const ts = () => new Date().toISOString();

  const tables = [
    'businesses',
    'user_profiles',
    'passes',
    'reviews',
    'favorites',
    'redemptions',
    'payment_sessions',
    'error_logs',
  ];

  for (const table of tables) {
    try {
      const startTime = performance.now();
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      const latency = Math.round(performance.now() - startTime);

      if (error) {
        results.push({
          test: `Table: ${table}`,
          status: error.code === '42501' ? 'warn' : 'fail',
          message: error.code === '42501'
            ? `RLS blocking anonymous access (expected for ${table}). Code: ${error.code}`
            : `ERROR: ${error.message} (code: ${error.code})`,
          details: { error, latencyMs: latency },
          timestamp: ts(),
        });
      } else {
        results.push({
          test: `Table: ${table}`,
          status: 'pass',
          message: `Accessible. Row count: ${count ?? 'unknown'} (${latency}ms)`,
          details: { count, latencyMs: latency },
          timestamp: ts(),
        });
      }
    } catch (err: any) {
      results.push({
        test: `Table: ${table}`,
        status: 'fail',
        message: `Exception: ${err.message}`,
        timestamp: ts(),
      });
    }
  }

  return results;
}


// ═══════════════════════════════════════════════════════════
// 6. CURRENT SESSION CHECK
// ═══════════════════════════════════════════════════════════
export async function diagnoseCurrentSession(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const ts = () => new Date().toISOString();

  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      results.push({
        test: 'Current Session',
        status: 'fail',
        message: `getSession error: ${error.message}`,
        details: { error },
        timestamp: ts(),
      });
      return results;
    }

    if (!session) {
      results.push({
        test: 'Current Session',
        status: 'info',
        message: 'No active session. User is not signed in.',
        timestamp: ts(),
      });

      // Check localStorage for stale tokens
      const storedAuth = localStorage.getItem('stikmnek-auth');
      if (storedAuth) {
        try {
          const parsed = JSON.parse(storedAuth);
          results.push({
            test: 'Stored Auth Token',
            status: 'warn',
            message: `Found stored auth data in localStorage (key: "stikmnek-auth") but no active session. Token may be expired.`,
            details: {
              hasAccessToken: !!parsed?.access_token,
              hasRefreshToken: !!parsed?.refresh_token,
              expiresAt: parsed?.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : 'unknown',
              isExpired: parsed?.expires_at ? (parsed.expires_at * 1000) < Date.now() : 'unknown',
            },
            timestamp: ts(),
          });
        } catch {
          results.push({
            test: 'Stored Auth Token',
            status: 'warn',
            message: 'Found stored auth data but could not parse it.',
            timestamp: ts(),
          });
        }
      }
      return results;
    }

    // Session exists
    const expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : null;
    const isExpired = expiresAt ? expiresAt < new Date() : false;

    results.push({
      test: 'Current Session',
      status: isExpired ? 'warn' : 'pass',
      message: isExpired
        ? `Session EXPIRED at ${expiresAt?.toISOString()}`
        : `Active session for: ${session.user?.email}`,
      details: {
        userId: session.user?.id,
        email: session.user?.email,
        expiresAt: expiresAt?.toISOString(),
        isExpired,
        userMetadata: session.user?.user_metadata,
        emailConfirmedAt: session.user?.email_confirmed_at,
        lastSignInAt: session.user?.last_sign_in_at,
        role: session.user?.role,
        identitiesCount: session.user?.identities?.length,
      },
      timestamp: ts(),
    });

    // Verify with getUser (server-side check)
    const { data: { user }, error: getUserError } = await supabase.auth.getUser();
    results.push({
      test: 'Server-Side User Verification',
      status: user ? 'pass' : 'fail',
      message: user
        ? `Server confirms user exists: ${user.id.substring(0, 8)}...`
        : `Server could not verify user: ${getUserError?.message || 'unknown'}`,
      details: { user: user ? { id: user.id, email: user.email } : null, error: getUserError },
      timestamp: ts(),
    });

  } catch (err: any) {
    results.push({
      test: 'Current Session',
      status: 'fail',
      message: `Exception: ${err.message}`,
      timestamp: ts(),
    });
  }

  return results;
}


// ═══════════════════════════════════════════════════════════
// FULL DIAGNOSTIC — Runs all tests
// ═══════════════════════════════════════════════════════════
export async function runFullDiagnostic(): Promise<DiagnosticResult[]> {
  const all: DiagnosticResult[] = [];

  all.push({ test: '═══ AUTH CONFIG ═══', status: 'info', message: '', timestamp: new Date().toISOString() });
  all.push(...await diagnoseAuthConfig());

  all.push({ test: '═══ CURRENT SESSION ═══', status: 'info', message: '', timestamp: new Date().toISOString() });
  all.push(...await diagnoseCurrentSession());

  all.push({ test: '═══ EDGE FUNCTIONS ═══', status: 'info', message: '', timestamp: new Date().toISOString() });
  all.push(...await diagnoseEdgeFunctions());

  all.push({ test: '═══ SENTRY ═══', status: 'info', message: '', timestamp: new Date().toISOString() });
  all.push(...await diagnoseSentry());

  all.push({ test: '═══ DATABASE TABLES ═══', status: 'info', message: '', timestamp: new Date().toISOString() });
  all.push(...await diagnoseDatabase());

  return all;
}

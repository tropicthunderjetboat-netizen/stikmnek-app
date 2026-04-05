// deno-lint-ignore-file no-explicit-any
/**
 * process-card-payment Edge Function
 * Handles: purchase_pass, purchase_superstar
 *
 * For purchase_superstar: Charges $5.00 AUD (HARDCODED), increments superstar_credits.
 * Amount is NEVER taken from the request body for security.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';
import { normalizePassTypeToDb, semanticPassIdFromDb, type DbPassType } from '../_shared/passTypes.ts';

type SupabaseServiceClient = ReturnType<typeof createClient>;
const BEARER_PREFIX = /^Bearer\s+/i;

/** Decode JWT `iss` without verifying signature (diagnostics only). */
function decodeJwtIssUnverified(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const seg = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = seg + '='.repeat((4 - (seg.length % 4)) % 4);
    const json = atob(pad);
    const payload = JSON.parse(json) as { iss?: unknown };
    return typeof payload.iss === 'string' ? payload.iss : null;
  } catch {
    return null;
  }
}

function expectedJwtIssuerFromSupabaseUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  try {
    const origin = new URL(u).origin;
    return `${origin}/auth/v1`;
  } catch {
    return null;
  }
}

function jsonResponse(req: Request, data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getSafeCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// TEMP_DEBUG_PAYMENT — structured logs for production debugging
function dbg(label: string, payload: Record<string, unknown>) {
  try {
    console.log(`[process-card-payment][TEMP_DEBUG_PAYMENT] ${label}`, JSON.stringify(payload));
  } catch {
    console.log(`[process-card-payment][TEMP_DEBUG_PAYMENT] ${label}`, payload);
  }
}

function safeBoolEnv(name: string): boolean | null {
  const v = (Deno.env.get(name) ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function maskBodyForLog(body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== 'object') return out;
  out.action = body.action ?? body.Action ?? null;
  out.passType = body.passType ?? body.pass_type ?? null;
  out.startDate = body.startDate ?? body.start_date ?? null;
  out.hasReferralCode = typeof body.referralCode === 'string' && body.referralCode.length > 0;
  out.hasPaymentTransactionId =
    typeof body.paymentTransactionId === 'string' ||
    typeof body.payment_transaction_id === 'string' ||
    typeof body.idempotencyKey === 'string';
  // Never log raw card data
  out.cardNumber = body.cardNumber ? `[len=${String(body.cardNumber).length}]` : null;
  out.cardExpiry = body.cardExpiry ? `[len=${String(body.cardExpiry).length}]` : null;
  out.cardCvv = body.cardCvv ? `[len=${String(body.cardCvv).length}]` : null;
  out.cardName = body.cardName ? `[len=${String(body.cardName).length}]` : null;
  return out;
}

function errorResponse(
  req: Request,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return jsonResponse(req, { success: false, error: message, errorCode: status, ...extra }, status);
}

async function getAuthUser(
  authClient: SupabaseServiceClient,
  req: Request,
  ctx: { supabaseUrl: string; authClientKeySource: string },
): Promise<{ user: { id: string; email?: string } } | { response: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.trim()) {
    dbg('auth_jwt_validation', {
      stage: 'missing_authorization_header',
      authOk: false,
      userId: null,
      authErrorMessage: null,
    });
    return {
      response: errorResponse(req, 'Missing Authorization header', 401, {
        reason: 'missing_authorization',
        diagnostic: {
          authClientKeySource: ctx.authClientKeySource,
          hint: 'Supabase client did not send Authorization; sign in again or refresh session.',
        },
      }),
    };
  }
  const token = authHeader.replace(BEARER_PREFIX, '').trim();
  dbg('auth_jwt_validation', {
    stage: 'before_getUser',
    tokenLen: token.length,
    jwtSegmentCount: token.split('.').length,
  });
  const { data: { user }, error } = await authClient.auth.getUser(token);
  const jwtIss = decodeJwtIssUnverified(token);
  const expectedIss = expectedJwtIssuerFromSupabaseUrl(ctx.supabaseUrl);
  dbg('auth_jwt_validation', {
    stage: 'after_getUser',
    authOk: Boolean(user) && !error,
    userId: user?.id ?? null,
    authErrorMessage: error?.message ?? null,
    authErrorName: (error as { name?: string } | null)?.name ?? null,
    authErrorStatus: (error as { status?: number } | null)?.status ?? null,
    jwtIssuer: jwtIss,
    expectedJwtIssuer: expectedIss,
    jwtIssuerMismatch: Boolean(jwtIss && expectedIss && jwtIss !== expectedIss),
  });
  if (error || !user) {
    return {
      response: errorResponse(req, 'Invalid or expired session', 401, {
        reason: 'auth_invalid',
        authError: error?.message ?? null,
        diagnostic: {
          authClientKeySource: ctx.authClientKeySource,
          jwtIssuer: jwtIss,
          expectedJwtIssuer: expectedIss,
          jwtIssuerMismatch: Boolean(jwtIss && expectedIss && jwtIss !== expectedIss),
          hint:
            jwtIss && expectedIss && jwtIss !== expectedIss
              ? 'JWT was issued for a different auth server than this function SUPABASE_URL. Set APP_SUPABASE_ANON_KEY (and SUPABASE_URL) to this project.'
              : 'Token rejected by GoTrue — expired session, wrong signing key, or malformed JWT.',
        },
      }),
    };
  }
  return { user };
}

const SUPERSTAR_PRICE_AUD = 5.0;

// Pass configuration (keep in sync with pricing.ts and paypal-capture)
const PASS_DAYS: Record<DbPassType, number> = { daily: 1, weekly: 6, monthly: 6, mega_group: 7 };
const PASS_MAX_PEOPLE: Record<DbPassType, number> = { daily: 4, weekly: 4, monthly: 7, mega_group: 20 };
const PASS_PRICES_AUD: Record<DbPassType, number> = { daily: 15, weekly: 45, monthly: 99, mega_group: 199 };
const SHARE_BONUS: Record<DbPassType, { extraPeople: number; extraDays: number }> = {
  daily: { extraPeople: 2, extraDays: 0 },
  weekly: { extraPeople: 2, extraDays: 1 },
  monthly: { extraPeople: 1, extraDays: 1 },
  mega_group: { extraPeople: 0, extraDays: 5 },
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function endOfDayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T23:59:59.999Z');
  return d.toISOString();
}

/** Start of calendar day in UTC as epoch ms (for YYYY-MM-DD already validated). */
function utcStartOfCalendarDayMs(isoDateOnly: string): number {
  return new Date(isoDateOnly + 'T00:00:00.000Z').getTime();
}

/** Today's calendar date start in UTC (midnight UTC for the current UTC date). */
function utcTodayStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** UTC midnight of the calendar day `days` after the UTC day containing `utcMidnightMs`. */
function utcAddCalendarDays(utcMidnightMs: number, days: number): number {
  const d = new Date(utcMidnightMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 0, 0, 0, 0);
}

/** Calendar span between valid_from and valid_until (matches addDays-based purchase flow). */
function calendarDaysBetweenValidRange(validFrom: string, validUntil: string): number {
  const a = new Date(validFrom + 'T00:00:00.000Z');
  const b = new Date(validUntil + 'T00:00:00.000Z');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, diff);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }

  try {
    let path = '';
    try {
      path = new URL(req.url).pathname;
    } catch {
      path = '(unparsed)';
    }
    dbg('entry', {
      method: req.method,
      path,
      origin: req.headers.get('Origin') ?? null,
      hasAuthHeader: Boolean(req.headers.get('Authorization')?.trim()),
      corsAllowedOriginsSet: Boolean((Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '').trim()),
      cardMockEnabledEnv: safeBoolEnv('CARD_MOCK_ENABLED'),
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // Dashboard secret bug workaround:
    // Some projects cannot edit/delete reserved `SUPABASE_*` secrets in the Dashboard.
    // Prefer a non-reserved secret name for the anon key (used ONLY to validate caller JWT):
    //   APP_SUPABASE_ANON_KEY = <project anon public key>
    // Keep legacy fallbacks for safety.
    const hasAppSupabaseAnonKey = Boolean((Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '').trim());
    const hasSupabaseAnonKey = Boolean((Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim());
    const hasSupabaseAnonKeyPublic = Boolean((Deno.env.get('SUPABASE_ANON_KEY_PUBLIC') ?? '').trim());
    const rawAppAnon = (Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '').trim();
    const rawSupabaseAnon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
    const rawSupabaseAnonPublic = (Deno.env.get('SUPABASE_ANON_KEY_PUBLIC') ?? '').trim();
    const supabaseAnonKey = rawAppAnon || rawSupabaseAnon || rawSupabaseAnonPublic;
    const authClientKeySource = rawAppAnon
      ? 'APP_SUPABASE_ANON_KEY'
      : rawSupabaseAnon
        ? 'SUPABASE_ANON_KEY'
        : rawSupabaseAnonPublic
          ? 'SUPABASE_ANON_KEY_PUBLIC'
          : 'NONE';
    dbg('anon_key_env', {
      hasAppSupabaseAnonKey,
      hasSupabaseAnonKey,
      hasSupabaseAnonKeyPublic,
      authClientKeySource,
      anonKeyCharLength: supabaseAnonKey.length,
      supabaseUrlHost: (() => {
        try {
          return new URL(supabaseUrl.trim() || 'https://invalid.local').hostname;
        } catch {
          return null;
        }
      })(),
    });
    if (!supabaseUrl.trim() || !supabaseServiceKey.trim()) {
      dbg('missing_supabase_secrets', {
        hasSupabaseUrl: Boolean(supabaseUrl.trim()),
        hasServiceKey: Boolean(supabaseServiceKey.trim()),
      });
      return errorResponse(req, 'Server configuration error', 500, {
        reason: 'missing_supabase_secrets',
      });
    }
    if (!supabaseAnonKey) {
      dbg('missing_supabase_anon_key', { hasAnonKey: false, note: 'Set APP_SUPABASE_ANON_KEY (recommended)' });
      return errorResponse(req, 'Server configuration error', 500, {
        reason: 'missing_supabase_anon_key',
      });
    }

    // Use anon key to validate caller JWT (GoTrue auth context).
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Use service role for DB operations (bypasses RLS).
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authResult = await getAuthUser(authClient, req, {
      supabaseUrl,
      authClientKeySource,
    });
    if ('response' in authResult) {
      dbg('auth_failed', {
        status: 401,
        note: 'JWT validation failed; see auth_jwt_validation logs above in same invocation',
      });
      return authResult.response;
    }
    const authUser = authResult.user;
    dbg('auth_ok', { userId: authUser.id, hasEmail: Boolean(authUser.email) });

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? body?.Action;
    dbg('body', maskBodyForLog(body));

    if (!action) {
      return errorResponse(req, 'Missing action. Use action: purchase_pass for pass purchase.', 400);
    }

    if (action === 'purchase_superstar') {
      // ═══ SUPERSTAR PURCHASE — $5.00 AUD HARDCODED ═══
      // TODO: Integrate actual card charge (PayPal/Stripe) for SUPERSTAR_PRICE_AUD
      // For now: increment credits. Replace with real payment flow when ready.
      const amountToCharge = SUPERSTAR_PRICE_AUD;

      const { data: newCount, error: rpcError } = await supabase.rpc('increment_superstar_credits', {
        p_user_id: authUser.id,
      });

      if (rpcError) {
        console.error('increment_superstar_credits error:', rpcError);
        dbg('purchase_superstar_failed', { reason: 'rpc_error', postgresCode: rpcError.code ?? null });
        return errorResponse(req, 'Failed to add Super Star credit', 500);
      }

      dbg('purchase_superstar_ok', { newCount: newCount ?? null });
      return jsonResponse(req, {
        success: true,
        superstar_credits: newCount ?? 1,
        amount: amountToCharge,
        currency: 'AUD',
      });
    }

    if (action === 'purchase_pass') {
      // ═══ PASS PURCHASE VIA CARD (mock charge) ═══
      //
      // This implementation validates the input, performs a MOCK charge (no real
      // gateway call in sandbox), and then creates a row in public.passes with
      // correct validity dates. The frontend treats this response the same way
      // as paypal-capture.
      //
      // CRITICAL SAFETY: In production, do NOT allow mock payments to create active passes.
      // To enable this path intentionally (dev/testing only), set secret:
      //   CARD_MOCK_ENABLED=true

      const mockEnabled = (Deno.env.get('CARD_MOCK_ENABLED') ?? '').toLowerCase() === 'true';
      dbg('purchase_pass_mock_flag', { mockEnabled });
      if (!mockEnabled) {
        return jsonResponse(req, {
          success: false,
          error: 'Card payments are temporarily unavailable. Please use PayPal.',
          errorCode: 501,
          reason: 'card_mock_disabled',
        }, 501);
      }

      const rawPassType = String(body?.passType ?? body?.pass_type ?? '').trim();
      const startDate = body?.startDate ?? body?.start_date;

      const passTypeDb = normalizePassTypeToDb(rawPassType);
      if (!passTypeDb) {
        const hint =
          rawPassType === '' ? '(empty)' : JSON.stringify(rawPassType);
        return errorResponse(req, `Missing or invalid passType: ${hint}`, 400, {
          reason: 'invalid_pass_type',
          receivedPassType: rawPassType === '' ? null : rawPassType,
        });
      }

      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return errorResponse(req, 'Missing or invalid startDate (YYYY-MM-DD)', 400);
      }

      dbg('purchase_pass_input_ok', { passTypeDb, passTypeClient: rawPassType, startDate });

      // ─── Server-side: start date must not be before today's calendar date (UTC) ───
      // Compare date-only fields at UTC midnight so behavior is stable regardless of
      // Edge runtime region; YYYY-MM-DD is appended as Z to avoid local-TZ parsing quirks.
      const startMs = utcStartOfCalendarDayMs(startDate);
      if (Number.isNaN(startMs)) {
        return errorResponse(req, 'Missing or invalid startDate (YYYY-MM-DD)', 400);
      }
      const todayStartMs = utcTodayStartMs();
      if (startMs < todayStartMs) {
        return errorResponse(req, 'Purchase start date cannot be in the past.', 400);
      }
      // Latest allowed first day of pass: today + 30 calendar days (UTC midnight boundaries).
      const maxStartMs = utcAddCalendarDays(todayStartMs, 30);
      if (startMs > maxStartMs) {
        return errorResponse(
          req,
          'Purchase start date cannot be more than 30 days in the future (UTC).',
          400,
        );
      }

      const passType = passTypeDb;
      const baseDays = PASS_DAYS[passType] ?? 1;
      const baseMaxPeople = PASS_MAX_PEOPLE[passType] ?? 4;
      const amount = PASS_PRICES_AUD[passType] ?? 0;

      // If the user unlocked share bonus before purchase, apply it automatically and consume the flag.
      let applyShareBonus = false;
      try {
        dbg('share_bonus_lookup_start', {});
        const { data: profileRow } = await supabase
          .from('user_profiles')
          .select('share_bonus_unlocked')
          .eq('user_id', authUser.id)
          .maybeSingle();
        applyShareBonus = Boolean(profileRow?.share_bonus_unlocked);
        dbg('share_bonus_lookup_ok', { applyShareBonus });
      } catch {}

      const bonus = SHARE_BONUS[passType] ?? { extraPeople: 0, extraDays: 0 };
      const days = applyShareBonus ? (baseDays + (bonus.extraDays || 0)) : baseDays;
      const maxPeople = applyShareBonus ? (baseMaxPeople + (bonus.extraPeople || 0)) : baseMaxPeople;

      // MOCK charge: in production you would call a real gateway here (Stripe/PayPal).
      // For now we assume the card charge succeeded if we reached this point.

      const validFrom = startDate;
      const validUntil = addDays(startDate, days);
      const expiresAt = endOfDayDate(validUntil);
      const receiptNumber = body?.receiptNumber ?? `STK-${Date.now().toString(36).toUpperCase()}`;

      // ─── Idempotency: payment_transaction_id / client idempotency key (stored in payment_session_id) ───
      // Same key + same user → return existing pass (retries after gateway success or network loss).
      const rawTxnId =
        (typeof body?.paymentTransactionId === 'string' && body.paymentTransactionId.trim()) ||
        (typeof body?.payment_transaction_id === 'string' && body.payment_transaction_id.trim()) ||
        (typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim()) ||
        '';
      const paymentTxnId =
        rawTxnId ||
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `txn-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);

      dbg('idempotency', { hasClientKey: Boolean(rawTxnId), keyPrefix: rawTxnId ? rawTxnId.slice(0, 8) : null });

      if (rawTxnId) {
        const { data: existingPass, error: existingErr } = await supabase
          .from('passes')
          .select(
            'id, purchased_at, pass_type, valid_from, valid_until, expires_at, amount_paid, currency, share_bonus_applied, max_people',
          )
          .eq('user_id', authUser.id)
          .eq('payment_session_id', rawTxnId)
          .maybeSingle();

        if (existingErr) {
          console.error('process-card-payment: idempotent pass lookup:', existingErr);
          dbg('idempotency_lookup_error', { postgresCode: existingErr.code ?? null, message: existingErr.message ?? null });
        } else if (existingPass) {
          dbg('idempotency_replay', { existingPassId: (existingPass as any)?.id ?? null });
          const ep = existingPass as Record<string, unknown>;
          const vf = String(ep.valid_from ?? '') || validFrom;
          const vu = String(ep.valid_until ?? '') || validUntil;
          const exAt = String(ep.expires_at ?? '') || expiresAt;
          const daysReplay = calendarDaysBetweenValidRange(vf, vu);
          const rid = String(ep.id ?? '');
          return jsonResponse(req, {
            success: true,
            idempotentReplay: true,
            receiptNumber: `STK-${rid.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
            passType: semanticPassIdFromDb(normalizePassTypeToDb(String(ep.pass_type ?? '')) ?? passType),
            amount: Number(ep.amount_paid) || amount,
            currency: (ep.currency as string) || 'AUD',
            expiresAt: exAt,
            validFrom: vf,
            validUntil: vu,
            days: daysReplay,
            shareBonusApplied: Boolean(ep.share_bonus_applied),
            sessionId: rid,
            purchasedAt: (ep.purchased_at as string) ?? new Date().toISOString(),
          });
        }
      }

      const passRow: Record<string, unknown> = {
        user_id: authUser.id,
        pass_type: passTypeDb,
        active: true,
        valid_from: validFrom,
        valid_until: validUntil,
        expires_at: expiresAt,
        max_people: maxPeople,
        share_bonus_applied: applyShareBonus,
        amount_paid: amount,
        currency: 'AUD',
        payment_provider: 'card-mock',
        payment_session_id: paymentTxnId,
        purchased_at: new Date().toISOString(),
      };

      dbg('pass_insert_start', { passType, validFrom, validUntil, expiresAt, maxPeople, applyShareBonus });
      const { data: insertedPass, error: insertErr } = await supabase
        .from('passes')
        .insert(passRow)
        .select('id, purchased_at')
        .single();

      if (insertErr) {
        // Unique violation: concurrent insert with same idempotency key — return existing row.
        if (insertErr.code === '23505' && rawTxnId) {
          dbg('pass_insert_unique_violation', { rawTxnIdPrefix: rawTxnId.slice(0, 8) });
          const { data: racedPass } = await supabase
            .from('passes')
            .select(
              'id, purchased_at, pass_type, valid_from, valid_until, expires_at, amount_paid, currency, share_bonus_applied, max_people',
            )
            .eq('user_id', authUser.id)
            .eq('payment_session_id', rawTxnId)
            .maybeSingle();

          if (racedPass) {
            dbg('pass_insert_race_replay', { racedPassId: (racedPass as any)?.id ?? null });
            const ep = racedPass as Record<string, unknown>;
            const vf = String(ep.valid_from ?? '') || validFrom;
            const vu = String(ep.valid_until ?? '') || validUntil;
            const exAt = String(ep.expires_at ?? '') || expiresAt;
            const daysReplay = calendarDaysBetweenValidRange(vf, vu);
            const rid = String(ep.id ?? '');
            return jsonResponse(req, {
              success: true,
              idempotentReplay: true,
              receiptNumber: `STK-${rid.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
              passType: semanticPassIdFromDb(normalizePassTypeToDb(String(ep.pass_type ?? '')) ?? passType),
              amount: Number(ep.amount_paid) || amount,
              currency: (ep.currency as string) || 'AUD',
              expiresAt: exAt,
              validFrom: vf,
              validUntil: vu,
              days: daysReplay,
              shareBonusApplied: Boolean(ep.share_bonus_applied),
              sessionId: rid,
              purchasedAt: (ep.purchased_at as string) ?? new Date().toISOString(),
            });
          }
        }
        console.error('process-card-payment: insert passes error:', insertErr);
        dbg('pass_insert_failed', { postgresCode: insertErr.code ?? null, message: insertErr.message ?? null });
        return errorResponse(req, 'Payment captured but failed to create pass: ' + insertErr.message, 500, {
          reason: 'pass_insert_failed',
          postgresCode: insertErr.code ?? null,
        });
      }

      if (applyShareBonus) {
        // Consume the pre-purchase share bonus so it can't be reused.
        dbg('share_bonus_consume_start', {});
        await supabase
          .from('user_profiles')
          .update({ share_bonus_unlocked: false, updated_at: new Date().toISOString() })
          .eq('user_id', authUser.id);
        dbg('share_bonus_consume_ok', {});
      }

      dbg('purchase_pass_ok', { insertedPassId: insertedPass?.id ?? null, receiptNumber });
      return jsonResponse(req, {
        success: true,
        receiptNumber,
        passType: semanticPassIdFromDb(passType),
        amount,
        currency: 'AUD',
        expiresAt,
        validFrom,
        validUntil,
        days,
        shareBonusApplied: applyShareBonus,
        sessionId: insertedPass?.id ?? receiptNumber,
        purchasedAt: insertedPass?.purchased_at ?? new Date().toISOString(),
        paymentTransactionId: paymentTxnId,
      });
    }

    return errorResponse(req, `Unknown action: ${action}. Use action: purchase_pass for pass purchase.`, 400);
  } catch (err) {
    console.error('process-card-payment error:', err);
    dbg('unexpected_error', {
      message: err instanceof Error ? err.message : String(err ?? ''),
      name: (err as any)?.name ?? null,
      stack: (err as any)?.stack ? String((err as any).stack).slice(0, 1500) : null,
    });
    const msg = err instanceof Error ? err.message : String(err ?? 'Internal server error');
    return errorResponse(req, msg || 'Internal server error', 500, { reason: 'unexpected' });
  }
});

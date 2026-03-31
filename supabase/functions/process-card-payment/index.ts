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

type SupabaseServiceClient = ReturnType<typeof createClient>;
const BEARER_PREFIX = /^Bearer\s+/i;

function jsonResponse(req: Request, data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getSafeCorsHeaders(req), 'Content-Type': 'application/json' },
  });
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
  supabase: SupabaseServiceClient,
  req: Request,
): Promise<{ user: { id: string; email?: string } } | { response: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.trim()) {
    return { response: errorResponse(req, 'Missing Authorization header', 401) };
  }
  const token = authHeader.replace(BEARER_PREFIX, '').trim();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { response: errorResponse(req, 'Invalid or expired session', 401) };
  }
  return { user };
}

const SUPERSTAR_PRICE_AUD = 5.0;

// Pass configuration (keep in sync with pricing.ts and paypal-capture)
const PASS_DAYS: Record<string, number> = { daily: 1, weekly: 6, monthly: 6, mega_group: 7 };
const PASS_MAX_PEOPLE: Record<string, number> = { daily: 4, weekly: 4, monthly: 7, mega_group: 20 };
const PASS_PRICES_AUD: Record<string, number> = { daily: 15, weekly: 45, monthly: 99, mega_group: 199 };
const SHARE_BONUS: Record<string, { extraPeople: number; extraDays: number }> = {
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl.trim() || !supabaseServiceKey.trim()) {
      return errorResponse(req, 'Server configuration error', 500, {
        reason: 'missing_supabase_secrets',
      });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authResult = await getAuthUser(supabase, req);
    if ('response' in authResult) {
      return authResult.response;
    }
    const authUser = authResult.user;

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? body?.Action;

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
        return errorResponse(req, 'Failed to add Super Star credit', 500);
      }

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
      if (!mockEnabled) {
        return jsonResponse(req, {
          success: false,
          error: 'Card payments are temporarily unavailable. Please use PayPal.',
          errorCode: 501,
          reason: 'card_mock_disabled',
        }, 501);
      }

      const rawPassType = (body?.passType ?? body?.pass_type ?? '').toLowerCase();
      const startDate = body?.startDate ?? body?.start_date;

      if (!rawPassType || !['daily', 'weekly', 'monthly', 'mega_group'].includes(rawPassType)) {
        return errorResponse(req, 'Missing or invalid passType', 400);
      }

      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return errorResponse(req, 'Missing or invalid startDate (YYYY-MM-DD)', 400);
      }

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

      const passType = rawPassType;
      const baseDays = PASS_DAYS[passType] ?? 1;
      const baseMaxPeople = PASS_MAX_PEOPLE[passType] ?? 4;
      const amount = PASS_PRICES_AUD[passType] ?? 0;

      // If the user unlocked share bonus before purchase, apply it automatically and consume the flag.
      let applyShareBonus = false;
      try {
        const { data: profileRow } = await supabase
          .from('user_profiles')
          .select('share_bonus_unlocked')
          .eq('user_id', authUser.id)
          .maybeSingle();
        applyShareBonus = Boolean(profileRow?.share_bonus_unlocked);
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
        } else if (existingPass) {
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
            passType: ep.pass_type ?? passType,
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
        pass_type: passType,
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

      const { data: insertedPass, error: insertErr } = await supabase
        .from('passes')
        .insert(passRow)
        .select('id, purchased_at')
        .single();

      if (insertErr) {
        // Unique violation: concurrent insert with same idempotency key — return existing row.
        if (insertErr.code === '23505' && rawTxnId) {
          const { data: racedPass } = await supabase
            .from('passes')
            .select(
              'id, purchased_at, pass_type, valid_from, valid_until, expires_at, amount_paid, currency, share_bonus_applied, max_people',
            )
            .eq('user_id', authUser.id)
            .eq('payment_session_id', rawTxnId)
            .maybeSingle();

          if (racedPass) {
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
              passType: ep.pass_type ?? passType,
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
        return errorResponse(req, 'Payment captured but failed to create pass: ' + insertErr.message, 500, {
          reason: 'pass_insert_failed',
          postgresCode: insertErr.code ?? null,
        });
      }

      if (applyShareBonus) {
        // Consume the pre-purchase share bonus so it can't be reused.
        await supabase
          .from('user_profiles')
          .update({ share_bonus_unlocked: false, updated_at: new Date().toISOString() })
          .eq('user_id', authUser.id);
      }

      return jsonResponse(req, {
        success: true,
        receiptNumber,
        passType,
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
    const msg = err instanceof Error ? err.message : String(err ?? 'Internal server error');
    return errorResponse(req, msg || 'Internal server error', 500, { reason: 'unexpected' });
  }
});

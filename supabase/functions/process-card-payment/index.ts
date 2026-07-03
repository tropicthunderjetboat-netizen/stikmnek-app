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
import {
  calculatePassPriceAud,
  dynamicPassInclusiveDays,
  parsePartySizeAndExtended,
  validUntilOffsetDays,
  addCalendarDaysIso,
  calendarDaysBetweenValidRange,
  endOfDayUtcIso,
  validatePassStartDateIso,
} from '../_shared/pricingDynamic.ts';
import { transactionalPassProductNameEn } from '../_shared/passDisplay.ts';
import { notifyAdminsOfPassPurchase } from '../_shared/purchaseNotify.ts';

type SupabaseServiceClient = ReturnType<typeof createClient>;
const BEARER_PREFIX = /^Bearer\s+/i;

/** @deprecated Use calculatePassPriceAud from pricingDynamic */
function passPriceAud(partySize: number, isExtended: boolean): number {
  return calculatePassPriceAud(partySize, isExtended);
}

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
  const { data: { user }, error } = await authClient.auth.getUser(token);
  const jwtIss = decodeJwtIssUnverified(token);
  const expectedIss = expectedJwtIssuerFromSupabaseUrl(ctx.supabaseUrl);
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // Dashboard secret bug workaround:
    // Some projects cannot edit/delete reserved `SUPABASE_*` secrets in the Dashboard.
    // Prefer a non-reserved secret name for the anon key (used ONLY to validate caller JWT):
    //   APP_SUPABASE_ANON_KEY = <project anon public key>
    // Keep legacy fallbacks for safety.
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
    if (!supabaseUrl.trim() || !supabaseServiceKey.trim()) {
      return errorResponse(req, 'Server configuration error', 500, {
        reason: 'missing_supabase_secrets',
      });
    }
    if (!supabaseAnonKey) {
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
      return authResult.response;
    }
    const authUser = authResult.user;

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? body?.Action;

    if (!action) {
      return errorResponse(req, 'Missing action. Use action: purchase_pass for pass purchase.', 400);
    }

    if (action === 'purchase_superstar') {
      return errorResponse(
        req,
        'Super Star purchases are processed via PayPal. Please update the app or pay with PayPal in the review flow.',
        501,
        { reason: 'superstar_use_paypal' },
      );
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

      const startDateRaw = body?.startDate ?? body?.start_date;
      const startCheck = validatePassStartDateIso(startDateRaw);
      if (!startCheck.ok) {
        return errorResponse(req, startCheck.error, 400);
      }
      const startDate = startCheck.startDate;

      const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      const parsed = parsePartySizeAndExtended(b);
      if (!parsed) {
        const partyReceived = b.partySize ?? b.party_size ?? null;
        const safeKeys =
          b && typeof b === 'object'
            ? Object.keys(b).filter((k) => !/^card/i.test(k) && k !== 'cardCvv' && k !== 'cardExpiry')
            : [];
        console.warn('[process-card-payment] invalid_party_size', {
          partyReceived,
          type: typeof partyReceived,
          safeKeys,
        });
        return errorResponse(req, 'Missing or invalid partySize (integer 1-20)', 400, {
          reason: 'invalid_party_size',
          partyReceived,
          bodyKeys: safeKeys,
        });
      }
      const { partySize, isExtended } = parsed;
      const amount = passPriceAud(partySize, isExtended);
      const passTypeDb: DbPassType = 'dynamic';

      let grantSecondWeek = false;
      if (isExtended) {
        const { data: profRow, error: profErr } = await supabase
          .from('user_profiles')
          .select('share_bonus_unlocked')
          .eq('user_id', authUser.id)
          .maybeSingle();
        if (profErr) console.error('process-card-payment: profile share flag', profErr);
        grantSecondWeek = !!(profRow as { share_bonus_unlocked?: boolean } | null)?.share_bonus_unlocked;
      }

      const maxPeople = partySize;
      const validFrom = startDate;
      const validUntil = addCalendarDaysIso(startDate, validUntilOffsetDays(isExtended, grantSecondWeek));
      const expiresAt = endOfDayUtcIso(validUntil);
      const inclusiveDays = dynamicPassInclusiveDays(isExtended, grantSecondWeek);
      const shareBonusApplied = isExtended && grantSecondWeek;
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
            passType: semanticPassIdFromDb(
              (normalizePassTypeToDb(String(ep.pass_type ?? '')) ?? 'dynamic') as DbPassType,
            ),
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
        share_bonus_applied: shareBonusApplied,
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
        if (
          typeof insertErr.message === 'string' &&
          insertErr.message.includes('passes_pass_type_check')
        ) {
          console.error(
            'process-card-payment: passes.pass_type does not allow `dynamic`. Apply migration 20260505180000_ensure_passes_pass_type_dynamic (or 20260504120000_add_dynamic_pass_type).',
          );
          return errorResponse(
            req,
            'Pass could not be saved: database needs the latest pass type update. Please contact support or apply Supabase migrations, then retry.',
            500,
            {
              reason: 'pass_type_constraint',
              postgresCode: insertErr.code ?? null,
            },
          );
        }
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
              passType: semanticPassIdFromDb(
              (normalizePassTypeToDb(String(ep.pass_type ?? '')) ?? 'dynamic') as DbPassType,
            ),
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

      if (grantSecondWeek) {
        const { error: clrErr } = await supabase
          .from('user_profiles')
          .update({ share_bonus_unlocked: false, updated_at: new Date().toISOString() })
          .eq('user_id', authUser.id);
        if (clrErr) console.error('process-card-payment: clear share_bonus_unlocked', clrErr);
      }

      try {
        await notifyAdminsOfPassPurchase({
          receiptNumber,
          amount,
          currency: 'AUD',
          paymentMethod: 'Card',
          buyerEmail: authUser.email ?? null,
          validFrom,
          validUntil,
          partySize,
          userId: authUser.id,
        });
      } catch (notifyErr: unknown) {
        console.error('process-card-payment: admin purchase notify error:', notifyErr);
      }

      return jsonResponse(req, {
        success: true,
        receiptNumber,
        passType: semanticPassIdFromDb(passTypeDb),
        passLabel: transactionalPassProductNameEn(),
        amount,
        currency: 'AUD',
        expiresAt,
        validFrom,
        validUntil,
        days: inclusiveDays,
        shareBonusApplied,
        group: `Up to ${partySize} people (ages 6+)`,
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

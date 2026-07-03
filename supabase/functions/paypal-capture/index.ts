// deno-lint-ignore-file no-explicit-any
/**
 * paypal-capture Edge Function
 * Captures PayPal orders bound at create-checkout; creates pass or Super Star credit.
 * Handles idempotency, 422 already-captured recovery, and insert races (23505).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizePassTypeToDb, semanticPassIdFromDb, type DbPassType } from '../_shared/passTypes.ts';
import {
  calculatePassPriceAud,
  dynamicPassInclusiveDays,
  validUntilOffsetDays,
  addCalendarDaysIso,
  calendarDaysBetweenValidRange,
  endOfDayUtcIso,
  capturePayPalOrder,
  capturedAmountAudFromOrder,
  getPayPalAccessToken,
  getPayPalOrder,
  isPayPalSandbox,
  orderStatus,
  SUPERSTAR_PRICE_AUD,
} from '../_shared/pricingDynamic.ts';
import { transactionalPassProductNameEn } from '../_shared/passDisplay.ts';
import { notifyAdminsOfPassPurchase } from '../_shared/purchaseNotify.ts';
import {
  createEdgeClients,
  errorResponse,
  getAuthUserFromRequest,
  jsonResponse,
  type EdgeAuthUser,
  getSafeCorsHeaders,
} from '../_shared/cors.ts';

type PendingOrder = {
  paypal_order_id: string;
  user_id: string;
  product_type: 'pass' | 'superstar';
  amount_aud: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown>;
  result_metadata: Record<string, unknown>;
};

function receiptNumberFromPassId(passId: string): string {
  return `STK-${passId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function passJsonFromRow(
  ep: Record<string, unknown>,
  partySizeFallback: number,
): Record<string, unknown> {
  const vf = String(ep.valid_from ?? '');
  const vu = String(ep.valid_until ?? '');
  const exAt = String(ep.expires_at ?? '');
  const rid = String(ep.id ?? '');
  const amt = Number(ep.amount_paid) || 0;
  return {
    success: true,
    idempotentReplay: true,
    receiptNumber: receiptNumberFromPassId(rid),
    passType: semanticPassIdFromDb((normalizePassTypeToDb(String(ep.pass_type ?? '')) ?? 'dynamic') as DbPassType),
    passLabel: transactionalPassProductNameEn(),
    amount: amt,
    currency: (ep.currency as string) || 'AUD',
    paymentMethod: 'paypal',
    expiresAt: exAt,
    validFrom: vf,
    validUntil: vu,
    days: calendarDaysBetweenValidRange(vf, vu),
    shareBonusApplied: Boolean(ep.share_bonus_applied),
    group: `Up to ${Number(ep.max_people ?? partySizeFallback)} people (ages 6+)`,
    partySize: Number(ep.max_people ?? partySizeFallback),
    sessionId: rid,
    productType: 'pass',
  };
}

async function findPassByOrderId(
  supabase: SupabaseClient,
  userId: string,
  orderIdStr: string,
  partySizeFallback = 1,
): Promise<Record<string, unknown> | null> {
  const { data: existingPass } = await supabase
    .from('passes')
    .select(
      'id, purchased_at, pass_type, valid_from, valid_until, expires_at, amount_paid, currency, share_bonus_applied, max_people',
    )
    .eq('user_id', userId)
    .eq('payment_session_id', orderIdStr)
    .maybeSingle();
  if (!existingPass) return null;
  return passJsonFromRow(existingPass as Record<string, unknown>, partySizeFallback);
}

async function loadPendingOrder(
  supabase: SupabaseClient,
  orderIdStr: string,
): Promise<PendingOrder | null> {
  const { data, error } = await supabase
    .from('paypal_pending_orders')
    .select('*')
    .eq('paypal_order_id', orderIdStr)
    .maybeSingle();
  if (error) {
    console.warn('[paypal-capture] pending order lookup:', error.message);
    return null;
  }
  return data as PendingOrder | null;
}

async function markPendingCaptured(
  supabase: SupabaseClient,
  orderIdStr: string,
  resultMetadata: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from('paypal_pending_orders')
    .update({
      status: 'captured',
      captured_at: new Date().toISOString(),
      result_metadata: resultMetadata,
    })
    .eq('paypal_order_id', orderIdStr);
}

async function fulfillSuperstar(
  supabase: SupabaseClient,
  user: EdgeAuthUser,
  pending: PendingOrder,
  orderIdStr: string,
): Promise<Record<string, unknown>> {
  const { data: freshRow } = await supabase
    .from('paypal_pending_orders')
    .select('status, result_metadata')
    .eq('paypal_order_id', orderIdStr)
    .maybeSingle();

  if (freshRow?.status === 'captured') {
    const stored = Number((freshRow.result_metadata as Record<string, unknown>)?.superstar_credits);
    return {
      success: true,
      idempotentReplay: true,
      productType: 'superstar',
      superstar_credits: Number.isFinite(stored) ? stored : undefined,
      amount: SUPERSTAR_PRICE_AUD,
      currency: 'AUD',
    };
  }

  const { data: locked, error: lockErr } = await supabase
    .from('paypal_pending_orders')
    .update({ status: 'captured', captured_at: new Date().toISOString() })
    .eq('paypal_order_id', orderIdStr)
    .eq('status', 'pending')
    .select('paypal_order_id')
    .maybeSingle();

  if (lockErr || !locked) {
    const replay = await supabase
      .from('paypal_pending_orders')
      .select('result_metadata')
      .eq('paypal_order_id', orderIdStr)
      .maybeSingle();
    const stored = Number((replay.data?.result_metadata as Record<string, unknown>)?.superstar_credits);
    if (replay.data) {
      return {
        success: true,
        idempotentReplay: true,
        productType: 'superstar',
        superstar_credits: Number.isFinite(stored) ? stored : undefined,
        amount: SUPERSTAR_PRICE_AUD,
        currency: 'AUD',
      };
    }
    throw new Error('Could not finalize Super Star purchase. Contact support.');
  }

  const { data: newCount, error: rpcError } = await supabase.rpc('increment_superstar_credits', {
    p_user_id: user.id,
  });
  if (rpcError) {
    console.error('[paypal-capture] increment_superstar_credits:', rpcError);
    await supabase
      .from('paypal_pending_orders')
      .update({ status: 'pending', captured_at: null })
      .eq('paypal_order_id', orderIdStr);
    throw new Error('Payment captured but failed to add Super Star credit: ' + rpcError.message);
  }

  const credits = typeof newCount === 'number' ? newCount : Number(newCount) || 1;
  await supabase
    .from('paypal_pending_orders')
    .update({ result_metadata: { superstar_credits: credits } })
    .eq('paypal_order_id', orderIdStr);

  return {
    success: true,
    productType: 'superstar',
    superstar_credits: credits,
    amount: SUPERSTAR_PRICE_AUD,
    currency: 'AUD',
  };
}

async function fulfillPass(
  supabase: SupabaseClient,
  user: EdgeAuthUser,
  pending: PendingOrder,
  orderIdStr: string,
  capturedAud: number,
): Promise<Record<string, unknown>> {
  const meta = pending.metadata ?? {};
  const partySize = Number(meta.partySize);
  const isExtended = meta.isExtended === true || meta.isExtended === 'true' || meta.isExtended === 1;
  const startDate = String(meta.startDate ?? '');

  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 20 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('Stored checkout metadata is invalid. Contact support with your PayPal receipt.');
  }

  const expectedAmount = calculatePassPriceAud(partySize, isExtended);
  if (Math.abs(capturedAud - expectedAmount) > 0.02) {
    throw new Error('Captured PayPal amount does not match pass price.');
  }

  const existing = await findPassByOrderId(supabase, user.id, orderIdStr, partySize);
  if (existing) {
    await markPendingCaptured(supabase, orderIdStr, { pass_id: existing.sessionId });
    return existing;
  }

  let grantSecondWeek = false;
  if (isExtended) {
    const { data: profRow, error: profErr } = await supabase
      .from('user_profiles')
      .select('share_bonus_unlocked')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profErr) console.error('[paypal-capture] profile share flag', profErr);
    grantSecondWeek = !!(profRow as { share_bonus_unlocked?: boolean } | null)?.share_bonus_unlocked;
  }

  const shareBonusApplied = isExtended && grantSecondWeek;
  const validFrom = startDate;
  const validUntil = addCalendarDaysIso(startDate, validUntilOffsetDays(isExtended, grantSecondWeek));
  const expiresAt = endOfDayUtcIso(validUntil);
  const inclusiveDays = dynamicPassInclusiveDays(isExtended, grantSecondWeek);
  const amount = expectedAmount;
  const receiptNumber = `STK-${Date.now().toString(36).toUpperCase()}`;

  const passRow = {
    user_id: user.id,
    pass_type: 'dynamic' as DbPassType,
    active: true,
    valid_from: validFrom,
    valid_until: validUntil,
    expires_at: expiresAt,
    max_people: partySize,
    share_bonus_applied: shareBonusApplied,
    amount_paid: amount,
    currency: 'AUD',
    payment_provider: 'paypal',
    payment_session_id: orderIdStr,
    purchased_at: new Date().toISOString(),
  };

  const { data: insertedPass, error: insertErr } = await supabase
    .from('passes')
    .insert(passRow)
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const raced = await findPassByOrderId(supabase, user.id, orderIdStr, partySize);
      if (raced) {
        await markPendingCaptured(supabase, orderIdStr, { pass_id: raced.sessionId });
        return raced;
      }
    }
    console.error('[paypal-capture] Insert passes error:', insertErr);
    throw new Error('Payment captured but failed to create pass: ' + insertErr.message);
  }

  if (grantSecondWeek) {
    await supabase
      .from('user_profiles')
      .update({ share_bonus_unlocked: false, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  }

  const passId = String(insertedPass?.id ?? '');
  await markPendingCaptured(supabase, orderIdStr, { pass_id: passId, receiptNumber });

  try {
    await notifyAdminsOfPassPurchase({
      receiptNumber: passId ? receiptNumberFromPassId(passId) : receiptNumber,
      amount,
      currency: 'AUD',
      paymentMethod: 'PayPal',
      buyerEmail: user.email ?? null,
      validFrom,
      validUntil,
      partySize,
      userId: user.id,
    });
  } catch (notifyErr: unknown) {
    console.error('[paypal-capture] admin purchase notify error:', notifyErr);
  }

  return {
    success: true,
    receiptNumber: passId ? receiptNumberFromPassId(passId) : receiptNumber,
    passType: semanticPassIdFromDb('dynamic'),
    passLabel: transactionalPassProductNameEn(),
    amount,
    currency: 'AUD',
    paymentMethod: 'paypal',
    expiresAt,
    validFrom,
    validUntil,
    days: inclusiveDays,
    shareBonusApplied,
    group: `Up to ${partySize} people (ages 6+)`,
    partySize,
    isExtended,
    sessionId: passId || receiptNumber,
    productType: 'pass',
  };
}

async function recoverCompletedOrder(
  supabase: SupabaseClient,
  user: EdgeAuthUser,
  pending: PendingOrder,
  orderIdStr: string,
  accessToken: string,
  sandbox: boolean,
): Promise<Record<string, unknown> | null> {
  let orderJson: Record<string, unknown>;
  try {
    orderJson = await getPayPalOrder(orderIdStr, accessToken, sandbox);
  } catch (err) {
    console.error('[paypal-capture] recovery GET order failed:', err);
    return null;
  }

  const status = orderStatus(orderJson);
  if (status !== 'COMPLETED') return null;

  const capturedAud = capturedAmountAudFromOrder(orderJson);
  if (capturedAud == null) return null;

  const expectedStored = Number(pending.amount_aud);
  if (Math.abs(capturedAud - expectedStored) > 0.02) {
    console.error('[paypal-capture] recovery amount mismatch', { capturedAud, expectedStored });
    return null;
  }

  if (pending.product_type === 'superstar') {
    return fulfillSuperstar(supabase, user, pending, orderIdStr);
  }
  return fulfillPass(supabase, user, pending, orderIdStr, capturedAud);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }

  try {
    const clients = createEdgeClients();
    if (!clients) {
      return errorResponse(req, 'Server configuration error', 500, { reason: 'missing_supabase_secrets' });
    }
    const { authClient, serviceClient } = clients;

    const authResult = await getAuthUserFromRequest(authClient, req);
    if ('response' in authResult) return authResult.response;
    const user = authResult.user;

    const body = await req.json().catch(() => ({}));
    const bodyObj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const paypalOrderId = bodyObj.paypalOrderId ?? bodyObj.orderId;

    if (!paypalOrderId) {
      return errorResponse(req, 'Missing paypalOrderId', 400);
    }

    const orderIdStr = String(paypalOrderId);
    const pending = await loadPendingOrder(serviceClient, orderIdStr);

    if (!pending) {
      return errorResponse(
        req,
        'Checkout session not found. Start payment again from checkout (order may have expired).',
        404,
        { reason: 'pending_order_not_found' },
      );
    }

    if (pending.user_id !== user.id) {
      console.error('[paypal-capture] order user mismatch', {
        orderUser: pending.user_id,
        caller: user.id,
        orderId: orderIdStr.slice(0, 12),
      });
      return errorResponse(req, 'This PayPal order does not belong to your account.', 403, {
        reason: 'order_user_mismatch',
      });
    }

    const partySizeFallback = Number(pending.metadata?.partySize) || 1;

    if (pending.product_type === 'pass') {
      const existingPass = await findPassByOrderId(serviceClient, user.id, orderIdStr, partySizeFallback);
      if (existingPass) {
        return jsonResponse(req, existingPass);
      }
    }

    if (pending.status === 'captured') {
      if (pending.product_type === 'superstar') {
        return jsonResponse(req, await fulfillSuperstar(serviceClient, user, pending, orderIdStr));
      }
      const existingPass = await findPassByOrderId(serviceClient, user.id, orderIdStr, partySizeFallback);
      if (existingPass) return jsonResponse(req, existingPass);
    }

    const sandbox = isPayPalSandbox();
    const accessToken = await getPayPalAccessToken(sandbox);

    console.log('[paypal-capture] request', {
      userId: user.id,
      orderId: orderIdStr.slice(0, 8) + '…',
      productType: pending.product_type,
      amount: pending.amount_aud,
      paypalMode: sandbox ? 'sandbox' : 'live',
    });

    const captureResult = await capturePayPalOrder(orderIdStr, accessToken, sandbox);

    if (!captureResult.ok) {
      const { status, body: errBody } = captureResult;
      console.error('[paypal-capture] PayPal capture failed:', status, errBody);

      if (status === 422 || status === 404) {
        const recovered = await recoverCompletedOrder(
          serviceClient,
          user,
          pending,
          orderIdStr,
          accessToken,
          sandbox,
        );
        if (recovered) {
          return jsonResponse(req, { ...recovered, recoveredAfterCaptureConflict: true });
        }
      }

      if (status === 404) {
        return errorResponse(req, 'Order not found or already captured', 404, {
          reason: 'paypal_order_not_found',
          paypalStatus: status,
        });
      }
      if (status === 422) {
        return errorResponse(
          req,
          'Payment was captured but your pass could not be activated automatically. Please contact support with your PayPal receipt — we will fix this promptly.',
          422,
          { reason: 'paypal_captured_pass_recovery_failed', paypalStatus: status },
        );
      }
      const msg = (errBody as { message?: string })?.message ?? JSON.stringify(errBody).slice(0, 200);
      return errorResponse(req, 'PayPal capture failed: ' + String(msg).slice(0, 200), 502, {
        reason: 'paypal_capture_failed',
        paypalStatus: status,
      });
    }

    const capturedAud = capturedAmountAudFromOrder(captureResult.json);
    const expectedStored = Number(pending.amount_aud);

    if (capturedAud == null || Math.abs(capturedAud - expectedStored) > 0.02) {
      console.error('[paypal-capture] amount mismatch', {
        capturedAud,
        expectedStored,
        orderId: orderIdStr.slice(0, 12),
      });
      return errorResponse(req, 'Captured PayPal amount does not match checkout total. Contact support.', 400, {
        reason: 'paypal_amount_mismatch',
        expectedAmount: expectedStored,
        capturedAud,
      });
    }

    let result: Record<string, unknown>;
    if (pending.product_type === 'superstar') {
      result = await fulfillSuperstar(serviceClient, user, pending, orderIdStr);
    } else {
      result = await fulfillPass(serviceClient, user, pending, orderIdStr, capturedAud);
    }

    return jsonResponse(req, result);
  } catch (err: unknown) {
    console.error('[paypal-capture]', err);
    const msg = err instanceof Error ? err.message : String(err ?? 'Capture failed');
    return errorResponse(req, msg || 'Capture failed', 500, {
      reason: msg.includes('PAYPAL') ? 'paypal_config' : 'unexpected',
    });
  }
});

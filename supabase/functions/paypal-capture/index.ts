// deno-lint-ignore-file no-explicit-any
/**
 * paypal-capture Edge Function
 * Captures a PayPal order and creates the pass in the database.
 * Requires: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET in Supabase Edge Function secrets.
 * Optional: PAYPAL_MODE=sandbox (default) or live. (Also accepts PAYPAL_SANDBOX=true/false.)
 *
 * Debugging: Supabase Dashboard → Edge Functions → paypal-capture → Logs (this CLI may not expose `functions logs`).
 * Verify secrets: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE (sandbox vs live).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';
import { semanticPassIdFromDb, type DbPassType } from '../_shared/passTypes.ts';
import {
  calculatePassPriceAud,
  parsePartySizeAndExtended,
  validUntilOffsetDays,
} from '../_shared/pricingDynamic.ts';

function passTypeToBrandDisplay(passType: string): string {
  if (String(passType).toLowerCase() === 'dynamic') return 'StikmNek Pass';
  return 'StikmNek Pass';
}

/** Gross amount from PayPal capture response (AUD). */
function capturedAmountFromPayPalCapture(captureJson: Record<string, unknown>): number | null {
  try {
    const units = captureJson.purchase_units as unknown[] | undefined;
    const u0 = units?.[0] as Record<string, unknown> | undefined;
    const payments = u0?.payments as Record<string, unknown> | undefined;
    const caps = payments?.captures as unknown[] | undefined;
    const c0 = caps?.[0] as Record<string, unknown> | undefined;
    const amt = c0?.amount as Record<string, unknown> | undefined;
    const v = amt?.value;
    const n = parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function sendReceiptEmail(params: {
  toEmail: string;
  toName?: string | null;
  receiptNumber: string;
  passType: string;
  amount: number;
  currency: string;
  validFrom: string;
  validUntil: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY');
  if (!apiKey) {
    console.warn('[paypal-capture] SENDGRID_API_KEY not set - skipping receipt email');
    return { sent: false, skipped: true, error: 'SENDGRID_API_KEY not set' };
  }

  const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'no-reply@stikmnek.com';
  const fromName = Deno.env.get('SENDGRID_FROM_NAME') || 'StikmNek';

  const passLabel = passTypeToBrandDisplay(params.passType);

  const subject = `StikmNek receipt — ${passLabel}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 12px;">Thanks for your purchase!</h2>
      <p style="margin: 0 0 12px;">Your pass is now active.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
        <tr>
          <td style="padding: 6px 0; color: #555;">Receipt</td>
          <td style="padding: 6px 0; font-weight: 700;">${params.receiptNumber}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #555;">Pass</td>
          <td style="padding: 6px 0; font-weight: 700;">${passLabel}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #555;">Valid from</td>
          <td style="padding: 6px 0;">${params.validFrom}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #555;">Valid until</td>
          <td style="padding: 6px 0;">${params.validUntil}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #555;">Amount</td>
          <td style="padding: 6px 0; font-weight: 700;">${params.currency} ${params.amount.toFixed(2)}</td>
        </tr>
      </table>
      <p style="margin: 16px 0 0; color: #555; font-size: 12px;">
        If you have any issues, reply to this email and we’ll help.
      </p>
    </div>
  `;

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: params.toEmail, name: params.toName ?? undefined }],
          subject,
        },
      ],
      from: { email: fromEmail, name: fromName },
      content: [{ type: 'text/html', value: html }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[paypal-capture] SendGrid receipt error:', res.status, errText);
    return { sent: false, error: `SendGrid error: ${res.status}` };
  }

  return { sent: true };
}

async function getPayPalAccessToken(sandbox: boolean): Promise<string> {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const clientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set');
  }
  const base = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(clientId + ':' + clientSecret),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('PayPal auth failed: ' + res.status + ' ' + t);
  }
  const data = await res.json();
  return data.access_token;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function endOfDayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T23:59:59.999Z');
  return d.toISOString();
}

Deno.serve(async (req) => {
  const corsHeaders = getSafeCorsHeaders(req);
  const jsonResponse = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  const errorResponse = (message: string, status = 400, extra?: Record<string, unknown>) =>
    jsonResponse({ success: false, error: message, errorCode: status, ...extra }, status);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl.trim() || !serviceKey.trim()) {
      return errorResponse('Server configuration error', 500, { reason: 'missing_supabase_secrets' });
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Invalid or expired session', 401, {
        reason: 'auth_invalid',
        authError: authError?.message ?? null,
      });
    }

    const body = await req.json().catch(() => ({}));
    const paypalOrderId = body?.paypalOrderId ?? body?.orderId;
    const startDate = body?.startDate ?? body?.start_date;
    const parsed = parsePartySizeAndExtended(body as Record<string, unknown>);

    if (!paypalOrderId) {
      return errorResponse('Missing paypalOrderId', 400);
    }
    if (!parsed) {
      return errorResponse('Missing or invalid partySize (1-6) or isExtended', 400);
    }
    const { partySize, isExtended } = parsed;
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return errorResponse('Missing or invalid startDate (YYYY-MM-DD)', 400);
    }
    const expectedAmount = calculatePassPriceAud(partySize, isExtended);

    const mode = (Deno.env.get('PAYPAL_MODE') ?? Deno.env.get('PAYPAL_SANDBOX') ?? 'sandbox').toString().toLowerCase();
    const sandbox = mode !== 'live' && mode !== 'production' && mode !== 'false';
    console.log('[paypal-capture] request', {
      userId: user.id,
      paypalOrderId: String(paypalOrderId).slice(0, 8) + '…',
      partySize,
      isExtended,
      startDate,
      expectedAmount,
      paypalMode: sandbox ? 'sandbox' : 'live',
      ts: new Date().toISOString(),
    });

    const base = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    const accessToken = await getPayPalAccessToken(sandbox);

    const captureRes = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: '{}',
    });

    if (!captureRes.ok) {
      const errData = await captureRes.json().catch(() => ({}));
      const msg = errData?.message ?? errData?.details?.[0]?.description ?? await captureRes.text();
      console.error('[paypal-capture] PayPal capture failed:', captureRes.status, msg);
      if (captureRes.status === 404) {
        return errorResponse('Order not found or already captured', 404, {
          reason: 'paypal_order_not_found',
          paypalStatus: captureRes.status,
        });
      }
      if (captureRes.status === 422) {
        return errorResponse('Order already captured or invalid state', 422, {
          reason: 'paypal_order_invalid_state',
          paypalStatus: captureRes.status,
        });
      }
      return errorResponse(
        'PayPal capture failed: ' + (typeof msg === 'string' ? msg.slice(0, 200) : JSON.stringify(msg)),
        502,
        { reason: 'paypal_capture_failed', paypalStatus: captureRes.status },
      );
    }

    const captureJson = (await captureRes.json().catch(() => ({}))) as Record<string, unknown>;
    const capturedAud = capturedAmountFromPayPalCapture(captureJson);
    if (capturedAud == null || Math.abs(capturedAud - expectedAmount) > 0.02) {
      console.error('[paypal-capture] amount mismatch', {
        capturedAud,
        expectedAmount,
        partySize,
        isExtended,
        paypalOrderId: String(paypalOrderId).slice(0, 12) + '…',
      });
      return errorResponse('Captured PayPal amount does not match pass price. Order not completed.', 400, {
        reason: 'paypal_amount_mismatch',
        expectedAmount,
        capturedAud,
      });
    }

    console.log('[paypal-capture] capture_ok', {
      expectedAmount,
      capturedAud,
      partySize,
      isExtended,
      ts: new Date().toISOString(),
    });

    const passTypeDb: DbPassType = 'dynamic';
    const amount = expectedAmount;
    const validFrom = startDate;
    const shareBonusApplied = false;
    const maxPeople = partySize;
    const validUntil = addDays(startDate, validUntilOffsetDays(isExtended));
    const expiresAt = endOfDayDate(validUntil);
    const inclusiveDays = isExtended ? 14 : 1;
    const receiptNumber = body?.receiptNumber ?? `STK-${Date.now().toString(36).toUpperCase()}`;

    const passRow = {
      user_id: user.id,
      pass_type: passTypeDb,
      active: true,
      valid_from: validFrom,
      valid_until: validUntil,
      expires_at: expiresAt,
      max_people: maxPeople,
      share_bonus_applied: shareBonusApplied,
      amount_paid: amount,
      currency: 'AUD',
      payment_provider: 'paypal',
      purchased_at: new Date().toISOString(),
    };

    const { data: insertedPass, error: insertErr } = await supabase
      .from('passes')
      .insert(passRow)
      .select('id')
      .single();

    if (insertErr) {
      console.error('[paypal-capture] Insert passes error:', insertErr);
      if (
        typeof insertErr.message === 'string' &&
        insertErr.message.includes('passes_pass_type_check')
      ) {
        return errorResponse(
          'Pass could not be saved: database needs the latest pass type update. Apply Supabase migrations (pass_type dynamic), then contact support if this persists.',
          500,
          { reason: 'pass_type_constraint', postgresCode: insertErr.code ?? null },
        );
      }
      return errorResponse('Payment captured but failed to create pass: ' + insertErr.message, 500, {
        reason: 'pass_insert_failed',
        postgresCode: insertErr.code ?? null,
      });
    }

    // Send receipt email (best-effort; do not fail purchase if email fails)
    let receiptEmail: { sent: boolean; skipped?: boolean; error?: string } | null = null;
    try {
      const buyerEmail = user.email;
      if (buyerEmail) {
        receiptEmail = await sendReceiptEmail({
          toEmail: buyerEmail,
          toName: (user.user_metadata as any)?.full_name ?? (user.user_metadata as any)?.name ?? null,
          receiptNumber,
          passType: passTypeDb,
          amount,
          currency: 'AUD',
          validFrom,
          validUntil,
        });
      } else {
        receiptEmail = { sent: false, skipped: true, error: 'No user email' };
      }
    } catch (emailErr: any) {
      console.error('[paypal-capture] receipt email error:', emailErr);
      receiptEmail = { sent: false, error: emailErr?.message ?? 'Receipt email failed' };
    }

    return jsonResponse({
      success: true,
      receiptNumber,
      passType: semanticPassIdFromDb(passTypeDb),
      passLabel: 'StikmNek Pass',
      amount,
      currency: 'AUD',
      expiresAt,
      validFrom,
      validUntil,
      days: inclusiveDays,
      shareBonusApplied,
      group: `Up to ${partySize} people (ages 6+)`,
      sessionId: insertedPass?.id ?? receiptNumber,
      receiptEmail,
    });
  } catch (err: any) {
    console.error('[paypal-capture]', err);
    return errorResponse(err?.message ?? 'Capture failed', 500, {
      reason: err?.name === 'Error' && String(err?.message).includes('PAYPAL') ? 'paypal_config' : 'unexpected',
    });
  }
});

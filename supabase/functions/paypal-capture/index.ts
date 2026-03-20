// deno-lint-ignore-file no-explicit-any
/**
 * paypal-capture Edge Function
 * Captures a PayPal order and creates the pass in the database.
 * Requires: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET in Supabase Edge Function secrets.
 * Optional: PAYPAL_MODE=sandbox (default) or live. (Also accepts PAYPAL_SANDBOX=true/false.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PASS_DAYS: Record<string, number> = { daily: 1, weekly: 6, monthly: 6 };
const PASS_MAX_PEOPLE: Record<string, number> = { daily: 4, weekly: 4, monthly: 7 };
const PASS_PRICES_AUD: Record<string, number> = { daily: 15, weekly: 45, monthly: 99 };

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

function passTypeToBrandDisplay(passType: string): string {
  const t = String(passType ?? '').toLowerCase().trim();
  if (t === 'daily') return 'Family Explorer Pass';
  if (t === 'weekly') return 'Extended Group Adventure Pass';
  if (t === 'monthly') return 'Ultimate Crew Experience Pass';
  return 'StikmNek Pass';
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
    const supabase = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Invalid or expired session', 401);
    }

    const body = await req.json().catch(() => ({}));
    const paypalOrderId = body?.paypalOrderId ?? body?.orderId;
    const passType = (body?.passType ?? body?.pass_type ?? '').toLowerCase();
    const startDate = body?.startDate ?? body?.start_date;

    if (!paypalOrderId) {
      return errorResponse('Missing paypalOrderId', 400);
    }
    if (!passType || !['daily', 'weekly', 'monthly'].includes(passType)) {
      return errorResponse('Missing or invalid passType', 400);
    }
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return errorResponse('Missing or invalid startDate (YYYY-MM-DD)', 400);
    }

    const mode = (Deno.env.get('PAYPAL_MODE') ?? Deno.env.get('PAYPAL_SANDBOX') ?? 'sandbox').toString().toLowerCase();
    const sandbox = mode !== 'live' && mode !== 'production' && mode !== 'false';
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
        return errorResponse('Order not found or already captured', 404);
      }
      if (captureRes.status === 422) {
        return errorResponse('Order already captured or invalid state', 422);
      }
      return errorResponse('PayPal capture failed: ' + (typeof msg === 'string' ? msg.slice(0, 200) : JSON.stringify(msg)), 502);
    }

    const days = PASS_DAYS[passType] ?? 1;
    const maxPeople = PASS_MAX_PEOPLE[passType] ?? 4;
    const amount = PASS_PRICES_AUD[passType] ?? 0;
    const validFrom = startDate;
    const validUntil = addDays(startDate, days);
    const expiresAt = endOfDayDate(validUntil);
    const receiptNumber = body?.receiptNumber ?? `STK-${Date.now().toString(36).toUpperCase()}`;

    const passRow = {
      user_id: user.id,
      pass_type: passType,
      active: true,
      valid_from: validFrom,
      valid_until: validUntil,
      expires_at: expiresAt,
      max_people: maxPeople,
      share_bonus_applied: false,
      purchased_at: new Date().toISOString(),
    };

    const { data: insertedPass, error: insertErr } = await supabase
      .from('passes')
      .insert(passRow)
      .select('id')
      .single();

    if (insertErr) {
      console.error('[paypal-capture] Insert passes error:', insertErr);
      return errorResponse('Payment captured but failed to create pass: ' + insertErr.message, 500);
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
          passType,
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
      passType,
      amount,
      currency: 'AUD',
      expiresAt,
      validFrom,
      validUntil,
      days,
      sessionId: insertedPass?.id ?? receiptNumber,
      receiptEmail,
    });
  } catch (err: any) {
    console.error('[paypal-capture]', err);
    return errorResponse(err?.message ?? 'Capture failed', 500);
  }
});

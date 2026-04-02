// deno-lint-ignore-file no-explicit-any
/**
 * create-checkout Edge Function
 * Creates a PayPal order for pass purchase (sandbox or live).
 * Requires: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET in Supabase Edge Function secrets.
 * Optional: PAYPAL_MODE=sandbox (default) or live. (Also accepts PAYPAL_SANDBOX=true/false.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';
import { normalizePassTypeToDb, semanticPassIdFromDb, type DbPassType } from '../_shared/passTypes.ts';

const PASS_PRICES_AUD: Record<DbPassType, number> = {
  daily: 15,
  weekly: 45,
  monthly: 99,
  mega_group: 199,
};

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
    // When "Verify JWT" is ON in Supabase, the gateway may not forward the Authorization header,
    // so the function gets no token and returns 401. Set Verify JWT to OFF for this function;
    // we still validate the token below with getUser().
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
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Invalid or expired session', 401, {
        reason: 'auth_invalid',
        authError: authError?.message ?? null,
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawPassType = String(body?.passType ?? body?.pass_type ?? '').trim();
    const passTypeDb = normalizePassTypeToDb(rawPassType);
    const startDate = body?.startDate ?? body?.start_date;
    const returnUrl = body?.returnUrl ?? body?.return_url;
    const cancelUrl = body?.cancelUrl ?? body?.cancel_url;

    if (!passTypeDb || !startDate) {
      return errorResponse('Missing passType or startDate', 400);
    }

    const amount = PASS_PRICES_AUD[passTypeDb];
    if (amount == null) {
      return errorResponse('Invalid passType', 400);
    }

    const mode = (Deno.env.get('PAYPAL_MODE') ?? Deno.env.get('PAYPAL_SANDBOX') ?? 'sandbox').toString().toLowerCase();
    const sandbox = mode !== 'live' && mode !== 'production' && mode !== 'false';
    const base = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    const accessToken = await getPayPalAccessToken(sandbox);

    const semanticId = semanticPassIdFromDb(passTypeDb);
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `pass_${passTypeDb}_${startDate}`,
          amount: {
            currency_code: 'AUD',
            value: amount.toFixed(2),
          },
          description: `StikmNek ${semanticId} pass — valid from ${startDate}`,
        },
      ],
      application_context: {
        brand_name: 'StikmNek',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: returnUrl || undefined,
        cancel_url: cancelUrl || undefined,
      },
    };

    const orderRes = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error('[create-checkout] PayPal create order failed:', orderRes.status, errText);
      return errorResponse('PayPal could not create order: ' + errText.slice(0, 200), 502, {
        reason: 'paypal_create_order_failed',
        paypalStatus: orderRes.status,
      });
    }

    const orderData = await orderRes.json();
    const orderId = orderData.id;
    const approveLink = orderData.links?.find((l: any) => l.rel === 'approve');
    const approvalUrl = approveLink?.href;

    if (!orderId || !approvalUrl) {
      return errorResponse('PayPal did not return approval URL', 502, { reason: 'paypal_missing_approval_link' });
    }

    return jsonResponse({
      success: true,
      orderId,
      approvalUrl,
      amount,
      currency: 'AUD',
      passType: semanticId,
      startDate,
    });
  } catch (err: any) {
    console.error('[create-checkout]', err);
    return errorResponse(err?.message ?? 'Create checkout failed', 500, {
      reason: String(err?.message ?? '').includes('PAYPAL') ? 'paypal_config' : 'unexpected',
    });
  }
});

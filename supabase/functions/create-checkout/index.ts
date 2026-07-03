// deno-lint-ignore-file no-explicit-any
/**
 * create-checkout Edge Function
 * Creates a PayPal order for pass purchase or Super Star credit ($5 AUD).
 * Stores order → user binding in paypal_pending_orders before returning orderId.
 */

import { getSafeCorsHeaders } from '../_shared/cors.ts';
import { semanticPassIdFromDb, type DbPassType } from '../_shared/passTypes.ts';
import {
  calculatePassPriceAud,
  parsePartySizeAndExtended,
  validatePassStartDateIso,
  getPayPalAccessToken,
  isPayPalSandbox,
  payPalApiBase,
  SUPERSTAR_PRICE_AUD,
} from '../_shared/pricingDynamic.ts';
import {
  createEdgeClients,
  errorResponse,
  getAuthUserFromRequest,
  jsonResponse,
} from '../_shared/cors.ts';

type ProductType = 'pass' | 'superstar';

function parseProductType(body: Record<string, unknown>): ProductType {
  const raw = String(body.productType ?? body.product_type ?? 'pass').toLowerCase();
  return raw === 'superstar' ? 'superstar' : 'pass';
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
    const { authClient, serviceClient, authClientKeySource } = clients;

    const authResult = await getAuthUserFromRequest(authClient, req);
    if ('response' in authResult) return authResult.response;
    const user = authResult.user;

    const body = await req.json().catch(() => ({}));
    const bodyObj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const productType = parseProductType(bodyObj);
    const returnUrl = bodyObj.returnUrl ?? bodyObj.return_url;
    const cancelUrl = bodyObj.cancelUrl ?? bodyObj.cancel_url;

    let amount: number;
    let description: string;
    let referenceId: string;
    let metadata: Record<string, unknown>;
    let customId: string;

    if (productType === 'superstar') {
      amount = SUPERSTAR_PRICE_AUD;
      const businessId = String(bodyObj.businessId ?? bodyObj.business_id ?? '').trim();
      const businessName = String(bodyObj.businessName ?? bodyObj.business_name ?? 'business').trim();
      description = `StikmNek Super Star review — ${businessName.slice(0, 80)}`;
      referenceId = `superstar_${businessId || 'review'}`;
      metadata = { businessId: businessId || null, businessName };
      customId = `${user.id}|superstar`.slice(0, 127);
    } else {
      const startDateRaw = bodyObj.startDate ?? bodyObj.start_date;
      const startCheck = validatePassStartDateIso(startDateRaw);
      if (!startCheck.ok) {
        return errorResponse(req, startCheck.error, 400);
      }
      const startDate = startCheck.startDate;

      const parsed = parsePartySizeAndExtended(bodyObj);
      if (!parsed) {
        return errorResponse(
          req,
          'Missing or invalid partySize (1–20). Go back, confirm how many people (ages 6+), then try again.',
          400,
        );
      }
      const { partySize, isExtended } = parsed;
      amount = calculatePassPriceAud(partySize, isExtended);

      const clientExpected = Number(bodyObj.expectedAmountAud ?? bodyObj.expected_amount_aud);
      if (Number.isFinite(clientExpected) && Math.abs(clientExpected - amount) > 0.02) {
        return errorResponse(
          req,
          `Checkout total mismatch (expected A$${clientExpected.toFixed(2)}, calculated A$${amount.toFixed(2)} for ${partySize} guests). Go back, confirm group size and pass type, then try again.`,
          409,
          { expectedAmount: amount, clientExpected, partySize, isExtended },
        );
      }

      const passTypeDb: DbPassType = 'dynamic';
      semanticPassIdFromDb(passTypeDb);
      description = `StikmNek Pass — ${partySize} pax (${isExtended ? '7d' : '24h'}) from ${startDate}`;
      referenceId = `pass_dynamic_${partySize}p_${isExtended ? '7d' : '1d'}_${startDate}`;
      metadata = { partySize, isExtended, startDate, expectedAmount: amount };
      customId = `${user.id}|pass|${partySize}|${isExtended ? 1 : 0}|${startDate}`.slice(0, 127);
    }

    const sandbox = isPayPalSandbox();
    const accessToken = await getPayPalAccessToken(sandbox);
    const base = payPalApiBase(sandbox);

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: referenceId,
          custom_id: customId,
          amount: {
            currency_code: 'AUD',
            value: amount.toFixed(2),
          },
          description,
        },
      ],
      application_context: {
        brand_name: 'StikmNek',
        // NO_PREFERENCE allows guest debit/credit card (no PayPal account). LOGIN forced wallet sign-in.
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: returnUrl || undefined,
        cancel_url: cancelUrl || undefined,
      },
    };

    console.log('[create-checkout] creating order', {
      userId: user.id,
      productType,
      amount,
      authClientKeySource,
    });

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
      return errorResponse(req, 'PayPal could not create order: ' + errText.slice(0, 200), 502, {
        reason: 'paypal_create_order_failed',
        paypalStatus: orderRes.status,
      });
    }

    const orderData = await orderRes.json();
    const orderId = orderData.id as string | undefined;
    const approveLink = orderData.links?.find((l: { rel?: string }) => l.rel === 'approve');
    const approvalUrl = approveLink?.href ?? null;

    if (!orderId) {
      return errorResponse(req, 'PayPal did not return an order id', 502, { reason: 'paypal_missing_order_id' });
    }

    const { error: bindErr } = await serviceClient.from('paypal_pending_orders').insert({
      paypal_order_id: orderId,
      user_id: user.id,
      product_type: productType,
      amount_aud: amount,
      currency: 'AUD',
      status: 'pending',
      metadata,
    });

    if (bindErr) {
      console.error('[create-checkout] failed to bind order to user:', bindErr);
      return errorResponse(req, 'Could not register checkout session. Please try again.', 500, {
        reason: 'order_bind_failed',
      });
    }

    const response: Record<string, unknown> = {
      success: true,
      orderId,
      approvalUrl,
      amount,
      currency: 'AUD',
      productType,
    };

    if (productType === 'pass') {
      response.passType = 'dynamic';
      response.partySize = metadata.partySize;
      response.isExtended = metadata.isExtended;
      response.startDate = metadata.startDate;
    }

    return jsonResponse(req, response);
  } catch (err: unknown) {
    console.error('[create-checkout]', err);
    const msg = err instanceof Error ? err.message : String(err ?? 'Create checkout failed');
    return errorResponse(req, msg || 'Create checkout failed', 500, {
      reason: msg.includes('PAYPAL') ? 'paypal_config' : 'unexpected',
    });
  }
});

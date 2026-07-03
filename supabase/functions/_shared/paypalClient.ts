/**
 * PayPal REST helpers (Orders v2).
 * Requires PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET.
 * Set PAYPAL_MODE=live for production.
 */

export const SUPERSTAR_PRICE_AUD = 5;

export function isPayPalSandbox(): boolean {
  const mode = (Deno.env.get('PAYPAL_MODE') ?? Deno.env.get('PAYPAL_SANDBOX') ?? 'sandbox')
    .toString()
    .toLowerCase();
  return mode !== 'live' && mode !== 'production' && mode !== 'false';
}

export function payPalApiBase(sandbox = isPayPalSandbox()): string {
  return sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

export async function getPayPalAccessToken(sandbox = isPayPalSandbox()): Promise<string> {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const clientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set');
  }
  const base = payPalApiBase(sandbox);
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
  return data.access_token as string;
}

export type PayPalOrderJson = Record<string, unknown>;

export async function getPayPalOrder(
  orderId: string,
  accessToken: string,
  sandbox = isPayPalSandbox(),
): Promise<PayPalOrderJson> {
  const base = payPalApiBase(sandbox);
  const res = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PayPal GET order failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return (await res.json()) as PayPalOrderJson;
}

export async function capturePayPalOrder(
  orderId: string,
  accessToken: string,
  sandbox = isPayPalSandbox(),
): Promise<{ ok: true; json: PayPalOrderJson } | { ok: false; status: number; body: unknown }> {
  const base = payPalApiBase(sandbox);
  const res = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: '{}',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, body };
  }
  return { ok: true, json: body as PayPalOrderJson };
}

/** Gross captured AUD from capture response or completed order. */
export function capturedAmountAudFromOrder(json: PayPalOrderJson): number | null {
  try {
    const units = json.purchase_units as unknown[] | undefined;
    const u0 = units?.[0] as Record<string, unknown> | undefined;
    const payments = u0?.payments as Record<string, unknown> | undefined;
    const caps = payments?.captures as unknown[] | undefined;
    const c0 = caps?.[0] as Record<string, unknown> | undefined;
    if (c0?.amount) {
      const amt = c0.amount as Record<string, unknown>;
      const n = parseFloat(String(amt?.value ?? ''));
      if (Number.isFinite(n)) return n;
    }
    const amount = u0?.amount as Record<string, unknown> | undefined;
    const n2 = parseFloat(String(amount?.value ?? ''));
    return Number.isFinite(n2) ? n2 : null;
  } catch {
    return null;
  }
}

export function orderStatus(json: PayPalOrderJson): string {
  return String(json.status ?? '').toUpperCase();
}

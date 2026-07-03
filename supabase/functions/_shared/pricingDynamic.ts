/**
 * Dynamic StikmNek pass pricing — keep in sync with `src/data/pricing.ts`.
 *
 * Headcount: A$15 first guest + A$10×(each additional guest, 2–20) + (extended ? A$15 : 0)
 */

export const BASE_PRICE_AUD = 15;
export const GUEST_FEE_AUD = 10;
/** Backwards-compatible: every additional guest is a flat A$10, so no 7th-guest premium. */
export const SEVENTH_GUEST_PREMIUM_AUD = 0;
export const SEVENTH_GUEST_HEAD_CHARGE_AUD = GUEST_FEE_AUD + SEVENTH_GUEST_PREMIUM_AUD;
export const EXTEND_FEE_AUD = 15;
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 20;

/** Inclusive calendar days: day pass = 1; holiday = 7; +share = 14. */
export const DYNAMIC_PASS_SPAN_DAYS = { standard: 1, extended: 7, extendedWithShare: 14 } as const;

export function clampPartySize(n: unknown): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return MIN_PARTY_SIZE;
  return Math.min(MAX_PARTY_SIZE, Math.max(MIN_PARTY_SIZE, x));
}

export function parseBooleanExtended(value: unknown): boolean {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  return false;
}

export function calculatePassPriceAud(partySize: number, isExtended: boolean): number {
  const p = clampPartySize(partySize);
  let headcountAud = BASE_PRICE_AUD;
  if (p >= 2) {
    headcountAud += Math.min(p - 1, 5) * GUEST_FEE_AUD;
  }
  if (p >= 7) {
    headcountAud += SEVENTH_GUEST_HEAD_CHARGE_AUD + (p - 7) * GUEST_FEE_AUD;
  }
  return headcountAud + (isExtended ? EXTEND_FEE_AUD : 0);
}

/** Inclusive span for dynamic pass (Option A: 7+7). */
export function dynamicPassInclusiveDays(isExtended: boolean, grantSecondWeekFromPrepurchaseShare: boolean): number {
  if (!isExtended) return DYNAMIC_PASS_SPAN_DAYS.standard;
  if (grantSecondWeekFromPrepurchaseShare) return DYNAMIC_PASS_SPAN_DAYS.extendedWithShare;
  return DYNAMIC_PASS_SPAN_DAYS.extended;
}

/**
 * Days to add to valid_from to reach valid_until (inclusive range).
 * 1 calendar day → offset 0; 7 inclusive → 6; 14 inclusive → 13.
 */
export function validUntilOffsetDays(
  isExtended: boolean,
  grantSecondWeekFromPrepurchaseShare = false,
): number {
  return dynamicPassInclusiveDays(isExtended, grantSecondWeekFromPrepurchaseShare) - 1;
}

/** Parse party count from request (camelCase, snake_case, string/number). */
function coercePartyCount(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t === '') return null;
    const n = Math.floor(Number(t));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw);
  if (typeof raw === 'boolean') return raw ? 1 : null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? n : null;
}

export function parsePartySizeAndExtended(body: Record<string, unknown>): {
  partySize: number;
  isExtended: boolean;
} | null {
  const rawParty = body.partySize ?? body.party_size ?? body['PartySize'];
  const n = coercePartyCount(rawParty);
  if (n === null || n < MIN_PARTY_SIZE || n > MAX_PARTY_SIZE) return null;
  const extRaw = body.isExtended ?? body.is_extended;
  if (extRaw === undefined || extRaw === null || extRaw === '') {
    return { partySize: n, isExtended: false };
  }
  return { partySize: n, isExtended: parseBooleanExtended(extRaw) };
}

// ─── UTC calendar-date helpers for pass purchase ───

export function utcStartOfCalendarDayMs(isoDateOnly: string): number {
  return new Date(isoDateOnly + 'T00:00:00.000Z').getTime();
}

export function utcTodayStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function utcAddCalendarDays(utcMidnightMs: number, days: number): number {
  const d = new Date(utcMidnightMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 0, 0, 0, 0);
}

export function validatePassStartDateIso(startDate: unknown): { ok: true; startDate: string } | { ok: false; error: string } {
  const s = String(startDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { ok: false, error: 'Missing or invalid startDate (YYYY-MM-DD)' };
  }
  const startMs = utcStartOfCalendarDayMs(s);
  if (Number.isNaN(startMs)) {
    return { ok: false, error: 'Missing or invalid startDate (YYYY-MM-DD)' };
  }
  const todayStartMs = utcTodayStartMs();
  if (startMs < todayStartMs) {
    return { ok: false, error: 'Purchase start date cannot be in the past.' };
  }
  const maxStartMs = utcAddCalendarDays(todayStartMs, 30);
  if (startMs > maxStartMs) {
    return { ok: false, error: 'Purchase start date cannot be more than 30 days in the future (UTC).' };
  }
  return { ok: true, startDate: s };
}

export function addCalendarDaysIso(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function endOfDayUtcIso(dateStr: string): string {
  return new Date(dateStr + 'T23:59:59.999Z').toISOString();
}

export function calendarDaysBetweenValidRange(validFrom: string, validUntil: string): number {
  const a = new Date(validFrom + 'T00:00:00.000Z');
  const b = new Date(validUntil + 'T00:00:00.000Z');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, diff);
}

// ─── PayPal REST helpers (Orders v2) ───

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


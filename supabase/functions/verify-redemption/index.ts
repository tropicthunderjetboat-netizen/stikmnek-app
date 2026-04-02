// deno-lint-ignore-file no-explicit-any
/**
 * verify-redemption Edge Function
 *
 * Actions:
 * - check_voucher_validity
 *   - Decodes QR payload and checks if the pass is active and within valid dates.
 *   - Returns a ValidityResult-like object used by QRScanner.
 *
 * - verify_and_redeem
 *   - Performs the same checks and, if eligible, inserts a row into public.redemptions.
 *   - Returns a RedemptionResult-like object with basic receipt info.
 *
 * Pass validity uses strict calendar dates (valid_from / valid_until) vs UTC "today";
 * see the block comment before date checks — no in-session grace past the last valid day.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';

/** Pass QR encodes only the pass row UUID; legacy JSON payloads still accepted for migration. */
const PASS_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePassIdFromQrData(rawQr: string): string | null {
  const t = rawQr.trim().replace(/^\uFEFF/, '');
  if (PASS_ID_UUID_RE.test(t)) return t;
  // Some scanners prefix/suffix whitespace or non-UUID noise — extract first UUID substring.
  const embedded = t.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (embedded && PASS_ID_UUID_RE.test(embedded[0])) return embedded[0];
  try {
    const j = JSON.parse(t) as { passId?: unknown };
    if (j && typeof j.passId === 'string' && PASS_ID_UUID_RE.test(j.passId.trim())) {
      return j.passId.trim();
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/** Current UTC calendar date (YYYY-MM-DD). Used with normalized pass dates for strict validity — see pass lookup comment block. */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function compareDates(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** TEMP_DEBUG_QR_SCAN — log request shape without echoing full QR payload or secrets */
function maskQrDataForLog(raw: string): string {
  const t = raw.trim();
  if (t.length <= 24) return `[len=${t.length}] ${t.slice(0, 4)}…`;
  return `[len=${t.length}] ${t.slice(0, 8)}…${t.slice(-6)}`;
}

function logDiag(label: string, payload: Record<string, unknown>): void {
  console.log(`[verify-redemption][TEMP_DEBUG_QR_SCAN] ${label}`, JSON.stringify(payload));
}

// ─── Party + pricing (mirrors src/lib/redemptionSavings.ts & pricingTiers.ts) ───

type PartyCounts = { adults: number; children: number; infants: number };

function partyFromProfileRow(row: {
  num_adults?: number | null;
  num_children?: number | null;
  num_infants?: number | null;
} | null | undefined): PartyCounts {
  if (!row) return { adults: 1, children: 0, infants: 0 };
  const aRaw = row.num_adults;
  const cRaw = row.num_children;
  const iRaw = row.num_infants;
  if (aRaw == null && cRaw == null && iRaw == null) {
    return { adults: 1, children: 0, infants: 0 };
  }
  return {
    adults: Math.max(0, Math.floor(Number(aRaw ?? 0))),
    children: Math.max(0, Math.floor(Number(cRaw ?? 0))),
    infants: Math.max(0, Math.floor(Number(iRaw ?? 0))),
  };
}

function totalPartyPax(p: PartyCounts): number {
  return p.adults + p.children + p.infants;
}

/** Enforce redemption only when > 0; null = treat as unlimited (legacy row or missing column). */
function resolvePassMaxPeople(passRow: { max_people?: unknown }): number | null {
  const m = passRow.max_people;
  if (typeof m === 'number' && Number.isFinite(m) && m > 0) return Math.floor(m);
  return null;
}

type PricingTierInput = {
  label: string;
  min_pax: number;
  max_pax: number | null;
  original_price_vt: number;
  deal_price_vt: number;
};

function pricingTiersFromDb(value: unknown): PricingTierInput[] {
  if (!value || !Array.isArray(value)) return [];
  const out: PricingTierInput[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const min = Math.max(0, Math.floor(Number(o.min_pax ?? 0) || 0));
    const maxRaw = o.max_pax;
    const max =
      maxRaw === null || maxRaw === undefined || maxRaw === ''
        ? null
        : Math.max(0, Math.floor(Number(maxRaw) || 0));
    out.push({
      label: String(o.label ?? '').trim(),
      min_pax: min,
      max_pax: max,
      original_price_vt: Math.max(0, Number(o.original_price_vt) || 0),
      deal_price_vt: Math.max(0, Number(o.deal_price_vt) || 0),
    });
  }
  return out;
}

function computeTieredBookingTotals(
  tiers: PricingTierInput[],
  adults: number,
  children: number,
  infants: number,
): { totalStandard: number; totalDeal: number } {
  const a = Math.max(0, adults);
  const ch = Math.max(0, children);
  const inf = Math.max(0, infants);
  const usable = tiers.filter((t) => t.original_price_vt > 0 && t.deal_price_vt >= 0);
  if (usable.length === 0) return { totalStandard: 0, totalDeal: 0 };

  if (usable.length === 1) {
    const t = usable[0];
    const pax = a + ch + inf;
    return {
      totalStandard: pax * t.original_price_vt,
      totalDeal: pax * t.deal_price_vt,
    };
  }

  const low = (s: string) => s.toLowerCase();
  const pick = (pred: (label: string) => boolean, indexFallback: number): PricingTierInput => {
    const found = usable.find((t) => pred(low(t.label)));
    if (found) return found;
    return usable[Math.min(indexFallback, usable.length - 1)] ?? usable[0];
  };

  const tAdult = pick((l) => /adult|13\+|adulte|senior|grown/.test(l), 0);
  const tChild = pick((l) => /child|kid|enfant|pikinini|minor|2-12|5-12|6-12|7-12|school/.test(l), 1);
  const tInfant = pick((l) => /infant|baby|b[eé]b[eé]|0-4|0–4|toddler|smol/.test(l), 2);

  return {
    totalStandard:
      a * tAdult.original_price_vt + ch * tChild.original_price_vt + inf * tInfant.original_price_vt,
    totalDeal: a * tAdult.deal_price_vt + ch * tChild.deal_price_vt + inf * tInfant.deal_price_vt,
  };
}

function hasUsableTieredPricing(pricingTiers: unknown): boolean {
  const tiers = pricingTiersFromDb(pricingTiers);
  return tiers.some(
    (t) =>
      t.original_price_vt > 0 &&
      t.deal_price_vt >= 0 &&
      t.deal_price_vt < t.original_price_vt,
  );
}

function computeRedemptionSavings(
  biz: { pricing_tiers: unknown; original_price: unknown; deal_price: unknown },
  party: PartyCounts,
): {
  savedAmount: number;
  totalStandard: number;
  totalDeal: number;
  savingsLine: string;
  isTiered: boolean;
  unitSavings: number;
} {
  if (hasUsableTieredPricing(biz.pricing_tiers)) {
    const tiers = pricingTiersFromDb(biz.pricing_tiers);
    const { totalStandard, totalDeal } = computeTieredBookingTotals(
      tiers,
      party.adults,
      party.children,
      party.infants,
    );
    const ts = Math.round(totalStandard);
    const td = Math.round(totalDeal);
    const saved = Math.max(0, ts - td);
    const savingsLine =
      `Party: ${party.adults} adult(s)` +
      (party.children ? `, ${party.children} child(ren)` : '') +
      (party.infants ? `, ${party.infants} infant(s)` : '') +
      ` — ${ts.toLocaleString()} VT standard → ${td.toLocaleString()} VT StikmNek (${saved.toLocaleString()} VT saved)`;
    return { savedAmount: saved, totalStandard: ts, totalDeal: td, savingsLine, isTiered: true, unitSavings: 0 };
  }

  const o = Number(biz.original_price);
  const d = Number(biz.deal_price);
  const partySize = Math.max(1, party.adults + party.children);
  if (!Number.isFinite(o) || !Number.isFinite(d) || o <= d) {
    return { savedAmount: 0, totalStandard: 0, totalDeal: 0, savingsLine: '—', isTiered: false, unitSavings: 0 };
  }
  const unit = Math.round(o - d);
  const saved = Math.max(0, unit * partySize);
  const savingsLine =
    `${unit.toLocaleString()} VT × ${partySize} ${partySize === 1 ? 'person' : 'people'} = ${saved.toLocaleString()} VT total saved`;
  return {
    savedAmount: saved,
    totalStandard: Math.round(o * partySize),
    totalDeal: Math.round(d * partySize),
    savingsLine,
    isTiered: false,
    unitSavings: unit,
  };
}

const BEARER_PREFIX = /^Bearer\s+/i;

Deno.serve(async (req) => {
  let reqUrlPath = '';
  try {
    reqUrlPath = new URL(req.url).pathname;
  } catch {
    reqUrlPath = '(unparsed url)';
  }
  logDiag('request', { method: req.method, path: reqUrlPath });

  const corsHeaders = getSafeCorsHeaders(req);
  const jsonResponse = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  const errorResponse = (message: string, status = 400, extra?: Record<string, unknown>) =>
    jsonResponse(
      {
        success: false,
        error: message,
        errorCode: status,
        ...extra,
      },
      status,
    );

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', 401);
    }

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
    // Dashboard secret bug workaround:
    // Some projects cannot edit/delete reserved `SUPABASE_*` secrets in the Dashboard.
    // Prefer a non-reserved secret name for the anon key (used ONLY to validate caller JWT):
    //   APP_SUPABASE_ANON_KEY = <project anon public key>
    // Keep legacy fallbacks for safety.
    const anonKey =
      (Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '').trim() ||
      (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim() ||
      (Deno.env.get('SUPABASE_ANON_KEY_PUBLIC') ?? '').trim();
    if (!supabaseUrl || !serviceKey) {
      console.error(
        '[verify-redemption] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot read public.passes',
      );
      return errorResponse('Server configuration error', 500, {
        reason: 'missing_supabase_secrets',
      });
    }

    // Use ANON key for validating caller JWT (auth context).
    // Do NOT fall back to service role here—misconfiguration will surface as "Invalid JWT" and block scanning.
    if (!anonKey) {
      logDiag('warn', { message: 'Anon key missing; cannot validate caller JWT (set APP_SUPABASE_ANON_KEY)' });
      return errorResponse('Server configuration error', 500, {
        reason: 'missing_supabase_anon_key',
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Service role bypasses RLS; public.passes has RLS enabled (see database-setup.sql).
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace(BEARER_PREFIX, '').trim();
    const { data: { user: scannerUser }, error: authError } = await authClient.auth.getUser(token);
    logDiag('auth', {
      scannerUserId: scannerUser?.id ?? null,
      authOk: !!scannerUser && !authError,
      authErrorMessage: authError?.message ?? null,
    });
    if (authError || !scannerUser) {
      return errorResponse('Missing or invalid authentication token.', 401, {
        reason: 'auth_invalid',
        authError: authError?.message ?? null,
      });
    }

    // ─── AUTHZ: Ensure scanner is a business owner or admin ───
    const { data: scannerProfile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', scannerUser.id)
      .maybeSingle();

    const scannerRole = scannerProfile?.role as string | undefined;
    logDiag('scanner_profile', {
      scannerRole: scannerRole ?? null,
      profileErr: profileErr?.message ?? null,
    });
    if (profileErr || !scannerRole || !['business', 'admin'].includes(scannerRole)) {
      return errorResponse('Not authorized to verify passes', 403, {
        reason: 'scanner_role',
        role: scannerRole ?? null,
        profileError: profileErr?.message ?? null,
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const rawQr = body?.qrData;
    const businessId = body?.businessId;
    const businessName = body?.businessName ?? '';

    logDiag('body_summary', {
      action,
      qrDataMasked: typeof rawQr === 'string' ? maskQrDataForLog(rawQr) : null,
      businessId: businessId ?? null,
      hasBusinessName: typeof businessName === 'string' && businessName.length > 0,
    });

    if (!action) return errorResponse('Missing action', 400);
    if (!rawQr || typeof rawQr !== 'string') return errorResponse('Missing qrData', 400);

    const passId = parsePassIdFromQrData(rawQr);
    logDiag('parsed_pass_id', { passId, parseOk: !!passId });
    if (!passId) {
      return errorResponse(
        'Invalid QR payload — expected a pass UUID (use the StikmNek app QR or paste the pass code).',
        400,
      );
    }

    const today = getTodayDate();

    // Source of truth: public.passes.id (UUID) from QR — service role reads bypass RLS.
    const { data: pass, error: passErr } = await supabase
      .from('passes')
      .select('id, user_id, pass_type, active, valid_from, valid_until, expires_at, purchased_at, max_people')
      .eq('id', passId)
      .maybeSingle();

    logDiag('passes_lookup', {
      passId,
      lookupError: passErr
        ? { code: passErr.code, message: passErr.message }
        : null,
      passFound: !!pass,
      passUserId: pass?.user_id ?? null,
      passActive: pass?.active ?? null,
      validFrom: pass?.valid_from ?? null,
      validUntil: pass?.valid_until ?? null,
      maxPeople: pass?.max_people ?? null,
    });

    if (passErr) {
      console.error('[verify-redemption] passes table lookup error:', passErr.code, passErr.message, passErr);
      return errorResponse(
        passErr.message?.includes('JWT') || passErr.message?.includes('permission')
          ? 'Database access error — check Edge Function secrets (SUPABASE_SERVICE_ROLE_KEY)'
          : 'Pass lookup failed',
        500,
        {
          reason: 'passes_query_failed',
          postgresCode: passErr.code ?? null,
          postgresMessage: passErr.message ?? null,
        },
      );
    }
    if (!pass) {
      console.error('[verify-redemption] no row in passes for id:', passId);
      return errorResponse('Pass not found for this QR code', 404, {
        reason: 'pass_not_found',
        passId,
      });
    }

    const touristUserId = pass.user_id as string;

    // ═══════════════════════════════════════════════════════════════════════════
    // PASS VALIDITY — STRICT CALENDAR-DATE ENFORCEMENT (product policy)
    // ═══════════════════════════════════════════════════════════════════════════
    // Pass validity is determined ONLY by calendar dates (YYYY-MM-DD), not by clock
    // time within a day or by "in-session" activity (e.g. a multi-hour visit).
    //
    // - valid_from / valid_until are normalized to ISO date strings and compared to
    //   "today" from getTodayDate() — the current UTC calendar date. Keep purchase
    //   and redemption using the same date convention to avoid off-by-one issues.
    //
    // - Expiration: redemption is blocked when today's date is STRICTLY AFTER
    //   valid_until (passStatus = date_range_expired). The last valid calendar day is
    //   still valid for the whole UTC date; the first moment of the NEXT calendar day
    //   is out of range. There is NO grace period that extends validity past
    //   valid_until for ongoing redemptions, meals, or bookings that cross midnight.
    //
    // - This strict boundary is intentional (predictable pass lifecycle). If UX copy
    //   promises otherwise, align product/docs — do not add implicit grace here
    //   without an explicit product change.
    // ═══════════════════════════════════════════════════════════════════════════

    const validFrom = normalizeDate(pass.valid_from);
    const validUntil = normalizeDate(pass.valid_until);
    const todayStr = today;

    let passStatus: string = 'active';
    let canRedeem = true;
    let message = 'Pass is active and can be redeemed.';

    if (!pass.active) {
      passStatus = 'inactive';
      canRedeem = false;
      message = 'This pass is inactive.';
    } else if (!validFrom || !validUntil) {
      passStatus = 'no_dates';
      canRedeem = false;
      message = 'Pass dates are not set.';
    } else if (compareDates(todayStr, validFrom) < 0) {
      passStatus = 'not_yet_valid';
      canRedeem = false;
      message = 'Pass is not yet valid.';
    } else if (compareDates(todayStr, validUntil) > 0) {
      passStatus = 'date_range_expired';
      canRedeem = false;
      message = 'Pass has expired.';
    }

    logDiag('validity_after_dates', {
      passStatus,
      canRedeem,
      todayUtc: todayStr,
      validFrom,
      validUntil,
    });

    // Load tourist profile (party size for savings math + display)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, display_name, email, num_adults, num_children, num_infants')
      .eq('user_id', touristUserId)
      .maybeSingle();

    const party = partyFromProfileRow(profile);
    const totalPartySize = totalPartyPax(party);
    const passMaxPeople = resolvePassMaxPeople(pass as { max_people?: unknown });

    // ─── Party size vs pass capacity (max_people) — server-side enforcement ───
    // Savings math uses adults+children (+ infants for tiers). The same headcount must
    // not exceed the pass purchase limit (share bonus included in max_people at buy time).
    if (canRedeem && passMaxPeople !== null && totalPartySize > passMaxPeople) {
      passStatus = 'party_exceeds_pass_capacity';
      canRedeem = false;
      message =
        `Party size (${totalPartySize}) exceeds this pass capacity (max ${passMaxPeople}). ` +
        'The tourist should reduce group size in their profile or purchase a pass with a higher limit.';
    }

    logDiag('tourist_profile_party', {
      touristUserId,
      profileRowFound: !!profile,
      party: { adults: party.adults, children: party.children, infants: party.infants },
      totalPartySize,
      passMaxPeople,
      passStatus,
      canRedeem,
    });

    const touristName =
      profile?.name ||
      profile?.display_name ||
      (profile?.email ? profile.email.split('@')[0] : null) ||
      'Tourist';
    const touristEmail = profile?.email || '';

    // Redemption history (per business & pass)
    let alreadyRedeemedToday = false;
    let totalRedemptionsAtBusiness = 0;
    let lastRedemptions: string[] = [];

    if (businessId) {
      // If scanner is a business user, ensure the businessId belongs to them.
      if (scannerRole === 'business') {
        const { data: ownedBusiness, error: bizErr } = await supabase
          .from('businesses')
          .select('id')
          .eq('id', businessId)
          .eq('owner_id', scannerUser.id)
          .maybeSingle();

        logDiag('business_ownership_check', {
          businessId,
          scannerUserId: scannerUser.id,
          owned: !!ownedBusiness,
          bizErr: bizErr?.message ?? null,
        });

        if (bizErr || !ownedBusiness) {
          return errorResponse('You are not authorized to scan for this business', 403, {
            reason: 'business_not_owned',
            businessId,
          });
        }
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const { data: todayRedemptions } = await supabase
        .from('redemptions')
        .select('id')
        .eq('user_id', touristUserId)
        .eq('business_id', businessId)
        .gte('redeemed_at', startOfDay.toISOString())
        .lte('redeemed_at', endOfDay.toISOString());

      alreadyRedeemedToday = !!(todayRedemptions && todayRedemptions.length > 0);

      const { count, data: recent } = await supabase
        .from('redemptions')
        .select('redeemed_at', { count: 'exact' })
        .eq('user_id', touristUserId)
        .eq('business_id', businessId)
        .order('redeemed_at', { ascending: false })
        .limit(5);

      totalRedemptionsAtBusiness = count ?? (recent?.length ?? 0);
      lastRedemptions = (recent ?? []).map((r: any) => r.redeemed_at as string);
    }

    logDiag('redemption_history_summary', {
      businessId: businessId ?? null,
      alreadyRedeemedToday,
      totalRedemptionsAtBusiness,
    });

    if (action === 'check_voucher_validity') {
      const out = {
        success: true,
        action: 'validity_check',
        canRedeem,
        tourist: { name: touristName, email: touristEmail },
        party: {
          adults: party.adults,
          children: party.children,
          infants: party.infants,
        },
        pass: {
          id: pass.id,
          type: pass.pass_type,
          status: passStatus,
          message,
          active: pass.active,
          validFrom,
          validUntil,
          expiresAt: pass.expires_at,
          purchasedAt: pass.purchased_at,
          maxPeople: passMaxPeople,
          totalPartySize,
        },
        voucher: null,
        redemptionHistory: {
          alreadyRedeemedToday,
          totalRedemptionsAtBusiness,
          lastRedemptions,
        },
      };
      logDiag('response_check_voucher_validity', {
        status: 200,
        canRedeem,
        passStatus,
        passId: pass.id,
      });
      return jsonResponse(out, 200);
    }

    if (action === 'verify_and_redeem') {
      if (!businessId) {
        return errorResponse('Missing businessId for redemption', 400);
      }

      if (!canRedeem) {
        logDiag('response_verify_and_redeem_blocked', {
          status: 200,
          success: false,
          passStatus,
          canRedeem: false,
          businessId,
        });
        return jsonResponse(
          {
            success: false,
            error: message,
            status: passStatus,
            maxPeople: passMaxPeople,
            totalPartySize,
          },
          200
        );
      }

      // Block duplicate redemption same tourist + business + calendar day (matches check_voucher_validity)
      {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const { data: dupToday } = await supabase
          .from('redemptions')
          .select('id')
          .eq('user_id', touristUserId)
          .eq('business_id', businessId)
          .gte('redeemed_at', startOfDay.toISOString())
          .lte('redeemed_at', endOfDay.toISOString())
          .limit(1);

        if (dupToday && dupToday.length > 0) {
          logDiag('response_verify_and_redeem_dup', { status: 'already_redeemed_today', businessId });
          return jsonResponse(
            {
              success: false,
              error: 'This pass was already redeemed at this business today.',
              status: 'already_redeemed_today',
            },
            200
          );
        }
      }

      const discountLabelRaw = body?.discount ?? body?.discountLabel ?? '';
      const discount_label =
        typeof discountLabelRaw === 'string' ? discountLabelRaw.trim() : String(discountLabelRaw ?? '').trim();

      const { data: bizRow, error: bizLoadErr } = await supabase
        .from('businesses')
        .select('name, pricing_tiers, original_price, deal_price, owner_id')
        .eq('id', businessId)
        .maybeSingle();

      if (bizLoadErr || !bizRow) {
        console.error('[verify-redemption] business load:', bizLoadErr);
        return errorResponse('Business not found', 404, {
          reason: 'business_not_found',
          businessId,
          postgresCode: bizLoadErr?.code ?? null,
        });
      }

      if (scannerRole === 'business' && String((bizRow as { owner_id?: string }).owner_id ?? '') !== String(scannerUser.id)) {
        return errorResponse('You are not authorized to redeem for this business', 403, {
          reason: 'redeem_business_forbidden',
          businessId,
        });
      }

      // Server-authoritative savings (ignore client savedAmount to prevent tampering)
      const computed = computeRedemptionSavings(bizRow, party);
      const savedAmount = computed.savedAmount;

      const insertRow: Record<string, unknown> = {
        user_id: touristUserId,
        business_id: businessId,
        pass_id: pass.id,
        saved_amount: savedAmount,
      };
      if (discount_label) insertRow.discount_label = discount_label;

      const { data: redemption, error: redErr } = await supabase
        .from('redemptions')
        .insert(insertRow)
        .select('id, redeemed_at, saved_amount, discount_label')
        .single();

      if (redErr || !redemption) {
        console.error('[verify-redemption] insert redemption error:', redErr);
        return errorResponse('Failed to record redemption', 500, {
          reason: 'redemption_insert_failed',
          postgresCode: redErr?.code ?? null,
          postgresMessage: redErr?.message ?? null,
        });
      }

      const { data: bizNameRow } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', businessId)
        .maybeSingle();

      const resolvedBusinessName =
        (typeof businessName === 'string' && businessName.trim()) ||
        (typeof body?.businessName === 'string' && (body.businessName as string).trim()) ||
        bizNameRow?.name ||
        '';

      const appliedDiscount =
        (redemption as any).discount_label ||
        discount_label ||
        (typeof body?.discount === 'string' ? body.discount : '');

      logDiag('response_verify_and_redeem_success', {
        redemptionId: redemption.id,
        passId: pass.id,
        businessId,
        savedAmount: Number(redemption.saved_amount) || 0,
      });
      return jsonResponse(
        {
          success: true,
          message: 'Redemption recorded successfully.',
          redemption: {
            id: redemption.id,
            touristName,
            touristEmail,
            passType: pass.pass_type,
            validFrom,
            validUntil,
            businessName: resolvedBusinessName,
            discountApplied: appliedDiscount,
            savedAmount: Number(redemption.saved_amount) || 0,
            redeemedAt: redemption.redeemed_at,
            originalPrice: computed.totalStandard,
            dealPrice: computed.totalDeal,
            savingsLine: computed.savingsLine,
            isTieredPricing: computed.isTiered,
            party: {
              adults: party.adults,
              children: party.children,
              infants: party.infants,
            },
          },
        },
        200
      );
    }

    return errorResponse('Unknown action: ' + action, 400);
  } catch (err: any) {
    console.error('[verify-redemption][TEMP_DEBUG_QR_SCAN] unexpected error:', err?.message ?? err);
    console.error('[verify-redemption] stack:', err?.stack ?? '');
    return errorResponse(
      typeof err?.message === 'string' && err.message.length > 0
        ? `Verification failed: ${err.message}`
        : 'Verification failed',
      500,
      { reason: 'unexpected', name: err?.name ?? null },
    );
  }
});


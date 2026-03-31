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

/**
 * CORS: set CORS_ALLOWED_ORIGINS (comma-separated). If unset, Allow-Origin is *.
 */
function originMatchesAllowList(origin: string, allowed: string[]): boolean {
  const o = origin.trim();
  if (!o) return false;
  if (allowed.includes(o)) return true;
  // Common drift: apex vs www when secret lists only one hostname
  try {
    const u = new URL(o);
    const host = u.hostname.toLowerCase();
    const noWww = host.startsWith('www.') ? host.slice(4) : host;
    const withWww = host.startsWith('www.') ? host : `www.${host}`;
    const altA = `${u.protocol}//${noWww}${u.port ? `:${u.port}` : ''}`;
    const altB = `${u.protocol}//${withWww}${u.port ? `:${u.port}` : ''}`;
    let altAOrigin = '';
    let altBOrigin = '';
    try {
      altAOrigin = new URL(altA).origin;
    } catch {
      /* ignore */
    }
    try {
      altBOrigin = new URL(altB).origin;
    } catch {
      /* ignore */
    }
    return allowed.some((a) => {
      try {
        const x = new URL(a);
        return (
          x.origin === u.origin ||
          (altAOrigin && x.origin === altAOrigin) ||
          (altBOrigin && x.origin === altBOrigin)
        );
      } catch {
        return a === o;
      }
    });
  } catch {
    return false;
  }
}

function getSafeCorsHeaders(req: Request): Record<string, string> {
  const raw = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '').trim();
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') ?? '';
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
  if (allowed.length === 0) {
    base['Access-Control-Allow-Origin'] = '*';
    return base;
  }
  // Echo request Origin when allowed so browsers accept credentialed invokes (www/apex tolerant).
  if (origin && originMatchesAllowList(origin, allowed)) {
    base['Access-Control-Allow-Origin'] = origin;
  } else {
    base['Access-Control-Allow-Origin'] = allowed[0]!;
  }
  return base;
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
  const corsHeaders = getSafeCorsHeaders(req);
  const jsonResponse = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  const errorResponse = (message: string, status = 400, extra?: Record<string, unknown>) =>
    jsonResponse({ success: false, error: message, ...extra }, status);

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
    if (!supabaseUrl || !serviceKey) {
      console.error(
        '[verify-redemption] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot read public.passes',
      );
      return errorResponse('Server configuration error', 500);
    }

    // Service role bypasses RLS; public.passes has RLS enabled (see database-setup.sql).
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace(BEARER_PREFIX, '').trim();
    const { data: { user: scannerUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !scannerUser) {
      return errorResponse('Invalid or expired session', 401);
    }

    // ─── AUTHZ: Ensure scanner is a business owner or admin ───
    const { data: scannerProfile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', scannerUser.id)
      .maybeSingle();

    const scannerRole = scannerProfile?.role as string | undefined;
    if (profileErr || !scannerRole || !['business', 'admin'].includes(scannerRole)) {
      return errorResponse('Not authorized to verify passes', 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const rawQr = body?.qrData;
    const businessId = body?.businessId;
    const businessName = body?.businessName ?? '';

    if (!action) return errorResponse('Missing action', 400);
    if (!rawQr || typeof rawQr !== 'string') return errorResponse('Missing qrData', 400);

    const passId = parsePassIdFromQrData(rawQr);
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

    console.log('[verify-redemption] passId received:', passId);
    console.log('[verify-redemption] passes DB result:', { pass, passErr });

    if (passErr) {
      console.error('[verify-redemption] passes table lookup error:', passErr.code, passErr.message, passErr);
      return errorResponse(
        passErr.message?.includes('JWT') || passErr.message?.includes('permission')
          ? 'Database access error — check Edge Function secrets (SUPABASE_SERVICE_ROLE_KEY)'
          : 'Pass lookup failed',
        500,
      );
    }
    if (!pass) {
      console.error('[verify-redemption] no row in passes for id:', passId);
      return errorResponse('Pass not found for this QR code', 404);
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

        if (bizErr || !ownedBusiness) {
          return errorResponse('You are not authorized to scan for this business', 403);
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

    if (action === 'check_voucher_validity') {
      return jsonResponse(
        {
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
        },
        200
      );
    }

    if (action === 'verify_and_redeem') {
      if (!businessId) {
        return errorResponse('Missing businessId for redemption', 400);
      }

      if (!canRedeem) {
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
        return errorResponse('Business not found', 404);
      }

      if (scannerRole === 'business' && String((bizRow as { owner_id?: string }).owner_id ?? '') !== String(scannerUser.id)) {
        return errorResponse('You are not authorized to redeem for this business', 403);
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
        return errorResponse('Failed to record redemption', 500);
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
    console.error('[verify-redemption] unexpected error:', err?.message ?? err, err?.stack ?? '');
    return errorResponse(
      typeof err?.message === 'string' && err.message.length > 0
        ? `Verification failed: ${err.message}`
        : 'Verification failed',
      500,
    );
  }
});


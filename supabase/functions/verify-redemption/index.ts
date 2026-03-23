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
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400, extra?: Record<string, unknown>) {
  return jsonResponse({ success: false, error: message, ...extra }, status);
}

function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function compareDates(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
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

    let qr: any;
    try {
      qr = JSON.parse(rawQr);
    } catch {
      return errorResponse('Invalid QR payload (not JSON)', 400);
    }

    if (!qr || qr.type !== 'stikm_nek_pass' || !qr.passId || !qr.userId) {
      return errorResponse('Invalid QR payload (unexpected structure)', 400);
    }

    const passId = qr.passId as string;
    const touristUserId = qr.userId as string;
    const today = getTodayDate();

    const { data: pass, error: passErr } = await supabase
      .from('passes')
      .select('id, user_id, pass_type, active, valid_from, valid_until, expires_at, purchased_at')
      .eq('id', passId)
      .eq('user_id', touristUserId)
      .single();

    if (passErr || !pass) {
      console.error('[verify-redemption] pass lookup error:', passErr);
      return errorResponse('Pass not found for this QR code', 404);
    }

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

    // Load tourist profile for display
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, display_name, email')
      .eq('user_id', touristUserId)
      .maybeSingle();

    const touristName =
      profile?.name ||
      profile?.display_name ||
      qr.name ||
      scannerUser.email?.split('@')[0] ||
      'Tourist';
    const touristEmail = profile?.email || scannerUser.email || '';

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

      const savedAmount = Number(body?.savedAmount ?? 0) || 0;
      const discountLabelRaw = body?.discount ?? body?.discountLabel ?? '';
      const discount_label =
        typeof discountLabelRaw === 'string' ? discountLabelRaw.trim() : String(discountLabelRaw ?? '').trim();

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
            originalPrice: body?.originalPrice ?? null,
            dealPrice: body?.dealPrice ?? null,
          },
        },
        200
      );
    }

    return errorResponse('Unknown action: ' + action, 400);
  } catch (err: any) {
    console.error('[verify-redemption] unexpected error:', err);
    return errorResponse(err?.message ?? 'Verification failed', 500);
  }
});


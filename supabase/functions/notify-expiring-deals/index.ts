// deno-lint-ignore-file no-explicit-any
/**
 * notify-expiring-deals — daily ops email listing active business deals expiring soon.
 *
 * Invoked by Supabase cron schedule (see supabase/config.toml) or manually:
 *   curl -X POST "$SUPABASE_URL/functions/v1/notify-expiring-deals" \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
 *
 * Secrets:
 *   RESEND_API_KEY — required to send mail
 *   OPS_NOTIFY_EMAILS — ops inboxes (optional; falls back to PURCHASE_NOTIFY_EMAILS)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';
import { notifyOpsOfExpiringDeals, type ExpiringDealRow } from '../_shared/opsNotify.ts';

const BEARER_PREFIX = /^Bearer\s+/i;
const DEFAULT_WINDOW_DAYS = 7;

function jsonResponse(req: Request, data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getSafeCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function errorResponse(req: Request, message: string, status = 400) {
  return jsonResponse(req, { success: false, error: message }, status);
}

function dateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysUntilExpiry(expiresOn: string, today: string): number {
  const end = new Date(`${expiresOn}T23:59:59Z`).getTime();
  const start = new Date(`${today}T00:00:00Z`).getTime();
  return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

function assertCronOrServiceAuth(req: Request): boolean {
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const cronSecret = (Deno.env.get('CRON_SECRET') ?? '').trim();
  const auth = (req.headers.get('Authorization') ?? '').replace(BEARER_PREFIX, '').trim();
  const headerSecret = (req.headers.get('x-cron-secret') ?? '').trim();

  if (serviceKey && auth === serviceKey) return true;
  if (cronSecret && (auth === cronSecret || headerSecret === cronSecret)) return true;
  return false;
}

async function resolveOwnerContacts(
  supabase: ReturnType<typeof createClient>,
  ownerIds: string[],
): Promise<Map<string, { email: string; name: string }>> {
  const out = new Map<string, { email: string; name: string }>();
  if (ownerIds.length === 0) return out;

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, email, business_email, full_name, name, display_name')
    .in('user_id', ownerIds);

  for (const row of profiles ?? []) {
    const uid = String(row.user_id ?? '');
    const email = String(row.business_email ?? row.email ?? '').trim();
    const name = String(row.full_name ?? row.name ?? row.display_name ?? '').trim();
    if (uid) out.set(uid, { email, name });
  }

  for (const uid of ownerIds) {
    if (out.get(uid)?.email) continue;
    try {
      const { data: authData, error } = await supabase.auth.admin.getUserById(uid);
      if (error || !authData?.user) continue;
      const email = String(authData.user.email ?? '').trim();
      const meta = authData.user.user_metadata as Record<string, unknown> | undefined;
      const name = String(meta?.full_name ?? meta?.name ?? '').trim();
      const prev = out.get(uid) ?? { email: '', name: '' };
      out.set(uid, {
        email: email || prev.email,
        name: prev.name || name,
      });
    } catch {
      /* best-effort */
    }
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse(req, 'Method not allowed', 405);
  }

  if (!assertCronOrServiceAuth(req)) {
    return errorResponse(req, 'Unauthorized', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(req, 'Server configuration error', 500);
  }

  const url = new URL(req.url);
  const windowDays = Math.min(
    30,
    Math.max(1, Number(url.searchParams.get('days') ?? DEFAULT_WINDOW_DAYS) || DEFAULT_WINDOW_DAYS),
  );

  const supabase = createClient(supabaseUrl, serviceKey);
  const today = dateOnlyUtc(new Date());
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + windowDays);
  const until = dateOnlyUtc(end);

  const { data, error } = await supabase
    .from('business_offerings')
    .select(`
      id, title, discount_valid_until, active,
      businesses!inner (
        id, name, phone, email, whatsapp_number, owner_id
      )
    `)
    .eq('active', true)
    .not('discount_valid_until', 'is', null)
    .gte('discount_valid_until', today)
    .lte('discount_valid_until', until)
    .order('discount_valid_until', { ascending: true });

  if (error) {
    console.error('[notify-expiring-deals] query error:', error.message);
    return errorResponse(req, error.message, 500);
  }

  const ownerIds = [
    ...new Set(
      (data ?? [])
        .map((row: Record<string, unknown>) => {
          const b = row.businesses as Record<string, unknown> | undefined;
          return b?.owner_id != null ? String(b.owner_id) : '';
        })
        .filter(Boolean),
    ),
  ];
  const ownerContacts = await resolveOwnerContacts(supabase, ownerIds);

  const deals: ExpiringDealRow[] = (data ?? []).map((row: Record<string, unknown>) => {
    const b = row.businesses as Record<string, unknown> | undefined;
    const expiresOn = String(row.discount_valid_until ?? '').slice(0, 10);
    const ownerId = b?.owner_id != null ? String(b.owner_id) : '';
    const owner = ownerContacts.get(ownerId);
    const title = String(row.title ?? '').trim();
    const venue = String(b?.name ?? '').trim();

    return {
      offeringId: String(row.id ?? ''),
      dealTitle: title || venue || 'Listing',
      businessName: venue || title || 'Business',
      expiresOn,
      daysRemaining: daysUntilExpiry(expiresOn, today),
      phone: String(b?.phone ?? '').trim(),
      whatsapp: String(b?.whatsapp_number ?? '').trim(),
      ownerEmail: owner?.email ?? String(b?.email ?? '').trim(),
      ownerName: owner?.name ?? '',
    };
  });

  deals.sort((a, b) => a.daysRemaining - b.daysRemaining || a.expiresOn.localeCompare(b.expiresOn));

  const notify = await notifyOpsOfExpiringDeals(deals, windowDays);

  return jsonResponse(req, {
    success: true,
    windowDays,
    dealCount: deals.length,
    email: notify,
    deals: deals.map((d) => ({
      business: d.businessName,
      deal: d.dealTitle,
      expiresOn: d.expiresOn,
      daysRemaining: d.daysRemaining,
      ownerEmail: d.ownerEmail,
    })),
  });
});

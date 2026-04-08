// deno-lint-ignore-file no-explicit-any
/**
 * manage-business Edge Function
 * Handles business listing submission, admin review, edits, and related operations.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for secure database operations.
 *
 * Email (initial listing approval): requires SENDGRID_API_KEY (same as send-email / paypal-capture).
 * Optional: SENDGRID_FROM_EMAIL (default stikmnek@gmail.com if unset), SENDGRID_FROM_NAME, APP_BASE_URL (default https://stikmnek.com).
 * CORS: set CORS_ALLOWED_ORIGINS (comma-separated origins) in Edge Function secrets.
 * If unset, Access-Control-Allow-Origin is *. If set, request Origin must match an entry (see getSafeCorsHeaders).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';

const CATEGORIES = ['dining', 'accommodation', 'tours', 'activities', 'shopping', 'transport', 'services', 'other'];

function jsonResponse(req: Request, data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getSafeCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function errorResponse(req: Request, message: string, status = 400, extra?: Record<string, unknown>) {
  return jsonResponse(req, { success: false, error: message, errorCode: status, ...extra }, status);
}

type SupabaseServiceClient = ReturnType<typeof createClient>;

function unauthorizedResponse(req: Request): Response {
  return jsonResponse(req, { success: false, error: 'Unauthorized' }, 403);
}

const BEARER_PREFIX = /^Bearer\s+/i;

/**
 * Resolve the authenticated user from the JWT in the request.
 * Never use `body.userId` for caller identity.
 */
async function getAuthUser(
  authClient: SupabaseServiceClient,
  req: Request,
): Promise<{ user: { id: string; email?: string } } | { response: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.trim()) {
    return { response: errorResponse(req, 'Missing Authorization header', 401, { reason: 'missing_authorization' }) };
  }
  const token = authHeader.replace(BEARER_PREFIX, '').trim();
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) {
    return {
      response: errorResponse(req, 'Invalid or expired session', 401, {
        reason: 'auth_invalid',
        authError: error?.message ?? null,
      }),
    };
  }
  return { user };
}

async function isAdminUser(supabase: SupabaseServiceClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role === 'admin';
}

/** Returns a 403 Response if the user is not an admin; otherwise null. */
async function assertAdmin(
  supabase: SupabaseServiceClient,
  userId: string,
  req: Request,
): Promise<Response | null> {
  if (!(await isAdminUser(supabase, userId))) {
    return unauthorizedResponse(req);
  }
  return null;
}

/** Returns a 403 Response if userId is not the business owner; otherwise null. */
async function requireOwner(
  supabase: SupabaseServiceClient,
  businessId: string,
  userId: string,
  req: Request,
): Promise<Response | null> {
  const { data: biz, error } = await supabase
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .maybeSingle();
  if (error || !biz?.owner_id || String(biz.owner_id) !== String(userId)) {
    return unauthorizedResponse(req);
  }
  return null;
}

/** Admin may act on any business; non-admins must own the business row. */
async function assertAdminOrOwner(
  supabase: SupabaseServiceClient,
  businessId: string,
  userId: string,
  req: Request,
): Promise<Response | null> {
  if (await isAdminUser(supabase, userId)) return null;
  return requireOwner(supabase, businessId, userId, req);
}

/**
 * Remove gallery rows + Storage objects for a business, then caller deletes `businesses` row.
 * `business_photos` may not have ON DELETE CASCADE in all deployments.
 */
async function purgeBusinessPhotosAndStorage(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
): Promise<{ error: string | null }> {
  const { data: photos, error: listErr } = await supabase
    .from('business_photos')
    .select('file_path')
    .eq('business_id', businessId);

  if (listErr) {
    console.error('[manage-business] purgeBusinessPhotosAndStorage list:', listErr);
    return { error: listErr.message };
  }

  const paths = (photos || [])
    .map((p: { file_path?: string | null }) => p.file_path)
    .filter((p: string | null | undefined): p is string => typeof p === 'string' && p.trim().length > 0);

  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from('business-photos').remove(paths);
    if (rmErr) {
      console.warn('[manage-business] storage remove (continuing):', rmErr.message);
    }
  }

  const { error: delPhErr } = await supabase
    .from('business_photos')
    .delete()
    .eq('business_id', businessId);

  if (delPhErr) {
    console.error('[manage-business] purgeBusinessPhotosAndStorage delete rows:', delPhErr);
    return { error: 'Failed to delete photo records: ' + delPhErr.message };
  }

  return { error: null };
}

/** Public app URL for listing links (no trailing slash). Uses `APP_BASE_URL` secret (Deno env ≈ `process.env.APP_BASE_URL`). */
function getAppBaseUrl(): string {
  const raw = (Deno.env.get('APP_BASE_URL') || 'https://stikmnek.com').trim();
  return raw.replace(/\/+$/, '');
}

const LISTING_LIVE_BADGE_URL = 'https://stikmnek.com/images/stikmnek-badge.png';

function escapeHtmlEmail(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Hashtag segment: strip spaces and non-alphanumeric (e.g. "My Amazing Business!" → "MyAmazingBusiness"). */
function businessNameForHashtag(name: string): string {
  const alnum = String(name ?? '').trim().replace(/[^a-zA-Z0-9]+/g, '');
  return alnum || 'YourBusiness';
}

/** Owner inbox for listing-live email: `user_profiles.email` only (initial approval flow). */
async function resolveOwnerNotificationEmail(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
): Promise<string | null> {
  const { data: prof, error: profErr } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('user_id', ownerId)
    .maybeSingle();
  if (profErr) {
    console.warn('[manage-business] resolveOwnerNotificationEmail user_profiles:', profErr.message);
  }
  const em = prof?.email;
  if (typeof em === 'string' && em.trim()) return em.trim();
  return null;
}

/**
 * SendGrid: congratulatory email when a brand-new business listing is first approved.
 * Best-effort: logs on failure; does not throw (approval already persisted).
 */
async function sendInitialListingLiveEmail(params: {
  toEmail: string;
  businessName: string;
  listingUrl: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY');
  if (!apiKey) {
    console.warn('[manage-business] SENDGRID_API_KEY not set — skipping listing-live email');
    return { sent: false, skipped: true, error: 'SENDGRID_API_KEY not set' };
  }

  const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'stikmnek@gmail.com';
  const fromName = Deno.env.get('SENDGRID_FROM_NAME') || 'StikmNek';
  const subject = 'Congratulations! Your StikmNek Listing is Live!';

  const nameEsc = escapeHtmlEmail(params.businessName);
  const urlEsc = escapeHtmlEmail(params.listingUrl);
  const hashtagName = businessNameForHashtag(params.businessName);
  const tagLine =
    `#StikmNek #VanuatuDeals #${hashtagName} #TravelVanuatu #SupportLocal`;

  const html = `
<div style="font-family: Arial, sans-serif; line-height: 1.55; color: #111; max-width: 560px;">
  <p>Hi ${nameEsc},</p>
  <p>Great news! Your listing on StikmNek is now live!</p>
  <p>You can view it here: <a href="${urlEsc}">${urlEsc}</a></p>
  <p>To celebrate, we&#39;ve prepared a special message for you to share with your audience on social media. Let your customers know they can now find you on StikmNek and start saving!</p>
  <p><img src="${escapeHtmlEmail(LISTING_LIVE_BADGE_URL)}" alt="StikmNek" width="120" style="display:block;border:0;" /></p>
  <hr>
  <h3 style="margin: 16px 0 8px; font-size: 1.1rem;">🎉 Exciting News! We&#39;re officially live on StikmNek! 🌴</h3>
  <p>Find our amazing deals and discover the best of Vanuatu with us. Get ready to save on unique experiences!</p>
  <p>Check out our StikmNek page here: <a href="${urlEsc}">${urlEsc}</a></p>
  <p>${escapeHtmlEmail(tagLine)}</p>
  <hr>
  <p>Thank you for joining the StikmNek family. We&#39;re thrilled to have you!</p>
  <p>Best regards,<br>The StikmNek Team</p>
</div>
`.trim();

  const plainLines = [
    `Hi ${params.businessName},`,
    '',
    'Great news! Your listing on StikmNek is now live!',
    '',
    `You can view it here: ${params.listingUrl}`,
    '',
    "To celebrate, we've prepared a special message for you to share with your audience on social media. Let your customers know they can now find you on StikmNek and start saving!",
    '',
    `Badge: ${LISTING_LIVE_BADGE_URL}`,
    '',
    '---',
    '',
    "🎉 Exciting News! We're officially live on StikmNek! 🌴",
    '',
    'Find our amazing deals and discover the best of Vanuatu with us. Get ready to save on unique experiences!',
    '',
    `Check out our StikmNek page here: ${params.listingUrl}`,
    '',
    tagLine,
    '',
    '---',
    '',
    "Thank you for joining the StikmNek family. We're thrilled to have you!",
    '',
    'Best regards,',
    'The StikmNek Team',
  ];
  const plain = plainLines.join('\n');

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.toEmail }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [
          { type: 'text/plain', value: plain },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[manage-business] SendGrid listing-live email FAILED:', res.status, errText);
      return { sent: false, error: `SendGrid error: ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[manage-business] SendGrid listing-live email fetch error:', msg);
    return { sent: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey =
      (Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '').trim() ||
      (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim() ||
      (Deno.env.get('SUPABASE_ANON_KEY_PUBLIC') ?? '').trim();

    // SUPABASE_SERVICE_ROLE_KEY is a reserved secret in Supabase and is auto-injected at runtime.
    // Do not enforce arbitrary length checks here; just ensure it exists.
    if (!supabaseServiceKey) {
      console.error('[manage-business] SUPABASE_SERVICE_ROLE_KEY is missing');
      return errorResponse(req, 'Server configuration error: missing service role key', 500);
    }
    if (!supabaseUrl) {
      console.error('[manage-business] SUPABASE_URL is missing');
      return errorResponse(req, 'Server configuration error: missing Supabase URL', 500);
    }
    if (!supabaseAnonKey) {
      console.error('[manage-business] Missing anon key for JWT validation (set APP_SUPABASE_ANON_KEY)');
      return errorResponse(req, 'Server configuration error', 500, { reason: 'missing_supabase_anon_key' });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authResult = await getAuthUser(authClient, req);
    if ('response' in authResult) {
      return authResult.response;
    }
    const authUser = authResult.user;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (!action) {
      return errorResponse(req, 'Missing action');
    }

    // ─── HEALTH ───
    if (action === 'health') {
      return jsonResponse(req, { success: true });
    }

    // ─── LIST_CATEGORIES ───
    if (action === 'list_categories') {
      return jsonResponse(req, { categories: CATEGORIES });
    }

    // ─── SUBMIT_BUSINESS ───
    if (action === 'submit_business') {
      const userId = authUser.id;

      const record = {
        owner_id: userId,
        name: body.name || '',
        category: body.category || 'dining',
        description: body.description || '',
        discount: body.discount || '',
        original_price: Number(body.originalPrice) || 0,
        deal_price: Number(body.dealPrice) || 0,
        location: body.location || 'Port Vila, Vanuatu',
        phone: body.phone || '',
        email: body.email || '',
        hours: body.hours || '',
        image: body.image || '',
        status: 'pending',
        map_url: body.mapUrl || null,
        website: body.website || null,
        discount_valid_from: body.discountValidFrom || null,
        discount_valid_until: body.discountValidUntil || null,
        whatsapp_number: body.whatsappNumber || null,
        pricing_tiers: body.pricingTiers ?? body.pricing_tiers ?? null,
      };

      const { data: pending, error } = await supabase
        .from('pending_businesses')
        .insert(record)
        .select()
        .single();

      if (error) {
        console.error('[manage-business] submit_business insert error:', error);
        return errorResponse(req, error.message || 'Failed to submit business', 500);
      }

      // Insert photos if provided
      const photos = body.photos || [];
      if (pending?.id && photos.length > 0) {
        const photoRecords = photos.map((p: any, i: number) => ({
          business_id: pending.id,
          url: p.url || '',
          file_path: p.filePath || null,
          uploaded_by: userId,
          is_main: p.isMain ?? i === 0,
          status: 'pending',
        }));
        await supabase.from('business_photos').insert(photoRecords);
      }

      return jsonResponse(req, {
        success: true,
        business: { id: pending.id, ...pending },
      });
    }

    // ─── RESUBMIT_PENDING_BUSINESS ───
    // Owner edits a rejected submission and resubmits for approval
    if (action === 'resubmit_pending_business') {
      try {
        const userId = authUser.id;
        const pendingId = body.pendingId;
        if (!pendingId) return errorResponse(req, 'Missing pendingId', 400);

        const { data: existing, error: fetchErr } = await supabase
          .from('pending_businesses')
          .select('*')
          .eq('id', pendingId)
          .eq('owner_id', userId)
          .single();

        if (fetchErr || !existing) return errorResponse(req, 'Submission not found or access denied', 404);
        if (existing.status !== 'rejected') return errorResponse(req, 'Only rejected submissions can be resubmitted', 400);

        const updates: Record<string, any> = {
          name: body.name ?? existing.name,
          category: body.category ?? existing.category,
          description: body.description ?? existing.description,
          discount: body.discount ?? existing.discount ?? '',
          original_price: Number(body.originalPrice ?? body.original_price ?? existing.original_price) || 0,
          deal_price: Number(body.dealPrice ?? body.deal_price ?? existing.deal_price) || 0,
          location: body.location ?? existing.location ?? '',
          phone: body.phone ?? existing.phone ?? '',
          email: body.email ?? existing.email ?? '',
          hours: body.hours ?? existing.hours ?? '',
          image: body.image ?? existing.image ?? '',
          status: 'pending',
          admin_notes: null,
          updated_at: new Date().toISOString(),
        };
        if (body.mapUrl !== undefined || body.map_url !== undefined || existing.map_url !== undefined) updates.map_url = body.mapUrl ?? body.map_url ?? existing.map_url;
        if (body.website !== undefined || existing.website !== undefined) updates.website = body.website ?? existing.website;
        if (body.discountValidFrom !== undefined || body.discount_valid_from !== undefined || existing.discount_valid_from !== undefined) updates.discount_valid_from = body.discountValidFrom ?? body.discount_valid_from ?? existing.discount_valid_from;
        if (body.discountValidUntil !== undefined || body.discount_valid_until !== undefined || existing.discount_valid_until !== undefined) updates.discount_valid_until = body.discountValidUntil ?? body.discount_valid_until ?? existing.discount_valid_until;
        if (body.whatsappNumber !== undefined || body.whatsapp_number !== undefined || existing.whatsapp_number !== undefined) updates.whatsapp_number = body.whatsappNumber ?? body.whatsapp_number ?? existing.whatsapp_number;
        if (body.pricingTiers !== undefined || body.pricing_tiers !== undefined) {
          updates.pricing_tiers = body.pricingTiers ?? body.pricing_tiers ?? null;
        }

        const { data: updated, error: updateErr } = await supabase
          .from('pending_businesses')
          .update(updates)
          .eq('id', pendingId)
          .select()
          .single();

        if (updateErr) {
          console.error('[manage-business] resubmit update error:', updateErr);
          return errorResponse(req, 'Resubmit failed: ' + updateErr.message, 500);
        }

        const photos = (body.photos || []).filter((p: any) => p?.url);
        if (photos.length > 0) {
          await supabase.from('business_photos').delete().eq('business_id', pendingId);
          const photoRecords = photos.map((p: any, i: number) => ({
            business_id: pendingId,
            url: p.url,
            file_path: p.filePath || null,
            uploaded_by: userId,
            is_main: p.isMain ?? i === 0,
            status: 'pending',
          }));
          const { error: insertErr } = await supabase.from('business_photos').insert(photoRecords);
          if (insertErr) {
            console.error('[manage-business] resubmit photo insert error:', insertErr);
            return errorResponse(req, 'Resubmit succeeded but photo save failed: ' + insertErr.message, 500);
          }
        }

        return jsonResponse(req, { success: true, business: updated });
      } catch (err: any) {
        console.error('[manage-business] resubmit error:', err);
        return errorResponse(req, 'Resubmit failed: ' + (err?.message || String(err)), 500);
      }
    }

    // ─── GET_ALL_OWNER_DATA ───
    if (action === 'get_all_owner_data') {
      const userId = authUser.id;

      const [approvedRes, pendingRes] = await Promise.all([
        supabase.from('businesses').select('*').eq('owner_id', userId),
        supabase.from('pending_businesses').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
      ]);

      return jsonResponse(req, {
        success: true,
        approved_businesses: approvedRes.data || [],
        pending_submissions: pendingRes.data || [],
      });
    }

    // ─── GET_OWNER_BUSINESSES ───
    if (action === 'get_owner_businesses') {
      const userId = authUser.id;

      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', userId);

      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { businesses: data || [] });
    }

    // ─── GET_PENDING ───
    if (action === 'get_pending') {
      if (await isAdminUser(supabase, authUser.id)) {
        const { data, error } = await supabase
          .from('pending_businesses')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) return errorResponse(req, error.message, 500);
        return jsonResponse(req, { businesses: data || [] });
      }

      const { data, error } = await supabase
        .from('pending_businesses')
        .select('*')
        .eq('owner_id', authUser.id)
        .order('created_at', { ascending: false });
      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { businesses: data || [] });
    }

    // ─── GET_OWNER_OFFERINGS_LIVE ───
    // Join offerings + profiles using service role (avoids client RLS / PostgREST issues).
    if (action === 'get_owner_offerings_live') {
      const userId = authUser.id;
      const filterBusinessId =
        body.businessId != null && String(body.businessId).trim() !== ''
          ? String(body.businessId).trim()
          : null;

      const profileSelect =
        'id, name, category, owner_id, location, lat, lng, hours, opening_hours, phone, email, contact_email, business_email, whatsapp_number, rating, review_count, featured, active, map_url, website, tags';
      const offeringSelect =
        'id, business_id, title, description, description_fr, description_bi, discount, original_price, deal_price, image, map_url, website, discount_valid_from, discount_valid_until, whatsapp_number, pricing_tiers, tags, featured, active, created_at';

      const { data: profiles, error: pErr } = await supabase
        .from('businesses')
        .select(profileSelect)
        .eq('owner_id', userId);

      if (pErr) {
        console.error('[manage-business] get_owner_offerings_live profiles:', pErr);
        return errorResponse(req, pErr.message, 500);
      }

      const plist = profiles || [];
      const profileIds = plist.map((p: { id: string }) => p.id).filter(Boolean);
      if (profileIds.length === 0) {
        return jsonResponse(req, { success: true, items: [] });
      }

      if (filterBusinessId && !profileIds.includes(filterBusinessId)) {
        return jsonResponse(req, { success: true, items: [] });
      }

      const offBase = supabase.from('business_offerings').select(offeringSelect);
      const offFiltered = filterBusinessId
        ? offBase.eq('business_id', filterBusinessId)
        : offBase.in('business_id', profileIds);

      const { data: offerings, error: oErr } = await offFiltered.order('created_at', {
        ascending: false,
      });
      if (oErr) {
        console.error('[manage-business] get_owner_offerings_live offerings:', oErr);
        return errorResponse(req, oErr.message, 500);
      }

      const byBiz = new Map(plist.map((p: { id: string }) => [p.id, p]));
      const items = (offerings || [])
        .map((o: { business_id: string }) => {
          const b = byBiz.get(o.business_id);
          if (!b) return null;
          return { offering: o, business: b };
        })
        .filter((x: unknown): x is { offering: Record<string, unknown>; business: Record<string, unknown> } =>
          x != null
        );

      return jsonResponse(req, { success: true, items });
    }

    // ─── ATTACH_PENDING_PHOTOS ───
    // Attach uploaded photo rows to an existing pending_businesses record.
    // Used after RPC insert_pending_business to guarantee business_photos rows are created server-side.
    if (action === 'attach_pending_photos') {
      const userId = authUser.id;
      const pendingId = body.pendingId;
      const photos = Array.isArray(body.photos) ? body.photos : [];
      if (!pendingId) return errorResponse(req, 'Missing pendingId', 400);
      if (photos.length === 0) return jsonResponse(req, { success: true, inserted: 0 });

      const { data: pending, error: pendingErr } = await supabase
        .from('pending_businesses')
        .select('id, owner_id')
        .eq('id', pendingId)
        .single();
      if (pendingErr || !pending) return errorResponse(req, 'Pending business not found', 404);
      if (String(pending.owner_id) !== String(userId)) return errorResponse(req, 'Access denied', 403);

      const validPhotos = photos.filter((p: any) => !!p?.url);
      if (validPhotos.length === 0) return jsonResponse(req, { success: true, inserted: 0 });

      // Replace existing rows for this pending listing to avoid duplicates on retries.
      await supabase.from('business_photos').delete().eq('business_id', pendingId);

      const photoRecords = validPhotos.map((p: any, i: number) => ({
        business_id: pendingId,
        url: p.url,
        file_path: p.filePath || null,
        uploaded_by: userId,
        is_main: p.isMain ?? i === 0,
        status: 'pending',
      }));
      const { error: insertErr } = await supabase.from('business_photos').insert(photoRecords);
      if (insertErr) {
        console.error('[manage-business] attach_pending_photos insert error:', insertErr);
        return errorResponse(req, 'Failed to attach photos: ' + insertErr.message, 500);
      }
      return jsonResponse(req, { success: true, inserted: photoRecords.length });
    }

    // ─── GET_PENDING_EDITS ───
    if (action === 'get_pending_edits') {
      const userId = authUser.id;
      const businessId = body.businessId;

      if (await isAdminUser(supabase, userId)) {
        const { data, error } = await supabase
          .from('pending_edits')
          .select('*')
          .eq('status', 'pending')
          .order('submitted_at', { ascending: false });
        if (error) return errorResponse(req, error.message, 500);
        return jsonResponse(req, { edits: data || [] });
      }

      if (businessId) {
        const denied = await requireOwner(supabase, String(businessId), userId, req);
        if (denied) return denied;
        const { data, error } = await supabase
          .from('pending_edits')
          .select('*')
          .eq('business_id', businessId)
          .eq('owner_id', userId)
          .order('submitted_at', { ascending: false });
        if (error) return errorResponse(req, error.message, 500);
        return jsonResponse(req, { edits: data || [] });
      }

      const { data, error } = await supabase
        .from('pending_edits')
        .select('*')
        .eq('owner_id', userId)
        .order('submitted_at', { ascending: false });
      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { edits: data || [] });
    }

    // ─── ADMIN_CREATE_BUSINESS ───
    if (action === 'admin_create_business') {
      const denied = await assertAdmin(supabase, authUser.id, req);
      if (denied) return denied;

      const targetOwnerId =
        (typeof body.ownerId === 'string' && body.ownerId.trim() ? body.ownerId.trim() : null) ??
        (typeof body.targetOwnerId === 'string' && body.targetOwnerId.trim() ? body.targetOwnerId.trim() : null) ??
        (typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : null) ??
        authUser.id;

      const record = {
        owner_id: targetOwnerId,
        name: body.name || '',
        category: body.category || 'dining',
        description: body.description || '',
        discount: body.discount || '',
        original_price: Number(body.originalPrice) || 0,
        deal_price: Number(body.dealPrice) || 0,
        location: body.location || 'Port Vila, Vanuatu',
        phone: body.phone || '',
        hours: body.hours || '',
        image: body.image || '',
        map_url: body.mapUrl || null,
        website: body.website || null,
        discount_valid_from: body.discountValidFrom || null,
        discount_valid_until: body.discountValidUntil || null,
        featured: body.featured ?? false,
      };

      const { data, error } = await supabase
        .from('businesses')
        .insert(record)
        .select()
        .single();

      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { business: data });
    }

    // ─── REVIEW_BUSINESS ───
    if (action === 'review_business') {
      const denied = await assertAdmin(supabase, authUser.id, req);
      if (denied) return denied;

      const pendingId = body.businessId; // pending_businesses.id
      const decision = body.decision; // 'approved' | 'rejected'
      const adminNotes = body.adminNotes || '';

      if (!pendingId || !decision) return errorResponse(req, 'Missing businessId or decision');

      const { data: pending, error: fetchErr } = await supabase
        .from('pending_businesses')
        .select('*')
        .eq('id', pendingId)
        .single();

      if (fetchErr || !pending) return errorResponse(req, 'Pending business not found', 404);

      if (decision === 'rejected') {
        const { error: updateErr } = await supabase
          .from('pending_businesses')
          .update({
            status: 'rejected',
            admin_notes: adminNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pendingId);
        if (updateErr) return errorResponse(req, updateErr.message, 500);
        return jsonResponse(req, { success: true });
      }

      // ─── approved: master stub on `businesses`, rich listing on `business_offerings`, then remove pending row ───
      const pendingRow = pending as Record<string, unknown>;
      const existingProfileId =
        pendingRow.business_id != null && String(pendingRow.business_id).trim() !== ''
          ? String(pendingRow.business_id)
          : null;
      const isInitialNewBusinessApproval = existingProfileId == null;

      const vDesc = String(pending.description ?? '');
      const tagArray = [String(pending.category || 'dining')];

      const offeringFields = {
        title: (pending.name && String(pending.name).trim()) || 'Main offer',
        description: vDesc,
        description_fr: vDesc,
        description_bi: vDesc,
        discount: pending.discount || '',
        original_price: Number(pending.original_price) || 0,
        deal_price: Number(pending.deal_price) || 0,
        image: pending.image || '',
        map_url: pending.map_url ?? null,
        website: pending.website ?? null,
        discount_valid_from: pending.discount_valid_from ?? null,
        discount_valid_until: pending.discount_valid_until ?? null,
        whatsapp_number: pending.whatsapp_number ?? null,
        pricing_tiers: pending.pricing_tiers ?? null,
        tags: tagArray,
        active: true,
        updated_at: new Date().toISOString(),
      };

      const vEmail = (pending.email && String(pending.email).trim()) || null;

      /** Master profile only: no duplicate listing copy (canonical fields live on business_offerings). */
      const stubProfilePatch = (): Record<string, unknown> => {
        const trimmedName = pending.name != null ? String(pending.name).trim() : '';
        const base: Record<string, unknown> = {
          category: pending.category || 'dining',
          location: pending.location || '',
          phone: pending.phone || '',
          hours: pending.hours || '',
          map_url: pending.map_url ?? null,
          website: pending.website ?? null,
          discount_valid_from: pending.discount_valid_from ?? null,
          discount_valid_until: pending.discount_valid_until ?? null,
          whatsapp_number: pending.whatsapp_number ?? null,
          tags: tagArray,
          email: vEmail,
          contact_email: vEmail,
          business_email: vEmail,
          active: true,
          is_verified: true,
          description: '',
          description_fr: '',
          description_bi: '',
          image: '',
          discount: '',
          original_price: 0,
          deal_price: 0,
          pricing_tiers: null,
          updated_at: new Date().toISOString(),
        };
        if (trimmedName) base.name = trimmedName;
        return base;
      };

      let liveBusinessId: string;

      if (existingProfileId) {
        const { data: prof, error: profErr } = await supabase
          .from('businesses')
          .select('id, owner_id')
          .eq('id', existingProfileId)
          .maybeSingle();

        if (profErr || !prof) {
          return errorResponse(req, 'Invalid business_id on pending row (profile not found)', 400);
        }
        if (String(prof.owner_id) !== String(pending.owner_id)) {
          return errorResponse(req, 'Invalid business_id on pending row (owner mismatch)', 403);
        }

        const { error: profUpdErr } = await supabase
          .from('businesses')
          .update(stubProfilePatch())
          .eq('id', existingProfileId);

        if (profUpdErr) {
          console.error('[manage-business] Failed to update businesses stub on re-approve:', profUpdErr);
          return errorResponse(
            req,
            'Approved but failed to update profile: ' + profUpdErr.message,
            500,
          );
        }

        const { data: primaryRows, error: offSelErr } = await supabase
          .from('business_offerings')
          .select('id')
          .eq('business_id', existingProfileId)
          .order('created_at', { ascending: true })
          .limit(1);

        if (offSelErr) {
          console.error('[manage-business] offering lookup:', offSelErr);
          return errorResponse(req, offSelErr.message, 500);
        }

        const primaryId = primaryRows?.[0]?.id as string | undefined;
        if (primaryId) {
          const { error: offUpdErr } = await supabase
            .from('business_offerings')
            .update(offeringFields)
            .eq('id', primaryId);
          if (offUpdErr) {
            console.error('[manage-business] Failed to update business_offerings:', offUpdErr);
            return errorResponse(
              req,
              'Approved but failed to update live offering: ' + offUpdErr.message,
              500,
            );
          }
        } else {
          const { error: offInsErr } = await supabase.from('business_offerings').insert({
            business_id: existingProfileId,
            ...offeringFields,
            featured: false,
          });
          if (offInsErr) {
            console.error('[manage-business] Failed to insert business_offerings:', offInsErr);
            return errorResponse(
              req,
              'Approved but failed to create live offering: ' + offInsErr.message,
              500,
            );
          }
        }

        liveBusinessId = existingProfileId;
      } else {
        const bizStub = {
          owner_id: pending.owner_id,
          name: pending.name,
          ...stubProfilePatch(),
        };

        const { data: newBiz, error: insertErr } = await supabase
          .from('businesses')
          .insert(bizStub)
          .select()
          .single();

        if (insertErr) {
          console.error('[manage-business] Failed to create businesses stub:', insertErr);
          return errorResponse(req, 'Approved but failed to create business record: ' + insertErr.message, 500);
        }

        liveBusinessId = newBiz.id as string;

        const { error: offInsErr } = await supabase.from('business_offerings').insert({
          business_id: liveBusinessId,
          ...offeringFields,
          featured: false,
        });
        if (offInsErr) {
          console.error('[manage-business] Offering insert failed after stub insert:', offInsErr);
          return errorResponse(
            req,
            'Approved but failed to create live offering: ' + offInsErr.message,
            500,
          );
        }
      }

      const { error: rejErr } = await supabase
        .from('business_photos')
        .update({ business_id: liveBusinessId })
        .eq('business_id', pendingId)
        .eq('status', 'rejected');

      if (rejErr) {
        console.error('[manage-business] Photo update (rejected) failed after business approval:', rejErr);
        return errorResponse(
          req,
          'Business approved but rejected photos could not be relinked. Error: ' + rejErr.message,
          500,
        );
      }

      const { error: photoErr } = await supabase
        .from('business_photos')
        .update({ business_id: liveBusinessId, status: 'approved' })
        .eq('business_id', pendingId);

      if (photoErr) {
        console.error('[manage-business] Photo update failed after business approval:', photoErr);
        return errorResponse(
          req,
          'Business approved but photos could not be updated. Please manually approve photos for this business. Error: ' + photoErr.message,
          500,
        );
      }

      if (isInitialNewBusinessApproval) {
        const ownerEmail = await resolveOwnerNotificationEmail(supabase, String(pending.owner_id));
        const listingUrl = `${getAppBaseUrl()}/business/${liveBusinessId}`;
        const { data: liveNameRow } = await supabase
          .from('businesses')
          .select('name')
          .eq('id', liveBusinessId)
          .maybeSingle();
        const displayName =
          (liveNameRow?.name && String(liveNameRow.name).trim()) ||
          (pending.name != null && String(pending.name).trim()) ||
          'there';

        if (ownerEmail) {
          const sgResult = await sendInitialListingLiveEmail({
            toEmail: ownerEmail,
            businessName: displayName,
            listingUrl,
          });
          if (!sgResult.sent) {
            console.warn(
              '[manage-business] Initial listing-live email:',
              sgResult.skipped ? 'skipped (no API key)' : sgResult.error ?? 'unknown',
            );
          }
        } else {
          console.warn(
            '[manage-business] Initial listing-live email skipped: user_profiles.email empty for owner',
            String(pending.owner_id),
          );
        }
      }

      const { error: delPendingErr } = await supabase
        .from('pending_businesses')
        .delete()
        .eq('id', pendingId);

      if (delPendingErr) {
        console.error('[manage-business] Failed to delete pending row after approval:', delPendingErr);
        return errorResponse(
          req,
          'Approved but could not remove pending submission: ' + delPendingErr.message,
          500,
        );
      }

      return jsonResponse(req, { success: true });
    }

    // ─── DELETE_OWN_BUSINESS (owner only; photos + storage + row) ───
    if (action === 'delete_own_business') {
      const businessId = body.businessId;
      if (!businessId) return errorResponse(req, 'Missing businessId');

      const { data: bizRow, error: fetchErr } = await supabase
        .from('businesses')
        .select('id, owner_id, name')
        .eq('id', businessId)
        .maybeSingle();

      if (fetchErr || !bizRow) {
        return errorResponse(req, 'Business not found', 404);
      }
      const ownDenied = await requireOwner(supabase, String(businessId), authUser.id, req);
      if (ownDenied) return ownDenied;

      const purge = await purgeBusinessPhotosAndStorage(supabase, businessId);
      if (purge.error) {
        return errorResponse(req, purge.error, 500);
      }

      const { data: deletedOwn, error: delErr } = await supabase
        .from('businesses')
        .delete()
        .eq('id', businessId)
        .eq('owner_id', authUser.id)
        .select('id');

      if (delErr) {
        console.error('[manage-business] delete_own_business:', delErr);
        return errorResponse(req, delErr.message || 'Failed to delete listing', 500);
      }
      if (!deletedOwn?.length) {
        return errorResponse(req, 'Could not delete listing (no rows removed)', 500);
      }

      console.log('[manage-business] delete_own_business OK:', businessId, bizRow.name);
      return jsonResponse(req, { success: true, deletedName: bizRow.name });
    }

    // ─── ADMIN_DELETE_BUSINESS ───
    if (action === 'admin_delete_business') {
      const businessId = body.businessId;
      if (!businessId) return errorResponse(req, 'Missing businessId');

      const denied = await assertAdmin(supabase, authUser.id, req);
      if (denied) return denied;

      const purge = await purgeBusinessPhotosAndStorage(supabase, businessId);
      if (purge.error) {
        return errorResponse(req, purge.error, 500);
      }

      const { data: deletedAdmin, error } = await supabase
        .from('businesses')
        .delete()
        .eq('id', businessId)
        .select('id');
      if (error) return errorResponse(req, error.message, 500);
      if (!deletedAdmin?.length) {
        return errorResponse(
          req,
          'No matching business profile to delete. Use the profile id (not the deal/listing row id).',
          404,
        );
      }
      return jsonResponse(req, { success: true });
    }

    // ─── SUBMIT_EDIT ───
    if (action === 'submit_edit') {
      const userId = authUser.id;
      const businessId = body.businessId;
      const changes = body.changes || {};

      if (!businessId || Object.keys(changes).length === 0) {
        return errorResponse(req, 'Missing businessId or changes');
      }

      const denied = await assertAdminOrOwner(supabase, String(businessId), userId, req);
      if (denied) return denied;

      let ownerIdForEdit = userId;
      if (await isAdminUser(supabase, userId)) {
        const { data: bizRow, error: bizErr } = await supabase
          .from('businesses')
          .select('owner_id')
          .eq('id', businessId)
          .maybeSingle();
        if (bizErr || !bizRow?.owner_id) {
          return errorResponse(req, 'Business not found', 404);
        }
        ownerIdForEdit = String(bizRow.owner_id);
      }

      // Check for existing pending edit
      const { data: existing } = await supabase
        .from('pending_edits')
        .select('id, changes')
        .eq('business_id', businessId)
        .eq('owner_id', ownerIdForEdit)
        .eq('status', 'pending')
        .single();

      if (existing) {
        const mergedChanges = { ...(existing.changes as object || {}), ...changes };
        const { error } = await supabase
          .from('pending_edits')
          .update({ changes: mergedChanges })
          .eq('id', existing.id);
        if (error) return errorResponse(req, error.message, 500);
        return jsonResponse(req, { success: true, updated: true });
      }

      const { error } = await supabase
        .from('pending_edits')
        .insert({
          business_id: businessId,
          owner_id: ownerIdForEdit,
          changes,
          status: 'pending',
        });

      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { success: true });
    }

    // ─── REVIEW_EDIT ───
    if (action === 'review_edit') {
      const denied = await assertAdmin(supabase, authUser.id, req);
      if (denied) return denied;

      const editId = body.editId;
      const decision = body.decision; // 'approved' | 'rejected'
      const adminNotes = body.adminNotes || '';

      if (!editId || !decision) return errorResponse(req, 'Missing editId or decision');

      const { data: edit, error: fetchErr } = await supabase
        .from('pending_edits')
        .select('*')
        .eq('id', editId)
        .single();

      if (fetchErr || !edit) return errorResponse(req, 'Pending edit not found', 404);

      const { error: updateErr } = await supabase
        .from('pending_edits')
        .update({
          status: decision,
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', editId);

      if (updateErr) return errorResponse(req, updateErr.message, 500);

      if (decision === 'approved' && edit.changes) {
        const updates: Record<string, any> = {};
        const changes = edit.changes as Record<string, any>;
        const colMap: Record<string, string> = {
          description: 'description',
          hours: 'hours',
          phone: 'phone',
          discount: 'discount',
          deal_price: 'deal_price',
          original_price: 'original_price',
          location: 'location',
          tags: 'tags',
          whatsapp_number: 'whatsapp_number',
          map_url: 'map_url',
          website: 'website',
          image: 'image',
          pricing_tiers: 'pricing_tiers',
        };
        for (const [k, v] of Object.entries(changes)) {
          const col = colMap[k] || k;
          if (v !== undefined) updates[col] = v;
        }
        if (Object.keys(updates).length > 0) {
          const { error: bizUpdErr } = await supabase
            .from('businesses')
            .update(updates)
            .eq('id', edit.business_id);
          if (bizUpdErr) {
            console.error('[manage-business] review_edit businesses update:', bizUpdErr);
            return errorResponse(req, bizUpdErr.message, 500);
          }
        }

        // Public deals read from business_offerings — mirror editable fields onto primary offering.
        const offeringPatch: Record<string, unknown> = {};
        if (changes.description !== undefined) {
          offeringPatch.description = changes.description;
          offeringPatch.description_fr = changes.description;
          offeringPatch.description_bi = changes.description;
        }
        if (changes.discount !== undefined) offeringPatch.discount = changes.discount;
        if (changes.original_price !== undefined) {
          offeringPatch.original_price = Number(changes.original_price) || 0;
        }
        if (changes.deal_price !== undefined) {
          offeringPatch.deal_price = Number(changes.deal_price) || 0;
        }
        if (changes.whatsapp_number !== undefined) {
          offeringPatch.whatsapp_number = changes.whatsapp_number;
        }
        if (changes.tags !== undefined) offeringPatch.tags = changes.tags;
        if (changes.map_url !== undefined) offeringPatch.map_url = changes.map_url;
        if (changes.website !== undefined) offeringPatch.website = changes.website;
        if (changes.image !== undefined) offeringPatch.image = changes.image;
        if (changes.pricing_tiers !== undefined) {
          offeringPatch.pricing_tiers = changes.pricing_tiers;
        }

        if (Object.keys(offeringPatch).length > 0) {
          offeringPatch.active = true;
          offeringPatch.updated_at = new Date().toISOString();
          const { data: primaryRows, error: offSelErr } = await supabase
            .from('business_offerings')
            .select('id')
            .eq('business_id', edit.business_id)
            .order('created_at', { ascending: true })
            .limit(1);
          if (offSelErr) {
            console.error('[manage-business] review_edit offering lookup:', offSelErr);
            return errorResponse(req, offSelErr.message, 500);
          }
          const oid = primaryRows?.[0]?.id as string | undefined;
          if (oid) {
            const { error: offErr } = await supabase
              .from('business_offerings')
              .update(offeringPatch)
              .eq('id', oid);
            if (offErr) {
              console.error('[manage-business] review_edit offering update:', offErr);
              return errorResponse(req, offErr.message, 500);
            }
          }
        }
      }

      return jsonResponse(req, { success: true });
    }

    // ─── UPDATE_BUSINESS ───
    if (action === 'update_business') {
      const businessId = body.businessId;
      const updates = body.updates || {};

      if (!businessId || Object.keys(updates).length === 0) {
        return errorResponse(req, 'Missing businessId or updates');
      }

      const denied = await assertAdminOrOwner(supabase, String(businessId), authUser.id, req);
      if (denied) return denied;

      const { error } = await supabase
        .from('businesses')
        .update(updates)
        .eq('id', businessId);

      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { success: true });
    }

    // ─── TOGGLE_ACTIVE ───
    if (action === 'toggle_active') {
      const businessId = body.businessId;
      const active = body.active;

      if (!businessId || active === undefined) return errorResponse(req, 'Missing businessId or active');

      const denied = await assertAdminOrOwner(supabase, String(businessId), authUser.id, req);
      if (denied) return denied;

      const { error } = await supabase
        .from('businesses')
        .update({ active })
        .eq('id', businessId);

      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { success: true });
    }

    // ─── RESPOND_TO_REVIEW ───
    if (action === 'respond_to_review') {
      const reviewId = body.reviewId;
      const businessId = body.businessId;
      const response = (body.response || '').trim();

      if (!reviewId || !businessId || !response) {
        return errorResponse(req, 'Missing reviewId, businessId, or response');
      }

      const { data: business, error: bizErr } = await supabase
        .from('businesses')
        .select('id, owner_id')
        .eq('id', businessId)
        .maybeSingle();
      if (bizErr || !business) {
        return errorResponse(req, 'Business not found', 404);
      }
      const reviewOwnerDenied = await requireOwner(supabase, String(businessId), authUser.id, req);
      if (reviewOwnerDenied) return reviewOwnerDenied;

      const { data: review, error: revErr } = await supabase
        .from('reviews')
        .select('id, business_id')
        .eq('id', reviewId)
        .maybeSingle();
      if (revErr || !review) {
        return errorResponse(req, 'Review not found', 404);
      }
      if (String(review.business_id) !== String(businessId)) {
        return errorResponse(req, 'Review does not belong to this business', 400);
      }

      const row = {
        review_id: reviewId,
        business_id: businessId,
        user_id: authUser.id,
        response,
      };

      const { error } = await supabase
        .from('review_responses')
        .upsert(row, { onConflict: 'review_id' });

      if (error) {
        console.error('[manage-business] respond_to_review upsert error:', error);
        return errorResponse(req, error.message, 500);
      }
      return jsonResponse(req, { success: true });
    }

    // ─── GET_ALL_PHOTOS ─── (admin only)
    if (action === 'get_all_photos') {
      const denied = await assertAdmin(supabase, authUser.id, req);
      if (denied) return denied;

      const { data, error } = await supabase
        .from('business_photos')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { photos: data || [] });
    }

    // ─── APPROVE_PHOTO / REJECT_PHOTO ─── (admin only)
    if (action === 'approve_photo' || action === 'reject_photo') {
      const photoId = body.photoId;
      if (!photoId) return errorResponse(req, 'Missing photoId');

      const denied = await assertAdmin(supabase, authUser.id, req);
      if (denied) return denied;

      const status = action === 'approve_photo' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('business_photos')
        .update({ status })
        .eq('id', photoId);

      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { success: true });
    }

    // ─── GET_ANALYTICS ───
    if (action === 'get_analytics') {
      const businessId = body.businessId;
      if (!businessId) return errorResponse(req, 'Missing businessId');

      const denied = await assertAdminOrOwner(supabase, String(businessId), authUser.id, req);
      if (denied) return denied;

      const { data: reviews } = await supabase
        .from('reviews')
        .select('id, rating, created_at')
        .eq('business_id', businessId);

      const { data: redemptions } = await supabase
        .from('redemptions')
        .select('id, created_at')
        .eq('business_id', businessId);

      return jsonResponse(req, {
        success: true,
        reviewCount: reviews?.length || 0,
        redemptionCount: redemptions?.length || 0,
        avgRating: reviews?.length
          ? reviews.reduce((s: number, r: any) => s + (r.rating || 0), 0) / reviews.length
          : 0,
      });
    }

    // ─── ADMIN_DELETE_USER ───
    if (action === 'admin_delete_user') {
      const targetUserId = body.targetUserId || body.userId;
      if (!targetUserId) return errorResponse(req, 'Missing targetUserId');

      const denied = await assertAdmin(supabase, authUser.id, req);
      if (denied) return denied;

      // Prevent deleting self
      if (targetUserId === authUser.id) {
        return errorResponse(req, 'Cannot delete your own account', 400);
      }

      // Remove listings so deals page does not keep orphaned profiles (service role bypasses RLS)
      const { error: bizDelErr } = await supabase.from('businesses').delete().eq('owner_id', targetUserId);
      if (bizDelErr) {
        console.error('[manage-business] admin_delete_user businesses:', bizDelErr);
        return errorResponse(req, 'Could not remove user listings: ' + bizDelErr.message, 500);
      }

      // Delete from auth.users via Admin API
      const { error: deleteErr } = await supabase.auth.admin.deleteUser(targetUserId);
      if (deleteErr) {
        console.error('[manage-business] admin_delete_user:', deleteErr);
        return errorResponse(req, deleteErr.message || 'Failed to delete user', 500);
      }

      return jsonResponse(req, { success: true });
    }

    return errorResponse(req, 'Unknown action: ' + action, 400);
  } catch (err) {
    console.error('[manage-business] error:', err);
    const msg = err instanceof Error ? err.message : String(err ?? 'Internal server error');
    return errorResponse(req, msg || 'Internal server error', 500);
  }
});

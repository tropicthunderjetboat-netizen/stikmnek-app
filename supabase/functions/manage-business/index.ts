// deno-lint-ignore-file no-explicit-any
/**
 * manage-business Edge Function
 * Handles business listing submission, admin review, edits, and related operations.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for secure database operations.
 *
 * Email (initial listing approval): requires SENDGRID_API_KEY (same as send-email / paypal-capture).
 * Optional: SENDGRID_FROM_EMAIL (default stikmnek@gmail.com if unset), SENDGRID_FROM_NAME, APP_BASE_URL (default https://stikmnek.com).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORIES = ['dining', 'accommodation', 'tours', 'activities', 'shopping', 'transport', 'services', 'other'];

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
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

/** Public app URL for deep links in transactional emails (no trailing slash). */
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

  const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'no-reply@stikmnek.com';
  const fromName = Deno.env.get('SENDGRID_FROM_NAME') || 'StikmNek';
  const subject = 'Congratulations! Your StikmNek Listing is Live!';

  const nameEsc = escapeHtmlEmail(params.businessName);
  const urlEsc = escapeHtmlEmail(params.listingUrl);
  const hashtagName = businessNameForHashtag(params.businessName);

  const socialBlockText =
    `🎉 Exciting News! We're officially live on StikmNek! 🌴\n\n` +
    `Find our amazing deals and discover the best of Vanuatu with us. Get ready to save on unique experiences!\n\n` +
    `Check out our StikmNek page here: ${params.listingUrl}\n\n` +
    `#StikmNek #VanuatuDeals #${hashtagName} #TravelVanuatu #SupportLocal`;

  const html = `
<div style="font-family: Arial, sans-serif; line-height: 1.55; color: #111; max-width: 560px;">
  <p style="margin: 0 0 12px;">Hi ${nameEsc},</p>
  <p style="margin: 0 0 12px;">Great news! Your listing on StikmNek is now live!</p>
  <p style="margin: 0 0 12px;">You can view it here: <a href="${urlEsc}">${urlEsc}</a></p>
  <p style="margin: 0 0 16px;">To celebrate, we&#39;ve prepared a special message for you to share with your audience on social media. Let your customers know they can now find you on StikmNek and start saving!</p>
  <p style="margin: 0 0 8px;"><img src="${escapeHtmlEmail(LISTING_LIVE_BADGE_URL)}" alt="StikmNek" width="120" style="display:block;border:0;" /></p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
  <p style="margin: 0 0 8px;"><strong>SOCIAL MEDIA POST SUGGESTION</strong></p>
  <p style="margin: 0 0 12px; white-space: pre-wrap;">${escapeHtmlEmail(socialBlockText)}</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
  <p style="margin: 0 0 12px;">Thank you for joining the StikmNek family. We're thrilled to have you!</p>
  <p style="margin: 0 0 4px;">Best regards,</p>
  <p style="margin: 0;">The StikmNek Team</p>
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
    '--- SOCIAL MEDIA POST SUGGESTION ---',
    '',
    socialBlockText,
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
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // SUPABASE_SERVICE_ROLE_KEY is a reserved secret in Supabase and is auto-injected at runtime.
    // Do not enforce arbitrary length checks here; just ensure it exists.
    if (!supabaseServiceKey) {
      console.error('[manage-business] SUPABASE_SERVICE_ROLE_KEY is missing');
      return errorResponse('Server configuration error: missing service role key', 500);
    }
    if (!supabaseUrl) {
      console.error('[manage-business] SUPABASE_URL is missing');
      return errorResponse('Server configuration error: missing Supabase URL', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return errorResponse('Invalid or expired session', 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (!action) {
      return errorResponse('Missing action');
    }

    // ─── HEALTH ───
    if (action === 'health') {
      return jsonResponse({ success: true });
    }

    // ─── LIST_CATEGORIES ───
    if (action === 'list_categories') {
      return jsonResponse({ categories: CATEGORIES });
    }

    // ─── SUBMIT_BUSINESS ───
    if (action === 'submit_business') {
      const userId = body.userId || authUser.id;
      if (!userId) return errorResponse('Missing userId');

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
        return errorResponse(error.message || 'Failed to submit business', 500);
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

      return jsonResponse({
        success: true,
        business: { id: pending.id, ...pending },
      });
    }

    // ─── RESUBMIT_PENDING_BUSINESS ───
    // Owner edits a rejected submission and resubmits for approval
    if (action === 'resubmit_pending_business') {
      try {
        const userId = body.userId || authUser.id;
        const pendingId = body.pendingId;
        if (!userId || !pendingId) return errorResponse('Missing userId or pendingId', 400);

        const { data: existing, error: fetchErr } = await supabase
          .from('pending_businesses')
          .select('*')
          .eq('id', pendingId)
          .eq('owner_id', userId)
          .single();

        if (fetchErr || !existing) return errorResponse('Submission not found or access denied', 404);
        if (existing.status !== 'rejected') return errorResponse('Only rejected submissions can be resubmitted', 400);

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
          return errorResponse('Resubmit failed: ' + updateErr.message, 500);
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
            return errorResponse('Resubmit succeeded but photo save failed: ' + insertErr.message, 500);
          }
        }

        return jsonResponse({ success: true, business: updated });
      } catch (err: any) {
        console.error('[manage-business] resubmit error:', err);
        return errorResponse('Resubmit failed: ' + (err?.message || String(err)), 500);
      }
    }

    // ─── GET_ALL_OWNER_DATA ───
    if (action === 'get_all_owner_data') {
      const userId = body.userId || authUser.id;
      if (!userId) return errorResponse('Missing userId');

      const [approvedRes, pendingRes] = await Promise.all([
        supabase.from('businesses').select('*').eq('owner_id', userId),
        supabase.from('pending_businesses').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
      ]);

      return jsonResponse({
        success: true,
        approved_businesses: approvedRes.data || [],
        pending_submissions: pendingRes.data || [],
      });
    }

    // ─── GET_OWNER_BUSINESSES ───
    if (action === 'get_owner_businesses') {
      const userId = body.userId || authUser.id;
      if (!userId) return errorResponse('Missing userId');

      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', userId);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ businesses: data || [] });
    }

    // ─── GET_PENDING ───
    if (action === 'get_pending') {
      const userId = body.userId || authUser.id;
      const isAdmin = body.isAdmin === true;

      if (isAdmin) {
        const { data, error } = await supabase
          .from('pending_businesses')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ businesses: data || [] });
      }

      if (!userId) return errorResponse('Missing userId');
      const { data, error } = await supabase
        .from('pending_businesses')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ businesses: data || [] });
    }

    // ─── GET_OWNER_OFFERINGS_LIVE ───
    // Join offerings + profiles using service role (avoids client RLS / PostgREST issues).
    if (action === 'get_owner_offerings_live') {
      const userId = body.userId || authUser.id;
      if (!userId) return errorResponse('Missing userId');
      if (String(userId) !== String(authUser.id)) {
        return errorResponse('Forbidden', 403);
      }
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
        return errorResponse(pErr.message, 500);
      }

      const plist = profiles || [];
      const profileIds = plist.map((p: { id: string }) => p.id).filter(Boolean);
      if (profileIds.length === 0) {
        return jsonResponse({ success: true, items: [] });
      }

      if (filterBusinessId && !profileIds.includes(filterBusinessId)) {
        return jsonResponse({ success: true, items: [] });
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
        return errorResponse(oErr.message, 500);
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

      return jsonResponse({ success: true, items });
    }

    // ─── ATTACH_PENDING_PHOTOS ───
    // Attach uploaded photo rows to an existing pending_businesses record.
    // Used after RPC insert_pending_business to guarantee business_photos rows are created server-side.
    if (action === 'attach_pending_photos') {
      const userId = body.userId || authUser.id;
      const pendingId = body.pendingId;
      const photos = Array.isArray(body.photos) ? body.photos : [];
      if (!userId || !pendingId) return errorResponse('Missing userId or pendingId', 400);
      if (photos.length === 0) return jsonResponse({ success: true, inserted: 0 });

      const { data: pending, error: pendingErr } = await supabase
        .from('pending_businesses')
        .select('id, owner_id')
        .eq('id', pendingId)
        .single();
      if (pendingErr || !pending) return errorResponse('Pending business not found', 404);
      if (String(pending.owner_id) !== String(userId)) return errorResponse('Access denied', 403);

      const validPhotos = photos.filter((p: any) => !!p?.url);
      if (validPhotos.length === 0) return jsonResponse({ success: true, inserted: 0 });

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
        return errorResponse('Failed to attach photos: ' + insertErr.message, 500);
      }
      return jsonResponse({ success: true, inserted: photoRecords.length });
    }

    // ─── GET_PENDING_EDITS ───
    if (action === 'get_pending_edits') {
      const userId = body.userId || authUser.id;
      const businessId = body.businessId;
      const isAdmin = body.isAdmin === true;

      if (isAdmin) {
        const { data, error } = await supabase
          .from('pending_edits')
          .select('*')
          .eq('status', 'pending')
          .order('submitted_at', { ascending: false });
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ edits: data || [] });
      }

      if (businessId) {
        const { data, error } = await supabase
          .from('pending_edits')
          .select('*')
          .eq('business_id', businessId)
          .eq('owner_id', userId)
          .order('submitted_at', { ascending: false });
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ edits: data || [] });
      }

      const { data, error } = await supabase
        .from('pending_edits')
        .select('*')
        .eq('owner_id', userId)
        .order('submitted_at', { ascending: false });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ edits: data || [] });
    }

    // ─── ADMIN_CREATE_BUSINESS ───
    if (action === 'admin_create_business') {
      const userId = body.userId || authUser.id;
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

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ business: data });
    }

    // ─── REVIEW_BUSINESS ───
    if (action === 'review_business') {
      const businessId = body.businessId; // This is the pending_business id
      const decision = body.decision; // 'approved' | 'rejected'
      const adminNotes = body.adminNotes || '';

      if (!businessId || !decision) return errorResponse('Missing businessId or decision');

      const { data: pending, error: fetchErr } = await supabase
        .from('pending_businesses')
        .select('*')
        .eq('id', businessId)
        .single();

      if (fetchErr || !pending) return errorResponse('Pending business not found', 404);

      const { error: updateErr } = await supabase
        .from('pending_businesses')
        .update({
          status: decision,
          admin_notes: adminNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', businessId);

      if (updateErr) return errorResponse(updateErr.message, 500);

      if (decision === 'approved') {
        const pendingRow = pending as Record<string, unknown>;
        const existingProfileId =
          pendingRow.business_id != null && String(pendingRow.business_id).trim() !== ''
            ? String(pendingRow.business_id)
            : null;
        /** First-time public listing only (pending had no `business_id`); skips re-approval / `review_edit` flows. */
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

        let liveBusinessId: string;

        if (existingProfileId) {
          const { data: prof, error: profErr } = await supabase
            .from('businesses')
            .select('id, owner_id')
            .eq('id', existingProfileId)
            .maybeSingle();

          if (profErr || !prof) {
            return errorResponse('Invalid business_id on pending row (profile not found)', 400);
          }
          if (String(prof.owner_id) !== String(pending.owner_id)) {
            return errorResponse('Invalid business_id on pending row (owner mismatch)', 403);
          }

          const vEmail = (pending.email && String(pending.email).trim()) || null;
          const profileUpdate: Record<string, unknown> = {
            category: pending.category || 'dining',
            description: vDesc,
            description_fr: vDesc,
            description_bi: vDesc,
            image: pending.image || '',
            discount: pending.discount || '',
            original_price: Number(pending.original_price) || 0,
            deal_price: Number(pending.deal_price) || 0,
            location: pending.location || '',
            phone: pending.phone || '',
            hours: pending.hours || '',
            map_url: pending.map_url ?? null,
            website: pending.website ?? null,
            discount_valid_from: pending.discount_valid_from ?? null,
            discount_valid_until: pending.discount_valid_until ?? null,
            whatsapp_number: pending.whatsapp_number ?? null,
            pricing_tiers: pending.pricing_tiers ?? null,
            tags: tagArray,
            email: vEmail,
            contact_email: vEmail,
            business_email: vEmail,
            active: true,
            updated_at: new Date().toISOString(),
          };
          const trimmedName = pending.name != null ? String(pending.name).trim() : '';
          if (trimmedName) profileUpdate.name = trimmedName;

          const { error: profUpdErr } = await supabase
            .from('businesses')
            .update(profileUpdate)
            .eq('id', existingProfileId);

          if (profUpdErr) {
            console.error('[manage-business] Failed to sync businesses row on re-approve:', profUpdErr);
            return errorResponse(
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
            return errorResponse(offSelErr.message, 500);
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
                'Approved but failed to create live offering: ' + offInsErr.message,
                500,
              );
            }
          }

          liveBusinessId = existingProfileId;
        } else {
          const bizRecord = {
            owner_id: pending.owner_id,
            name: pending.name,
            category: pending.category,
            description: pending.description,
            discount: pending.discount || '',
            original_price: Number(pending.original_price) || 0,
            deal_price: Number(pending.deal_price) || 0,
            location: pending.location || '',
            phone: pending.phone || '',
            hours: pending.hours || '',
            image: pending.image || '',
            map_url: pending.map_url || null,
            website: pending.website || null,
            discount_valid_from: pending.discount_valid_from || null,
            discount_valid_until: pending.discount_valid_until || null,
            whatsapp_number: pending.whatsapp_number || null,
            pricing_tiers: pending.pricing_tiers ?? null,
          };

          const { data: newBiz, error: insertErr } = await supabase
            .from('businesses')
            .insert(bizRecord)
            .select()
            .single();

          if (insertErr) {
            console.error('[manage-business] Failed to create businesses record:', insertErr);
            return errorResponse('Approved but failed to create business record: ' + insertErr.message, 500);
          }

          liveBusinessId = newBiz.id as string;

          const { error: offInsErr } = await supabase.from('business_offerings').insert({
            business_id: liveBusinessId,
            ...offeringFields,
            featured: false,
          });
          if (offInsErr) {
            console.warn('[manage-business] businesses created but offering insert failed:', offInsErr);
          }
        }

        const { error: rejErr } = await supabase
          .from('business_photos')
          .update({ business_id: liveBusinessId })
          .eq('business_id', businessId)
          .eq('status', 'rejected');

        if (rejErr) {
          console.error('[manage-business] Photo update (rejected) failed after business approval:', rejErr);
          return errorResponse(
            'Business approved but rejected photos could not be relinked. Error: ' + rejErr.message,
            500
          );
        }

        const { error: photoErr } = await supabase
          .from('business_photos')
          .update({ business_id: liveBusinessId, status: 'approved' })
          .eq('business_id', businessId);

        if (photoErr) {
          console.error('[manage-business] Photo update failed after business approval:', photoErr);
          return errorResponse(
            'Business approved but photos could not be updated. Please manually approve photos for this business. Error: ' + photoErr.message,
            500
          );
        }

        // ─── Listing live email (SendGrid): initial approval only — new `businesses` row, not linked re-review ───
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
              '[manage-business] Initial listing-live email skipped: no email for owner',
              String(pending.owner_id),
            );
          }
        }
      }

      return jsonResponse({ success: true });
    }

    // ─── DELETE_OWN_BUSINESS (owner only; photos + storage + row) ───
    if (action === 'delete_own_business') {
      const businessId = body.businessId;
      if (!businessId) return errorResponse('Missing businessId');

      const { data: bizRow, error: fetchErr } = await supabase
        .from('businesses')
        .select('id, owner_id, name')
        .eq('id', businessId)
        .maybeSingle();

      if (fetchErr || !bizRow) {
        return errorResponse('Business not found', 404);
      }
      if (!bizRow.owner_id || String(bizRow.owner_id) !== String(authUser.id)) {
        return errorResponse('You can only delete your own listings', 403);
      }

      const purge = await purgeBusinessPhotosAndStorage(supabase, businessId);
      if (purge.error) {
        return errorResponse(purge.error, 500);
      }

      const { error: delErr } = await supabase
        .from('businesses')
        .delete()
        .eq('id', businessId)
        .eq('owner_id', authUser.id);

      if (delErr) {
        console.error('[manage-business] delete_own_business:', delErr);
        return errorResponse(delErr.message || 'Failed to delete listing', 500);
      }

      console.log('[manage-business] delete_own_business OK:', businessId, bizRow.name);
      return jsonResponse({ success: true, deletedName: bizRow.name });
    }

    // ─── ADMIN_DELETE_BUSINESS ───
    if (action === 'admin_delete_business') {
      const businessId = body.businessId;
      if (!businessId) return errorResponse('Missing businessId');

      const { data: adminProfile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (adminProfile?.role !== 'admin') {
        return errorResponse('Admin access required', 403);
      }

      const purge = await purgeBusinessPhotosAndStorage(supabase, businessId);
      if (purge.error) {
        return errorResponse(purge.error, 500);
      }

      const { error } = await supabase.from('businesses').delete().eq('id', businessId);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    // ─── SUBMIT_EDIT ───
    if (action === 'submit_edit') {
      const userId = body.userId || authUser.id;
      const businessId = body.businessId;
      const changes = body.changes || {};

      if (!userId || !businessId || Object.keys(changes).length === 0) {
        return errorResponse('Missing userId, businessId, or changes');
      }

      // Check for existing pending edit
      const { data: existing } = await supabase
        .from('pending_edits')
        .select('id, changes')
        .eq('business_id', businessId)
        .eq('owner_id', userId)
        .eq('status', 'pending')
        .single();

      if (existing) {
        const mergedChanges = { ...(existing.changes as object || {}), ...changes };
        const { error } = await supabase
          .from('pending_edits')
          .update({ changes: mergedChanges })
          .eq('id', existing.id);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ success: true, updated: true });
      }

      const { error } = await supabase
        .from('pending_edits')
        .insert({
          business_id: businessId,
          owner_id: userId,
          changes,
          status: 'pending',
        });

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    // ─── REVIEW_EDIT ───
    if (action === 'review_edit') {
      const editId = body.editId;
      const decision = body.decision; // 'approved' | 'rejected'
      const adminNotes = body.adminNotes || '';

      if (!editId || !decision) return errorResponse('Missing editId or decision');

      const { data: edit, error: fetchErr } = await supabase
        .from('pending_edits')
        .select('*')
        .eq('id', editId)
        .single();

      if (fetchErr || !edit) return errorResponse('Pending edit not found', 404);

      const { error: updateErr } = await supabase
        .from('pending_edits')
        .update({
          status: decision,
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', editId);

      if (updateErr) return errorResponse(updateErr.message, 500);

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
            return errorResponse(bizUpdErr.message, 500);
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
            return errorResponse(offSelErr.message, 500);
          }
          const oid = primaryRows?.[0]?.id as string | undefined;
          if (oid) {
            const { error: offErr } = await supabase
              .from('business_offerings')
              .update(offeringPatch)
              .eq('id', oid);
            if (offErr) {
              console.error('[manage-business] review_edit offering update:', offErr);
              return errorResponse(offErr.message, 500);
            }
          }
        }
      }

      return jsonResponse({ success: true });
    }

    // ─── UPDATE_BUSINESS ───
    if (action === 'update_business') {
      const businessId = body.businessId;
      const updates = body.updates || {};

      if (!businessId || Object.keys(updates).length === 0) {
        return errorResponse('Missing businessId or updates');
      }

      const { error } = await supabase
        .from('businesses')
        .update(updates)
        .eq('id', businessId);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    // ─── TOGGLE_ACTIVE ───
    if (action === 'toggle_active') {
      const businessId = body.businessId;
      const active = body.active;

      if (!businessId || active === undefined) return errorResponse('Missing businessId or active');

      const { error } = await supabase
        .from('businesses')
        .update({ active })
        .eq('id', businessId);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    // ─── RESPOND_TO_REVIEW ───
    if (action === 'respond_to_review') {
      const reviewId = body.reviewId;
      const businessId = body.businessId;
      const response = (body.response || '').trim();

      if (!reviewId || !businessId || !response) {
        return errorResponse('Missing reviewId, businessId, or response');
      }

      const { data: business, error: bizErr } = await supabase
        .from('businesses')
        .select('id, owner_id')
        .eq('id', businessId)
        .maybeSingle();
      if (bizErr || !business) {
        return errorResponse('Business not found', 404);
      }
      if (String(business.owner_id) !== String(authUser.id)) {
        return errorResponse('Only the business owner can respond to reviews', 403);
      }

      const { data: review, error: revErr } = await supabase
        .from('reviews')
        .select('id, business_id')
        .eq('id', reviewId)
        .maybeSingle();
      if (revErr || !review) {
        return errorResponse('Review not found', 404);
      }
      if (String(review.business_id) !== String(businessId)) {
        return errorResponse('Review does not belong to this business', 400);
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
        return errorResponse(error.message, 500);
      }
      return jsonResponse({ success: true });
    }

    // ─── GET_ALL_PHOTOS ─── (admin only)
    if (action === 'get_all_photos') {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', authUser.id)
        .single();
      if (profile?.role !== 'admin') return errorResponse('Admin access required', 403);

      const { data, error } = await supabase
        .from('business_photos')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ photos: data || [] });
    }

    // ─── APPROVE_PHOTO / REJECT_PHOTO ─── (admin only)
    if (action === 'approve_photo' || action === 'reject_photo') {
      const photoId = body.photoId;
      if (!photoId) return errorResponse('Missing photoId');

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', authUser.id)
        .single();
      if (profile?.role !== 'admin') return errorResponse('Admin access required', 403);

      const status = action === 'approve_photo' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('business_photos')
        .update({ status })
        .eq('id', photoId);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    // ─── GET_ANALYTICS ───
    if (action === 'get_analytics') {
      const businessId = body.businessId;
      if (!businessId) return errorResponse('Missing businessId');

      const { data: reviews } = await supabase
        .from('reviews')
        .select('id, rating, created_at')
        .eq('business_id', businessId);

      const { data: redemptions } = await supabase
        .from('redemptions')
        .select('id, created_at')
        .eq('business_id', businessId);

      return jsonResponse({
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
      if (!targetUserId) return errorResponse('Missing targetUserId');

      // Verify caller is admin
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', authUser.id)
        .single();
      if (profile?.role !== 'admin') {
        return errorResponse('Admin access required', 403);
      }

      // Prevent deleting self
      if (targetUserId === authUser.id) {
        return errorResponse('Cannot delete your own account', 400);
      }

      // Delete from auth.users via Admin API
      const { error: deleteErr } = await supabase.auth.admin.deleteUser(targetUserId);
      if (deleteErr) {
        console.error('[manage-business] admin_delete_user:', deleteErr);
        return errorResponse(deleteErr.message || 'Failed to delete user', 500);
      }

      return jsonResponse({ success: true });
    }

    return errorResponse('Unknown action: ' + action, 400);
  } catch (err) {
    console.error('[manage-business] error:', err);
    return errorResponse((err as Error).message, 500);
  }
});

// deno-lint-ignore-file no-explicit-any
/**
 * manage-business Edge Function
 * Handles business listing submission, admin review, edits, and related operations.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for secure database operations.
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

        // Move gallery rows to the live business. Preserve admin rejections — only non-rejected
        // rows become approved (matches review_pending_business RPC).
        const { error: rejErr } = await supabase
          .from('business_photos')
          .update({ business_id: newBiz.id })
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
          .update({ business_id: newBiz.id, status: 'approved' })
          .eq('business_id', businessId);

        if (photoErr) {
          console.error('[manage-business] Photo update failed after business approval:', photoErr);
          return errorResponse(
            'Business approved but photos could not be updated. Please manually approve photos for this business. Error: ' + photoErr.message,
            500
          );
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
        };
        for (const [k, v] of Object.entries(changes)) {
          const col = colMap[k] || k;
          if (v !== undefined) updates[col] = v;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('businesses').update(updates).eq('id', edit.business_id);
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

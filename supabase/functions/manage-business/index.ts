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

    // CRITICAL: Service role key must be set — Supabase auto-injects it for Edge Functions.
    // If empty, the client would not bypass RLS. Check Edge Functions → manage-business → Secrets.
    if (!supabaseServiceKey || supabaseServiceKey.length < 50) {
      console.error('[manage-business] SUPABASE_SERVICE_ROLE_KEY is missing or invalid');
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

    // ─── GET_ALL_OWNER_DATA ───
    if (action === 'get_all_owner_data') {
      const userId = body.userId || authUser.id;
      if (!userId) return errorResponse('Missing userId');

      const [approvedRes, pendingRes] = await Promise.all([
        supabase.from('businesses').select('*').eq('owner_id', userId).eq('active', true),
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

        // Update business_photos: change business_id from pending id to new business id for approved photos
        await supabase
          .from('business_photos')
          .update({ business_id: newBiz.id })
          .eq('business_id', businessId);
      }

      return jsonResponse({ success: true });
    }

    // ─── ADMIN_DELETE_BUSINESS ───
    if (action === 'admin_delete_business') {
      const businessId = body.businessId;
      if (!businessId) return errorResponse('Missing businessId');

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
      const response = body.response || '';

      if (!reviewId || !businessId || !response.trim()) {
        return errorResponse('Missing reviewId, businessId, or response');
      }

      const { error } = await supabase
        .from('review_responses')
        .insert({
          review_id: reviewId,
          business_id: businessId,
          user_id: authUser.id,
          response: response.trim(),
        });

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    // ─── GET_ALL_PHOTOS ───
    if (action === 'get_all_photos') {
      const { data, error } = await supabase
        .from('business_photos')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ photos: data || [] });
    }

    // ─── APPROVE_PHOTO / REJECT_PHOTO ───
    if (action === 'approve_photo' || action === 'reject_photo') {
      const photoId = body.photoId;
      if (!photoId) return errorResponse('Missing photoId');

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

    // ─── ADMIN_DELETE_USER (stub - complex operation) ───
    if (action === 'admin_delete_user') {
      return errorResponse('admin_delete_user not implemented in this function', 501);
    }

    return errorResponse('Unknown action: ' + action, 400);
  } catch (err) {
    console.error('[manage-business] error:', err);
    return errorResponse((err as Error).message, 500);
  }
});

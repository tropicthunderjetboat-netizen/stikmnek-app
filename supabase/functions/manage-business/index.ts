// deno-lint-ignore-file no-explicit-any
/**
 * manage-business Edge Function
 * Handles business listing submission, admin review, edits, and related operations.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for secure database operations.
 *
 * Email (initial listing approval): requires SENDGRID_API_KEY (same as send-email / paypal-capture).
 * Optional: SENDGRID_FROM_EMAIL (default stikmnek@gmail.com if unset), SENDGRID_FROM_NAME, APP_BASE_URL (default https://www.stikmnek.com).
 * CORS: set CORS_ALLOWED_ORIGINS (comma-separated origins) in Edge Function secrets.
 * If unset, Access-Control-Allow-Origin is *. If set, request Origin must match an entry (see getSafeCorsHeaders).
 *
 * DEPLOY (important): This file imports `../_shared/cors.ts` and `./purge-user.ts`. Pasting only this file
 * into the Supabase Dashboard does NOT update those modules — CORS fixes will not apply and the bundle can break.
 * From the repo root run: `npm run functions:deploy:manage-business` (or `supabase functions deploy manage-business`).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';
import { purgePublicDataForAuthUser } from './purge-user.ts';

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

/** Keeps Edge/PostgREST JSON payloads bounded (TEXT columns are large; huge HTML still slows requests). */
const PENDING_DESCRIPTION_MAX_CHARS = 120_000;
function trimPendingDescription(input: unknown): string {
  const s = String(input ?? '');
  return s.length <= PENDING_DESCRIPTION_MAX_CHARS ? s : s.slice(0, PENDING_DESCRIPTION_MAX_CHARS);
}

type DbErrorShape = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;
function dbErrorForLog(err: DbErrorShape): Record<string, unknown> | null {
  if (!err) return null;
  return {
    message: typeof err.message === 'string' ? err.message : String(err.message ?? ''),
    code: typeof err.code === 'string' ? err.code : null,
    details: typeof err.details === 'string' ? err.details : null,
    hint: typeof err.hint === 'string' ? err.hint : null,
  };
}

function truncateForLog(value: unknown, max = 400): string {
  const s = String(value ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… (${s.length} chars)`;
}

/** Safe logging view: strips huge HTML/base64 and only logs photo keys. */
function payloadForLog(body: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body };
  if (typeof next.description === 'string') next.description = truncateForLog(next.description, 800);
  if (typeof next.fileBase64 === 'string') next.fileBase64 = '[omitted]';
  if (Array.isArray(next.photos)) {
    next.photos = (next.photos as Record<string, unknown>[]).map((p) => ({
      url: typeof p?.url === 'string' ? truncateForLog(p.url, 160) : p?.url,
      filePath: typeof p?.filePath === 'string' ? truncateForLog(p.filePath, 160) : p?.filePath,
      isMain: p?.isMain,
    }));
  }
  return next;
}

/**
 * Robust pending photo attachment across schema variants.
 *
 * `business_photos` has had multiple schemas:
 * - Legacy: `business_id` (uuid NOT NULL), and some deployments stored `pending_businesses.id` there.
 * - Current: XOR parent (`business_id` OR `pending_id`) with FKs and a CHECK (see 20260421140000).
 *
 * This function:
 * - Deletes existing pending rows using the best available key
 * - Inserts with `pending_id` when supported
 * - Falls back to legacy `business_id = pendingId` when needed
 */
async function replacePendingBusinessPhotos(args: {
  supabase: SupabaseServiceClient;
  pendingId: string;
  userId: string;
  photos: Array<{ url?: string; filePath?: string | null; isMain?: boolean | null }>;
  /** When set, include structured logs + return diagnostics in `meta`. */
  debugLabel?: string;
}): Promise<{
  inserted: number;
  mode: 'pending_id' | 'legacy_business_id';
  warnings: string[];
  meta: Record<string, unknown>;
  error: { message: string } | null;
}> {
  const pendingId = String(args.pendingId || '').trim();
  const userId = String(args.userId || '').trim();
  const warnings: string[] = [];
  const meta: Record<string, unknown> = {};
  const label = args.debugLabel ? `[manage-business][photos][${args.debugLabel}]` : '[manage-business][photos]';
  if (!pendingId || !userId) {
    if (args.debugLabel) console.log(label, 'skip: missing pendingId or userId');
    return { inserted: 0, mode: 'pending_id', warnings, meta, error: null };
  }

  const valid = (args.photos || []).filter((p) => typeof p?.url === 'string' && p.url.trim());
  if (valid.length === 0) {
    if (args.debugLabel) console.log(label, 'skip: no valid photos');
    return { inserted: 0, mode: 'pending_id', warnings, meta, error: null };
  }

  meta.photoCount = valid.length;

  // Best-effort delete; ignore schema mismatches.
  // Delete any prior photo rows for this submission under BOTH key styles:
  // - current schema: `pending_id = pending_businesses.id`
  // - legacy schema: some deployments stored `pending_businesses.id` in `business_id`
  if (args.debugLabel) console.log(label, 'delete existing (pending_id or legacy business_id)', { pendingId });
  const delByPending = await args.supabase
    .from('business_photos')
    .delete()
    .or(`pending_id.eq.${pendingId},business_id.eq.${pendingId},submission_pending_id.eq.${pendingId}`);
  if (delByPending.error && String(delByPending.error.message || '').toLowerCase().includes('pending_id')) {
    warnings.push('pending_id column not available (legacy schema) — falling back to business_id cleanup');
    if (args.debugLabel) console.log(label, 'delete fallback (business_id)', { pendingId, err: delByPending.error.message });
    await args.supabase.from('business_photos').delete().eq('business_id', pendingId);
  }

  // Preferred (current) schema.
  const preferred = valid.map((p, i) => ({
    pending_id: pendingId,
    url: String(p.url || '').trim(),
    file_path: p.filePath ?? null,
    uploaded_by: userId,
    is_main: p.isMain ?? i === 0,
    status: 'pending',
  }));
  if (args.debugLabel) console.log(label, 'insert attempt (pending_id)', { pendingId, count: preferred.length });
  const prefRes = await args.supabase.from('business_photos').insert(preferred);
  if (!prefRes.error) {
    meta.insertMethod = 'pending_id';
    return { inserted: preferred.length, mode: 'pending_id', warnings, meta, error: null };
  }

  const msg = String(prefRes.error.message || '');
  const lower = msg.toLowerCase();
  const noPendingIdColumn =
    lower.includes('pending_id') && (lower.includes('does not exist') || lower.includes('column'));
  const businessIdNotNull =
    lower.includes('null value in column') && lower.includes('business_id') && lower.includes('not-null');

  // Legacy fallback.
  if (noPendingIdColumn || businessIdNotNull) {
    if (noPendingIdColumn) warnings.push('pending_id insert failed (missing column) — using legacy business_id = pendingId');
    if (businessIdNotNull) warnings.push('pending_id insert failed (business_id NOT NULL) — using legacy business_id = pendingId');
    if (args.debugLabel) console.log(label, 'insert fallback (legacy business_id)', { pendingId, err: msg });
    const legacy = valid.map((p, i) => ({
      business_id: pendingId,
      url: String(p.url || '').trim(),
      file_path: p.filePath ?? null,
      uploaded_by: userId,
      is_main: p.isMain ?? i === 0,
      status: 'pending',
    }));
    const legacyRes = await args.supabase.from('business_photos').insert(legacy);
    if (!legacyRes.error) {
      meta.insertMethod = 'legacy_business_id';
      return { inserted: legacy.length, mode: 'legacy_business_id', warnings, meta, error: null };
    }
    const legacyMsg = String(legacyRes.error.message || msg);
    if (args.debugLabel) console.log(label, 'insert fallback failed', { pendingId, err: legacyMsg });
    meta.insertMethod = 'legacy_business_id';
    return { inserted: 0, mode: 'legacy_business_id', warnings, meta, error: { message: legacyMsg } };
  }

  if (args.debugLabel) console.log(label, 'insert failed (no fallback matched)', { pendingId, err: msg });
  meta.insertMethod = 'pending_id';
  return { inserted: 0, mode: 'pending_id', warnings, meta, error: { message: msg || 'Failed to attach pending photos' } };
}

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

// Keep in sync with frontend admin allowlist (AppContext.tsx) for build mode.
const ADMIN_EMAILS = ['admin@stikmnek.com', 'testadmin@example.com', 'stikmnek@gmail.com'];

async function isAdminUser(supabase: SupabaseServiceClient, userId: string, email?: string): Promise<boolean> {
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) return true;
  const { data } = await supabase
    .from('user_profiles')
    .select('role, user_type')
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data && (data.role === 'admin' || (data as any).user_type === 'admin'));
}

/** Returns a 403 Response if the user is not an admin; otherwise null. */
async function assertAdmin(
  supabase: SupabaseServiceClient,
  authUser: { id: string; email?: string },
  req: Request,
): Promise<Response | null> {
  if (!(await isAdminUser(supabase, authUser.id, authUser.email))) {
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
  authUser: { id: string; email?: string },
  req: Request,
): Promise<Response | null> {
  if (await isAdminUser(supabase, authUser.id, authUser.email)) return null;
  return requireOwner(supabase, businessId, authUser.id, req);
}

/**
 * Applies edit payload to `businesses` + `business_offerings` (same shape as `pending_edits.changes`).
 * Optional `_target_offering_id` scopes the offering row; otherwise the oldest offering for the profile is used.
 */
async function applyListingEditChangesToLive(
  supabase: SupabaseServiceClient,
  businessId: string,
  rawChanges: Record<string, any>,
): Promise<{ error: string | null }> {
  const targetOfferingId = String(rawChanges._target_offering_id || '').trim();
  const changes = { ...rawChanges };
  delete changes._target_offering_id;

  /** `business_offerings.title` — not a `businesses` column. */
  const titleForOffering =
    changes.title !== undefined ? String(changes.title ?? '').trim() || 'Offer' : undefined;
  delete (changes as { title?: unknown }).title;

  /** When editing a specific deal, listing category tabs read `business_offerings.tags` first. */
  let tagsForOfferingOnly: unknown = undefined;
  if (targetOfferingId && changes.tags !== undefined) {
    tagsForOfferingOnly = changes.tags;
    delete (changes as { tags?: unknown }).tags;
  }

  if (changes.description !== undefined) {
    changes.description = trimPendingDescription(changes.description);
  }

  const updates: Record<string, any> = {};
  const colMap: Record<string, string> = {
    description: 'description',
    hours: 'hours',
    phone: 'phone',
    email: 'email',
    contact_email: 'contact_email',
    business_email: 'business_email',
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
    category: 'category',
  };
  for (const [k, v] of Object.entries(changes)) {
    if (k.startsWith('_')) continue;
    const col = colMap[k] || k;
    if (v !== undefined) updates[col] = v;
  }
  if (Object.keys(updates).length > 0) {
    const { error: bizUpdErr } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', businessId);
    if (bizUpdErr) {
      console.error('[manage-business] applyListingEditChangesToLive businesses:', bizUpdErr);
      return { error: bizUpdErr.message };
    }
  }

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
  if (titleForOffering !== undefined) {
    offeringPatch.title = titleForOffering;
  }
  if (tagsForOfferingOnly !== undefined) {
    offeringPatch.tags = tagsForOfferingOnly;
  }
  if (changes.discount_valid_from !== undefined) {
    offeringPatch.discount_valid_from = changes.discount_valid_from;
  }
  if (changes.discount_valid_until !== undefined) {
    offeringPatch.discount_valid_until = changes.discount_valid_until;
  }

  if (Object.keys(offeringPatch).length > 0) {
    offeringPatch.active = true;
    offeringPatch.updated_at = new Date().toISOString();
    let oid: string | undefined;
    if (targetOfferingId) {
      const { data: ownRow, error: ownErr } = await supabase
        .from('business_offerings')
        .select('id')
        .eq('id', targetOfferingId)
        .eq('business_id', businessId)
        .maybeSingle();
      if (ownErr) {
        console.error('[manage-business] applyListingEditChangesToLive offering by id:', ownErr);
        return { error: ownErr.message };
      }
      if (ownRow?.id) oid = String(ownRow.id);
    }
    if (!oid) {
      const { data: primaryRows, error: offSelErr } = await supabase
        .from('business_offerings')
        .select('id')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })
        .limit(1);
      if (offSelErr) {
        console.error('[manage-business] applyListingEditChangesToLive offering lookup:', offSelErr);
        return { error: offSelErr.message };
      }
      oid = primaryRows?.[0]?.id as string | undefined;
    }
    if (oid) {
      const { error: offErr } = await supabase
        .from('business_offerings')
        .update(offeringPatch)
        .eq('id', oid);
      if (offErr) {
        console.error('[manage-business] applyListingEditChangesToLive offering update:', offErr);
        return { error: offErr.message };
      }
    }
  }

  return { error: null };
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
  const raw = (Deno.env.get('APP_BASE_URL') || 'https://www.stikmnek.com').trim();
  return raw.replace(/\/+$/, '');
}

const LISTING_LIVE_BADGE_URL = 'https://www.stikmnek.com/images/stikmnek-badge.png';

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

const DECISION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * SendGrid: short admin decision notice (matches legacy `send-email` send_business_decision copy).
 * Best-effort only — never throws.
 */
async function sendAdminDecisionNotificationEmail(params: {
  toEmail: string;
  businessName: string;
  decision: 'approved' | 'rejected';
  adminNotes: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY');
  if (!apiKey) {
    console.warn('[manage-business] SENDGRID_API_KEY not set — skipping admin decision email');
    return { sent: false, skipped: true, error: 'SENDGRID_API_KEY not set' };
  }
  const emailStr = String(params.toEmail ?? '').trim();
  if (!emailStr || !DECISION_EMAIL_RE.test(emailStr)) {
    return { sent: false, error: 'Invalid recipient' };
  }

  const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'no-reply@stikmnek.com';
  const fromName = Deno.env.get('SENDGRID_FROM_NAME') || 'StikmNek';
  const subjectName = String(params.businessName ?? '').replace(/[\r\n\x00]/g, ' ').trim().slice(0, 200);
  const subject = params.decision === 'approved'
    ? `Your business "${subjectName}" has been approved!`
    : `Update on your business "${subjectName}" listing`;
  const safeBusinessName = escapeHtmlEmail(params.businessName);
  const notesBlock = params.adminNotes
    ? `<p><strong>Admin note:</strong> ${escapeHtmlEmail(params.adminNotes)}</p>`
    : '';
  const html = params.decision === 'approved'
    ? `<p>Congratulations! Your business listing "${safeBusinessName}" has been approved and is now live on StikmNek.</p>${notesBlock}`
    : `<p>Your business listing "${safeBusinessName}" was not approved at this time.</p>${notesBlock}<p>Please contact support if you have questions.</p>`;

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: emailStr }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[manage-business] SendGrid decision email FAILED:', res.status, errText);
      return { sent: false, error: `SendGrid error: ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[manage-business] SendGrid decision email fetch error:', msg);
    return { sent: false, error: msg };
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startMs = Date.now();
  console.log('[manage-business] request start', {
    requestId,
    method: req.method,
    url: req.url,
  });
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
    const debug = Boolean((body as Record<string, unknown>)?.debug);

    if (!action) {
      console.error('[manage-business] missing action', { requestId, userId: authUser.id });
      return errorResponse(req, 'Missing action', 400, { requestId, reason: 'missing_action' });
    }

    if (debug || action === 'resubmit_pending_business') {
      console.log('[manage-business] action begin', {
        requestId,
        action,
        userId: authUser.id,
        email: authUser.email ?? null,
        debug,
        payload: payloadForLog(body as Record<string, unknown>),
      });
    }

    // ─── HEALTH ───
    if (action === 'health') {
      return jsonResponse(req, { success: true });
    }

    // ─── LIST_CATEGORIES ───
    if (action === 'list_categories') {
      return jsonResponse(req, { categories: CATEGORIES });
    }

    // ─── DIAGNOSE_BUSINESS_PHOTOS ─── (admin only)
    // Provides a safe, non-destructive schema compatibility report for `business_photos`.
    if (action === 'diagnose_business_photos') {
      const denied = await assertAdmin(supabase, authUser, req);
      if (denied) return denied;

      const report: Record<string, unknown> = {
        success: true,
        now: new Date().toISOString(),
        checks: {},
        warnings: [] as string[],
      };

      // 1) pending_id column existence check (via PostgREST select)
      const pendingIdProbe = await supabase.from('business_photos').select('pending_id').limit(1);
      (report.checks as any).pending_id_column = pendingIdProbe.error ? false : true;
      if (pendingIdProbe.error) {
        const msg = String(pendingIdProbe.error.message || '');
        (report.checks as any).pending_id_probe_error = msg;
        if (msg.toLowerCase().includes('pending_id')) {
          (report.warnings as string[]).push('`pending_id` column not available (legacy business_photos schema).');
        }
      }

      // 2) business_id column existence check
      const businessIdProbe = await supabase.from('business_photos').select('business_id').limit(1);
      (report.checks as any).business_id_column = businessIdProbe.error ? false : true;
      if (businessIdProbe.error) {
        (report.checks as any).business_id_probe_error = String(businessIdProbe.error.message || '');
      }

      // 3) pending_id FK sanity: optional check for a caller-provided pendingId
      const pendingId = String(body?.pendingId ?? body?.pending_id ?? '').trim();
      if (pendingId) {
        const exists = await supabase
          .from('pending_businesses')
          .select('id')
          .eq('id', pendingId)
          .maybeSingle();
        (report.checks as any).pending_businesses_row_exists = Boolean(exists.data?.id);
        if (exists.error) (report.checks as any).pending_businesses_row_error = exists.error.message;
      }

      return jsonResponse(req, report);
    }

    // ─── SUBMIT_BUSINESS ───
    // Always INSERT a new pending_businesses row (multiple listings per owner). No upsert / in-place update here.
    if (action === 'submit_business') {
      const userId = authUser.id;

      const rawBusinessId = body.businessId ?? body.business_id ?? null;
      let linkedBusinessId: string | null = null;
      if (rawBusinessId != null && String(rawBusinessId).trim()) {
        const bid = String(rawBusinessId).trim();
        const { data: owned, error: ownErr } = await supabase
          .from('businesses')
          .select('id')
          .eq('id', bid)
          .eq('owner_id', userId)
          .maybeSingle();
        if (ownErr || !owned?.id) {
          console.error('[manage-business] submit_business invalid businessId for owner:', {
            bid,
            userId,
            ownErr: ownErr?.message,
          });
          return errorResponse(req, 'business_id must belong to the authenticated owner', 400, {
            reason: 'invalid_business_id',
          });
        }
        linkedBusinessId = bid;
      }

      const description = trimPendingDescription(body.description);
      const recordFields = {
        name: String(body.name || '').trim() || 'Untitled',
        category: body.category || 'dining',
        description,
        discount: body.discount || '',
        original_price: Number(body.originalPrice) || 0,
        deal_price: Number(body.dealPrice) || 0,
        location: body.location || 'Port Vila, Vanuatu',
        phone: body.phone || '',
        email: body.email || '',
        hours: body.hours || '',
        image: String(body.image || ''),
        map_url: body.mapUrl ?? body.map_url ?? null,
        website: body.website || null,
        discount_valid_from: body.discountValidFrom ?? body.discount_valid_from ?? null,
        discount_valid_until: body.discountValidUntil ?? body.discount_valid_until ?? null,
        whatsapp_number: body.whatsappNumber ?? body.whatsapp_number ?? null,
        pricing_tiers: body.pricingTiers ?? body.pricing_tiers ?? null,
        business_id: linkedBusinessId,
      };

      const attachPhotosForPending = async (pendingRowId: string) => {
        const photos = Array.isArray(body.photos) ? body.photos : [];
        const { error, mode, warnings, meta } = await replacePendingBusinessPhotos({
          supabase,
          pendingId: pendingRowId,
          userId,
          photos,
          debugLabel: body?.debug ? 'submit_business' : undefined,
        });
        if (body?.debug) {
          console.log('[manage-business][photos][submit_business] result', { pendingRowId, mode, warnings, meta });
        }
        return error ? ({ message: error.message } as any) : null;
      };

      const record = {
        owner_id: userId,
        ...recordFields,
        status: 'pending' as const,
      };

      const { data: pending, error } = await supabase
        .from('pending_businesses')
        .insert(record)
        .select()
        .single();

      if (error) {
        console.error('[manage-business] submit_business insert error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        return errorResponse(req, error.message || 'Failed to submit business', 500, {
          reason: 'pending_businesses_insert',
          code: error.code ?? null,
        });
      }

      const photosErr = pending?.id ? await attachPhotosForPending(pending.id) : null;
      if (photosErr) {
        console.error('[manage-business] submit_business business_photos insert:', photosErr);
        return errorResponse(
          req,
          'Listing saved but photo rows failed: ' + photosErr.message,
          500,
          { reason: 'business_photos_insert', pendingId: pending?.id },
        );
      }

      return jsonResponse(req, {
        success: true,
        business: { id: pending.id, ...pending },
      });
    }

    // ─── WITHDRAW_PENDING_SUBMISSION (owner: remove stuck / unwanted pending or rejected row) ───
    // Uses service-role client `supabase` below (RLS bypass). Caller identity is verified via JWT → authUser.
    if (action === 'withdraw_pending_submission') {
      const pendingId = body.pendingId ?? body.pending_id;
      if (!pendingId) return errorResponse(req, 'Missing pendingId', 400);

      const { data: row, error: fetchErr } = await supabase
        .from('pending_businesses')
        .select('id, owner_id, status, business_id, name')
        .eq('id', pendingId)
        .maybeSingle();

      if (fetchErr || !row) {
        return errorResponse(req, 'Submission not found', 404);
      }
      if (String(row.owner_id) !== String(authUser.id)) {
        return errorResponse(req, 'Access denied', 403);
      }
      // Owner may remove any pending_businesses row (including status=approved) to clear stuck dashboard rows.

      // Deactivate only the offering created for this submission: same `business_id` + `title` as on approve
      // (see offeringFields.title in this file — trimmed pending name, or literal "Main offer" when name is empty).
      const linkedBusinessId = row.business_id != null ? String(row.business_id).trim() : '';
      if (linkedBusinessId) {
        const pendingNameTrimmed = String(row.name ?? '').trim();
        const offeringTitle = pendingNameTrimmed || 'Main offer';
        const { error: deactivateErr } = await supabase
          .from('business_offerings')
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq('business_id', linkedBusinessId)
          .eq('title', offeringTitle);

        if (deactivateErr) {
          console.error(
            '[manage-business] withdraw_pending_submission: deactivate business_offerings failed:',
            deactivateErr,
          );
          return errorResponse(
            req,
            deactivateErr.message || 'Could not remove listing from public deals',
            500,
            { reason: 'deactivate_offering_failed' },
          );
        }
      }

      // Best-effort cleanup across schema variants (ignore legacy differences).
      const delByPending = await supabase.from('business_photos').delete().eq('pending_id', String(pendingId));
      if (delByPending.error && String(delByPending.error.message || '').toLowerCase().includes('pending_id')) {
        await supabase.from('business_photos').delete().eq('business_id', String(pendingId));
      }
      const { error: delErr } = await supabase
        .from('pending_businesses')
        .delete()
        .eq('id', pendingId)
        .eq('owner_id', authUser.id);

      if (delErr) {
        console.error('[manage-business] withdraw_pending_submission:', delErr);
        return errorResponse(req, delErr.message || 'Failed to withdraw submission', 500);
      }

      return jsonResponse(req, { success: true });
    }

    // ─── RESUBMIT_PENDING_BUSINESS ───
    // Owner edits a rejected submission and resubmits for approval
    if (action === 'resubmit_pending_business') {
      try {
        const userId = authUser.id;
        const pendingId = body.pendingId;
        if (!pendingId) return errorResponse(req, 'Missing pendingId', 400, { requestId, action, reason: 'missing_pending_id' });

        const { data: existing, error: fetchErr } = await supabase
          .from('pending_businesses')
          .select('*')
          .eq('id', pendingId)
          .eq('owner_id', userId)
          .single();

        if (fetchErr || !existing) {
          console.error('[manage-business][resubmit] fetch pending row failed', {
            requestId,
            pendingId,
            userId,
            err: dbErrorForLog(fetchErr as any),
          });
          return errorResponse(req, 'Submission not found or access denied', 404, {
            requestId,
            action,
            reason: 'pending_not_found_or_denied',
            ...(debug ? { dbError: dbErrorForLog(fetchErr as any) } : {}),
          });
        }
        if (existing.status !== 'rejected') {
          return errorResponse(req, 'Only rejected submissions can be resubmitted', 400, {
            requestId,
            action,
            reason: 'invalid_status',
            status: existing.status,
          });
        }

        const diag: Record<string, unknown> = {};
        if (debug) {
          const missing: string[] = [];
          const name = String(body.name ?? existing.name ?? '').trim();
          const category = String(body.category ?? existing.category ?? '').trim();
          const desc = String(body.description ?? existing.description ?? '').trim();
          const image = String(body.image ?? existing.image ?? '').trim();
          if (!name) missing.push('name');
          if (!category) missing.push('category');
          if (!desc) missing.push('description');
          if (!image) missing.push('image');

          const photosRaw = Array.isArray(body.photos) ? (body.photos as any[]) : [];
          const ready = photosRaw.filter((p) => typeof p?.url === 'string' && String(p.url).trim());
          const noFilePath = ready.filter((p) => !p?.filePath || !String(p.filePath).trim()).length;
          diag.requiredMissing = missing;
          diag.photos = { provided: photosRaw.length, withUrl: ready.length, missingFilePath: noFilePath };
          if (missing.length > 0) {
            diag.warning =
              'Some required fields are missing/empty. Client-side validation should prevent this; check payload construction.';
          }
        }

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
          return errorResponse(req, 'Resubmit failed: ' + updateErr.message, 500, {
            requestId,
            action,
            reason: 'pending_update_failed',
            ...(debug ? { dbError: dbErrorForLog(updateErr as any), diag } : {}),
          });
        }

        const photos = Array.isArray(body.photos) ? body.photos : [];
        if (photos.length > 0) {
          const { error: photoErr, mode, warnings, meta } = await replacePendingBusinessPhotos({
            supabase,
            pendingId: String(pendingId),
            userId,
            photos,
            debugLabel: body?.debug ? 'resubmit_pending_business' : undefined,
          });
          if (photoErr) {
            console.error('[manage-business] resubmit photo insert error:', photoErr);
            return errorResponse(req, 'Resubmit succeeded but photo save failed: ' + photoErr.message, 500, {
              requestId,
              action,
              reason: 'photo_attach_failed',
              ...(debug ? { attachment: { mode, warnings, meta }, diag } : {}),
            });
          }
          if (body?.debug) {
            console.log('[manage-business][photos][resubmit_pending_business] result', {
              pendingId,
              mode,
              warnings,
              meta,
            });
          }
        }

        if (debug) {
          console.log('[manage-business][resubmit] success', {
            requestId,
            pendingId,
            userId,
            elapsedMs: Date.now() - startMs,
          });
        }
        return jsonResponse(req, { success: true, business: updated, ...(debug ? { requestId, diag } : {}) });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error('[manage-business][resubmit] unexpected error', {
          requestId,
          message: msg,
          stack: typeof err?.stack === 'string' ? err.stack : null,
        });
        return errorResponse(req, 'Resubmit failed: ' + msg, 500, {
          requestId,
          action,
          reason: 'unexpected_exception',
          ...(debug ? { stack: typeof err?.stack === 'string' ? err.stack : null } : {}),
        });
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

      const { inserted, error: photoErr, mode, warnings, meta } = await replacePendingBusinessPhotos({
        supabase,
        pendingId: String(pendingId),
        userId,
        photos: validPhotos,
        debugLabel: body?.debug ? 'attach_pending_photos' : undefined,
      });
      if (photoErr) {
        console.error('[manage-business] attach_pending_photos insert error:', photoErr);
        return errorResponse(req, 'Failed to attach photos: ' + photoErr.message, 500);
      }
      if (body?.debug) {
        console.log('[manage-business][photos][attach_pending_photos] result', { pendingId, inserted, mode, warnings, meta });
      }
      return jsonResponse(req, {
        success: true,
        inserted,
        ...(body?.debug ? { attachment: { mode, warnings, meta } } : {}),
      });
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
      const denied = await assertAdmin(supabase, authUser, req);
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
      const denied = await assertAdmin(supabase, authUser, req);
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

        const rejectListingName =
          (pending.name != null && String(pending.name).trim()) || 'Your listing';
        const rejectEmailRaw = (pending.email && String(pending.email).trim()) || '';
        if (rejectEmailRaw && DECISION_EMAIL_RE.test(rejectEmailRaw)) {
          const sg = await sendAdminDecisionNotificationEmail({
            toEmail: rejectEmailRaw,
            businessName: rejectListingName,
            decision: 'rejected',
            adminNotes: String(adminNotes || '').trim() || 'No additional notes.',
          });
          if (!sg.sent) {
            console.warn('[manage-business] Rejection notice email:', sg.skipped ? 'skipped' : sg.error ?? 'failed');
          }
        }

        return jsonResponse(req, { success: true });
      }

      // ─── approved: master stub on `businesses`, rich listing on `business_offerings`, then remove pending row ───
      const pendingRow = pending as Record<string, unknown>;
      const existingProfileId =
        pendingRow.business_id != null && String(pendingRow.business_id).trim() !== ''
          ? String(pendingRow.business_id)
          : null;
      const isInitialNewBusinessApproval = existingProfileId == null;
      let newOfferingId: string | null = null;

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

        // Additional listing on an existing profile: do NOT overwrite `businesses` with this
        // pending row (name/category/location would replace the master profile and hide other deals).
        // Listing copy lives only on `business_offerings`; profile fields are edited in the dashboard.

        // New listing on an existing profile: always INSERT a row. Updating the "primary"
        // offering overwrote the owner's previous approved deals (only the last one appeared).
        const { data: insertedOff, error: offInsErr } = await supabase
          .from('business_offerings')
          .insert({
            business_id: existingProfileId,
            ...offeringFields,
            featured: false,
          })
          .select('id')
          .single();
        if (offInsErr) {
          console.error('[manage-business] Failed to insert business_offerings (existing profile):', offInsErr);
          return errorResponse(
            req,
            'Approved but failed to create live offering: ' + offInsErr.message,
            500,
          );
        }
        if (insertedOff?.id) newOfferingId = String(insertedOff.id);

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

        const { data: insertedOff, error: offInsErr } = await supabase
          .from('business_offerings')
          .insert({
            business_id: liveBusinessId,
            ...offeringFields,
            featured: false,
          })
          .select('id')
          .single();
        if (offInsErr) {
          console.error('[manage-business] Offering insert failed after stub insert:', offInsErr);
          return errorResponse(
            req,
            'Approved but failed to create live offering: ' + offInsErr.message,
            500,
          );
        }
        if (insertedOff?.id) newOfferingId = String(insertedOff.id);
      }

      // Support both schema variants:
      // - current: `pending_id` links photos to a moderation submission
      // - legacy: some deployments stored `pending_businesses.id` in `business_id`
      // - `submission_pending_id` keeps the same pending uuid after `pending_id` is cleared on approve
      //   (still matchable in a single UPDATE before the pending row is deleted).
      const pendingPhotoMatch = `pending_id.eq.${pendingId},business_id.eq.${pendingId},submission_pending_id.eq.${pendingId}`;

      const { error: rejErr } = await supabase
        .from('business_photos')
        .update({ business_id: liveBusinessId, pending_id: null })
        .or(pendingPhotoMatch)
        .eq('status', 'rejected');

      if (rejErr) {
        console.error('[manage-business] Photo update (rejected) failed after business approval:', rejErr);
        return errorResponse(
          req,
          'Business approved but rejected photos could not be relinked. Error: ' + rejErr.message,
          500,
        );
      }

      const approvedPhotoPatch: Record<string, unknown> = {
        business_id: liveBusinessId,
        pending_id: null,
        status: 'approved',
      };
      if (newOfferingId) approvedPhotoPatch.offering_id = newOfferingId;

      const { error: photoErr } = await supabase
        .from('business_photos')
        .update(approvedPhotoPatch)
        .or(pendingPhotoMatch)
        .neq('status', 'rejected');

      if (photoErr) {
        console.error('[manage-business] Photo update failed after business approval:', photoErr);
        return errorResponse(
          req,
          'Business approved but photos could not be updated. Please manually approve photos for this business. Error: ' + photoErr.message,
          500,
        );
      }

      if (!isInitialNewBusinessApproval) {
        const listingTitle =
          (pending.name != null && String(pending.name).trim()) || 'Your listing';
        const toExtra =
          vEmail && DECISION_EMAIL_RE.test(vEmail)
            ? vEmail
            : await resolveOwnerNotificationEmail(supabase, String(pending.owner_id));
        if (toExtra) {
          const sgExtra = await sendAdminDecisionNotificationEmail({
            toEmail: toExtra,
            businessName: listingTitle,
            decision: 'approved',
            adminNotes: String(adminNotes || '').trim() || 'No additional notes.',
          });
          if (!sgExtra.sent) {
            console.warn(
              '[manage-business] Additional-listing approval email:',
              sgExtra.skipped ? 'skipped' : sgExtra.error ?? 'failed',
            );
          }
        }
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

    // ─── REPAIR_APPROVED_SUBMISSION ───
    // Admin-only: some legacy approval paths set pending_businesses.status='approved' without
    // creating a new business_offerings row (or overwrote the primary one). This repairs by
    // inserting a fresh offering row and relinking photos, then deletes the stuck pending row.
    if (action === 'repair_approved_submission') {
      const denied = await assertAdmin(supabase, authUser, req);
      if (denied) return denied;

      const pendingId = body.pendingId ?? body.pending_id ?? body.businessId;
      if (!pendingId) return errorResponse(req, 'Missing pendingId', 400);

      const { data: pending, error: fetchErr } = await supabase
        .from('pending_businesses')
        .select('*')
        .eq('id', String(pendingId))
        .maybeSingle();

      if (fetchErr || !pending) return errorResponse(req, 'Pending business not found', 404);
      if (String((pending as any).status) !== 'approved') {
        return errorResponse(req, 'Repair requires status=approved', 400);
      }

      const profileIdRaw = (pending as any).business_id;
      const existingProfileId =
        profileIdRaw != null && String(profileIdRaw).trim() !== '' ? String(profileIdRaw).trim() : null;
      if (!existingProfileId) {
        return errorResponse(req, 'Repair requires a linked profile business_id', 400);
      }

      const { data: prof, error: profErr } = await supabase
        .from('businesses')
        .select('id, owner_id')
        .eq('id', existingProfileId)
        .maybeSingle();
      if (profErr || !prof) {
        return errorResponse(req, 'Invalid business_id on pending row (profile not found)', 400);
      }
      if (String((prof as any).owner_id) !== String((pending as any).owner_id)) {
        return errorResponse(req, 'Invalid business_id on pending row (owner mismatch)', 403);
      }

      const vDesc = String((pending as any).description ?? '');
      const tagArray = [String((pending as any).category || 'dining')];
      const offeringFields = {
        title: (((pending as any).name && String((pending as any).name).trim()) || 'Main offer') as string,
        description: vDesc,
        description_fr: vDesc,
        description_bi: vDesc,
        discount: (pending as any).discount || '',
        original_price: Number((pending as any).original_price) || 0,
        deal_price: Number((pending as any).deal_price) || 0,
        image: (pending as any).image || '',
        map_url: (pending as any).map_url ?? null,
        website: (pending as any).website ?? null,
        discount_valid_from: (pending as any).discount_valid_from ?? null,
        discount_valid_until: (pending as any).discount_valid_until ?? null,
        whatsapp_number: (pending as any).whatsapp_number ?? null,
        pricing_tiers: (pending as any).pricing_tiers ?? null,
        tags: tagArray,
        active: true,
        featured: false,
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error: offInsErr } = await supabase
        .from('business_offerings')
        .insert({ business_id: existingProfileId, ...offeringFields })
        .select('id')
        .maybeSingle();
      if (offInsErr) {
        console.error('[manage-business] repair_approved_submission offering insert:', offInsErr);
        return errorResponse(req, 'Failed to create live offering: ' + offInsErr.message, 500);
      }

      // Relink photos that were uploaded against the pending id (common when the pending row never got deleted).
      const relinkPatch: Record<string, unknown> = {
        business_id: existingProfileId,
        pending_id: null,
        status: 'approved',
      };
      if (inserted?.id) relinkPatch.offering_id = String(inserted.id);

      const pid = String(pendingId);
      const relinkMatch = `pending_id.eq.${pid},submission_pending_id.eq.${pid},business_id.eq.${pid}`;
      const { error: relinkErr } = await supabase.from('business_photos').update(relinkPatch).or(relinkMatch);
      if (relinkErr) {
        console.error('[manage-business] repair_approved_submission photos:', relinkErr);
        // Non-fatal: offering exists; return success but warn
      }

      const { error: delErr } = await supabase
        .from('pending_businesses')
        .delete()
        .eq('id', String(pendingId));
      if (delErr) {
        console.error('[manage-business] repair_approved_submission delete pending:', delErr);
        return errorResponse(req, 'Repaired offering but could not delete pending row: ' + delErr.message, 500);
      }

      return jsonResponse(req, { success: true, offeringId: inserted?.id ?? null });
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
    // Two modes (admin must never wipe a whole profile by accident):
    // 1) Default: `offeringId` (+ optional `businessId` for sanity) — deletes ONE `business_offerings` row only.
    //    The `businesses` profile stays (even when this was the last offer) so other admin actions / owner
    //    data are not destroyed; use mode (2) to remove an empty profile if needed.
    // 2) Full removal: `businessId` + `confirmDeleteEntireProfile: true` — purge photos + delete `businesses`
    //    (CASCADE removes all offers for that profile).
    if (action === 'admin_delete_business') {
      const businessIdRaw = body.businessId != null ? String(body.businessId).trim() : '';
      const offeringIdRaw = body.offeringId != null ? String(body.offeringId).trim() : '';
      const confirmEntire =
        body.confirmDeleteEntireProfile === true || body.confirmDeleteEntireProfile === 'true';

      const denied = await assertAdmin(supabase, authUser, req);
      if (denied) return denied;

      if (confirmEntire) {
        if (!businessIdRaw) {
          return errorResponse(req, 'Missing businessId for full profile delete', 400);
        }
        const purge = await purgeBusinessPhotosAndStorage(supabase, businessIdRaw);
        if (purge.error) {
          return errorResponse(req, purge.error, 500);
        }
        const { data: deletedAdmin, error } = await supabase
          .from('businesses')
          .delete()
          .eq('id', businessIdRaw)
          .select('id');
        if (error) return errorResponse(req, error.message, 500);
        if (!deletedAdmin?.length) {
          return errorResponse(req, 'No matching business profile to delete.', 404);
        }
        return jsonResponse(req, { success: true, deletedEntireProfile: true });
      }

      if (!offeringIdRaw) {
        return errorResponse(
          req,
          'Pass offeringId to remove a single deal from the directory, or pass businessId with confirmDeleteEntireProfile: true to delete the whole business and all deals.',
          400,
        );
      }

      const { data: offRow, error: offErr } = await supabase
        .from('business_offerings')
        .select('id, business_id')
        .eq('id', offeringIdRaw)
        .maybeSingle();
      if (offErr) return errorResponse(req, offErr.message, 500);
      if (!offRow) {
        return jsonResponse(req, { success: true, message: 'Offering already removed' });
      }
      const profileId = String(offRow.business_id);
      if (businessIdRaw && profileId !== businessIdRaw) {
        return errorResponse(req, 'offeringId does not match businessId', 400);
      }

      const { error: delOffErr } = await supabase
        .from('business_offerings')
        .delete()
        .eq('id', offeringIdRaw);
      if (delOffErr) return errorResponse(req, delOffErr.message, 500);

      const { data: remaining, error: remErr } = await supabase
        .from('business_offerings')
        .select('id')
        .eq('business_id', profileId);
      if (remErr) return errorResponse(req, remErr.message, 500);
      const remLen = remaining?.length ?? 0;
      const onlyDealOnProfile =
        body.onlyDealOnProfile === true || body.onlyDealOnProfile === 'true';

      // Single-deal businesses: removing the only offer should remove the profile too (no invisible orphan).
      if (remLen === 0 && onlyDealOnProfile) {
        const purge = await purgeBusinessPhotosAndStorage(supabase, profileId);
        if (purge.error) {
          return errorResponse(req, purge.error, 500);
        }
        const { data: delBiz, error: delBizErr } = await supabase
          .from('businesses')
          .delete()
          .eq('id', profileId)
          .select('id');
        if (delBizErr) return errorResponse(req, delBizErr.message, 500);
        if (!delBiz?.length) {
          return errorResponse(req, 'Offer removed but business profile was not found to delete.', 404);
        }
        return jsonResponse(req, {
          success: true,
          profileId,
          remainingOfferings: 0,
          lastDealRemoved: true,
          removedProfileAsEmpty: true,
        });
      }

      return jsonResponse(req, {
        success: true,
        profileId,
        remainingOfferings: remLen,
        lastDealRemoved: remLen === 0,
      });
    }

    // ─── SUBMIT_EDIT ───
    if (action === 'submit_edit') {
      const userId = authUser.id;
      const businessId = body.businessId;
      const rawChanges = body.changes || {};
      const offeringIdBody =
        body.offeringId != null && String(body.offeringId).trim() !== ''
          ? String(body.offeringId).trim()
          : '';
      const changes: Record<string, unknown> = { ...rawChanges };
      if (offeringIdBody) {
        changes._target_offering_id = offeringIdBody;
      }

      if (!businessId || Object.keys(changes).length === 0) {
        return errorResponse(req, 'Missing businessId or changes');
      }

      const denied = await assertAdminOrOwner(supabase, String(businessId), authUser, req);
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

      // Owner edits apply immediately (public reads `business_offerings`). Remove stale queue rows.
      await supabase
        .from('pending_edits')
        .delete()
        .eq('business_id', businessId)
        .eq('owner_id', ownerIdForEdit)
        .eq('status', 'pending');

      const applyRes = await applyListingEditChangesToLive(
        supabase,
        String(businessId),
        changes as Record<string, any>,
      );
      if (applyRes.error) {
        return errorResponse(req, applyRes.error, 500);
      }
      return jsonResponse(req, { success: true, appliedLive: true });
    }

    // ─── REVIEW_EDIT ───
    if (action === 'review_edit') {
      const denied = await assertAdmin(supabase, authUser, req);
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
        const applyRes = await applyListingEditChangesToLive(
          supabase,
          String(edit.business_id),
          edit.changes as Record<string, any>,
        );
        if (applyRes.error) {
          return errorResponse(req, applyRes.error, 500);
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

      const denied = await assertAdminOrOwner(supabase, String(businessId), authUser, req);
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

      const denied = await assertAdminOrOwner(supabase, String(businessId), authUser, req);
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

    // ─── ADMIN_LIST_REVIEWS ─── (admin only)
    if (action === 'admin_list_reviews') {
      const denied = await assertAdmin(supabase, authUser, req);
      if (denied) return denied;

      const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
      const { data, error } = await supabase
        .from('reviews')
        .select(
          [
            'id',
            'business_id',
            'offering_id',
            'user_name',
            'rating',
            'comment',
            'created_at',
            'has_super_star',
            'is_public',
            'moderated_at',
            'moderated_by',
            'moderation_reason',
            // joins (when FK exists)
            'businesses(name)',
            'business_offerings(title)',
          ].join(','),
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { reviews: data || [] });
    }

    // ─── ADMIN_SET_REVIEW_PUBLIC ─── (admin only)
    if (action === 'admin_set_review_public') {
      const denied = await assertAdmin(supabase, authUser, req);
      if (denied) return denied;
      const reviewId = String(body.reviewId || '').trim();
      const isPublic = body.isPublic;
      const reason = String(body.reason || '').trim();
      if (!reviewId || typeof isPublic !== 'boolean') {
        return errorResponse(req, 'Missing reviewId or isPublic');
      }
      const updates: Record<string, unknown> = {
        is_public: isPublic,
        moderated_at: new Date().toISOString(),
        moderated_by: authUser.id,
        moderation_reason: reason || null,
      };
      const { error } = await supabase.from('reviews').update(updates).eq('id', reviewId);
      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { success: true });
    }

    // ─── ADMIN_DELETE_REVIEW ─── (admin only)
    if (action === 'admin_delete_review') {
      const denied = await assertAdmin(supabase, authUser, req);
      if (denied) return denied;
      const reviewId = String(body.reviewId || '').trim();
      if (!reviewId) return errorResponse(req, 'Missing reviewId');
      const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
      if (error) return errorResponse(req, error.message, 500);
      return jsonResponse(req, { success: true });
    }

    // ─── GET_ALL_PHOTOS ─── (admin only)
    if (action === 'get_all_photos') {
      const denied = await assertAdmin(supabase, authUser, req);
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

      const denied = await assertAdmin(supabase, authUser, req);
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

      const denied = await assertAdminOrOwner(supabase, String(businessId), authUser, req);
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

      const denied = await assertAdmin(supabase, authUser, req);
      if (denied) return denied;

      // Prevent deleting self
      if (targetUserId === authUser.id) {
        return errorResponse(req, 'Cannot delete your own account', 400);
      }

      await purgePublicDataForAuthUser(supabase, targetUserId);

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
    const msg = err instanceof Error ? err.message : String(err ?? 'Internal server error');
    console.error('[manage-business] error', {
      requestId,
      message: msg,
      stack: err instanceof Error ? err.stack : null,
      elapsedMs: Date.now() - startMs,
    });
    return errorResponse(req, msg || 'Internal server error', 500, {
      requestId,
      reason: 'top_level_exception',
    });
  }
});

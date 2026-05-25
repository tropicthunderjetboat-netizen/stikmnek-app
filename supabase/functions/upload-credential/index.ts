// deno-lint-ignore-file no-explicit-any
/**
 * upload-credential — private business documents (PDF/images) in business-credentials bucket.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BEARER_PREFIX = /^Bearer\s+/i;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

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
  base['Access-Control-Allow-Origin'] = allowed.includes(origin) ? origin : allowed[0]!;
  return base;
}

Deno.serve(async (req) => {
  const corsHeaders = getSafeCorsHeaders(req);
  const jsonResponse = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  const errorResponse = (message: string, status = 400) =>
    jsonResponse({ success: false, error: message }, status);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing Authorization header', 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseServiceKey) return errorResponse('Server configuration error', 500);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace(BEARER_PREFIX, '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return errorResponse('Invalid or expired session', 401);

    const body = await req.json().catch(() => ({}));
    const { fileBase64, fileName, contentType, userId, businessId } = body;
    const uid = userId || user.id;

    if (!fileBase64) return errorResponse('Missing fileBase64');
    if (!businessId) return errorResponse('Missing businessId');

    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .maybeSingle();
    if (bizErr || !biz) return errorResponse('Business not found', 404);

    const { data: prof } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    const isAdmin = prof?.role === 'admin';
    if (!isAdmin && String(biz.owner_id) !== String(user.id)) {
      return errorResponse('Not authorized for this business', 403);
    }

    const base64Data = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
    let binary: Uint8Array;
    try {
      binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    } catch {
      return errorResponse('Invalid base64 data', 400);
    }
    if (binary.length > MAX_BYTES) return errorResponse('File too large (max 10 MB)', 400);

    const mime = String(contentType || 'application/pdf').toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) {
      return errorResponse('File type not allowed. Use PDF, JPEG, PNG, or WebP.', 400);
    }

    const ext = (fileName || 'document.pdf').split('.').pop() || 'pdf';
    const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'pdf';
    const filePath = `${uid}/${businessId}/${crypto.randomUUID()}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from('business-credentials')
      .upload(filePath, binary, {
        contentType: mime,
        upsert: false,
      });

    if (uploadErr) {
      console.error('[upload-credential] Storage error:', uploadErr);
      return errorResponse(uploadErr.message || 'Upload failed', 500);
    }

    return jsonResponse({
      success: true,
      filePath,
      url: null,
    });
  } catch (err) {
    console.error('[upload-credential] error:', err);
    return errorResponse((err as Error).message, 500);
  }
});

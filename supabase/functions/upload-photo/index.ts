// deno-lint-ignore-file no-explicit-any
/**
 * upload-photo Edge Function
 * Uploads business photos to Supabase Storage (business-photos bucket).
 * Returns public URL and file path for storing in business_photos.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * CORS: set CORS_ALLOWED_ORIGINS (comma-separated). If unset, Allow-Origin is *.
 */
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
  const errorResponse = (message: string, status = 400) => jsonResponse({ success: false, error: message }, status);

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
    if (!supabaseServiceKey) {
      return errorResponse('Server configuration error', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Invalid or expired session', 401);
    }

    const body = await req.json().catch(() => ({}));
    const { fileBase64, fileName, contentType, userId } = body;
    const uid = userId || user.id;

    if (!fileBase64) {
      return errorResponse('Missing fileBase64');
    }

    // Decode base64 to Uint8Array
    const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, '');
    const binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const ext = (fileName || 'image.jpg').split('.').pop() || 'jpg';
    const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
    const filePath = `${uid}/${crypto.randomUUID()}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from('business-photos')
      .upload(filePath, binary, {
        contentType: contentType || 'image/jpeg',
        upsert: false,
      });

    if (uploadErr) {
      console.error('[upload-photo] Storage error:', uploadErr);
      return errorResponse(uploadErr.message || 'Upload failed', 500);
    }

    const { data: urlData } = supabase.storage.from('business-photos').getPublicUrl(filePath);
    const url = urlData.publicUrl;

    return jsonResponse({
      url,
      filePath,
      success: true,
    });
  } catch (err) {
    console.error('[upload-photo] error:', err);
    return errorResponse((err as Error).message, 500);
  }
});

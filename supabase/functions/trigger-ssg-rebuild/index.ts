/**
 * trigger-ssg-rebuild — called by Supabase Database Webhooks on
 * `business_offerings` / `businesses` changes, then POSTs the Vercel Deploy Hook
 * so build-time static pages regenerate.
 *
 * Secrets (supabase secrets set):
 *   VERCEL_DEPLOY_HOOK_URL  — Vercel project Deploy Hook URL
 *   SSG_REBUILD_SECRET      — shared secret; Database Webhook must send
 *                             header `x-ssg-rebuild-secret: <value>`
 *
 * Database Webhook setup (Dashboard → Database → Webhooks), or apply the
 * migration that creates pg_net triggers once vault secrets are set:
 *   - Tables: business_offerings, businesses
 *   - Events: INSERT, UPDATE, DELETE
 *   - URL: https://<project-ref>.supabase.co/functions/v1/trigger-ssg-rebuild
 *   - HTTP Headers: Content-Type: application/json
 *                   x-ssg-rebuild-secret: <SSG_REBUILD_SECRET>
 */
import { getSafeCorsHeaders } from '../_shared/cors.ts';

function json(req: Request, data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getSafeCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function assertSecret(req: Request): boolean {
  const expected = (Deno.env.get('SSG_REBUILD_SECRET') ?? '').trim();
  if (!expected) return false;
  const header = (req.headers.get('x-ssg-rebuild-secret') ?? '').trim();
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return header === expected || auth === expected;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json(req, { success: false, error: 'Method not allowed' }, 405);
  }
  if (!assertSecret(req)) {
    return json(req, { success: false, error: 'Unauthorized' }, 401);
  }

  const hookUrl = (Deno.env.get('VERCEL_DEPLOY_HOOK_URL') ?? '').trim();
  if (!hookUrl) {
    return json(req, { success: false, error: 'VERCEL_DEPLOY_HOOK_URL not configured' }, 500);
  }

  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  try {
    const hookRes = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'stikmnek-ssg-rebuild',
        receivedAt: new Date().toISOString(),
        supabase: payload,
      }),
    });
    const text = await hookRes.text().catch(() => '');
    if (!hookRes.ok) {
      console.error('[trigger-ssg-rebuild] Deploy hook failed', hookRes.status, text.slice(0, 300));
      return json(
        req,
        { success: false, error: 'Deploy hook request failed', status: hookRes.status },
        502,
      );
    }
    console.log('[trigger-ssg-rebuild] Deploy hook OK', hookRes.status);
    return json(req, { success: true, deployHookStatus: hookRes.status });
  } catch (err) {
    console.error('[trigger-ssg-rebuild] Error', err);
    return json(req, { success: false, error: 'Failed to call deploy hook' }, 500);
  }
});

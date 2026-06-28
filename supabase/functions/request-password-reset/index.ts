// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';
import { getResendApiKey, parseResendErrorMessage, sendResendEmail } from '../_shared/resend.ts';

/**
 * request-password-reset Edge Function (PUBLIC — verify_jwt = false)
 *
 * Why this exists:
 *   Supabase's native `auth.resetPasswordForEmail` sends through Supabase's own
 *   SMTP/mailer, which is failing on this project (HTTP 500 "Error sending recovery
 *   email"). The rest of the app sends transactional mail via Resend, which works.
 *   This function generates the recovery link with the service role (no SMTP) and
 *   delivers it via Resend, so password recovery no longer depends on Supabase email.
 *
 * Request body: { email: string, redirectTo?: string }
 * Response: always { success: true } for valid input (no account enumeration).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
 *          APP_BASE_URL (default https://www.stikmnek.com).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(req: Request, data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getSafeCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function getAppBaseUrl(): string {
  const raw = (Deno.env.get('APP_BASE_URL') || 'https://www.stikmnek.com').trim();
  return raw.replace(/\/+$/, '');
}

/**
 * Only honor a client-provided redirect when it points at a host we trust
 * (localhost dev, *.stikmnek.com, or *.vercel.app) and the path is /reset-password.
 * Otherwise fall back to the server's APP_BASE_URL. Prevents open-redirect abuse.
 */
function resolveRedirectTo(rawRedirect: unknown): string {
  const fallback = `${getAppBaseUrl()}/reset-password`;
  const candidate = String(rawRedirect ?? '').trim();
  if (!candidate) return fallback;
  try {
    const u = new URL(candidate);
    const host = u.hostname.toLowerCase();
    const trustedHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === 'stikmnek.com' ||
      host.endsWith('.stikmnek.com') ||
      host.endsWith('.vercel.app');
    const okPath = u.pathname.replace(/\/+$/, '') === '/reset-password';
    if (trustedHost && (u.protocol === 'http:' || u.protocol === 'https:')) {
      // Force the canonical reset path even if the caller sent a different one.
      return okPath ? candidate.split('#')[0] : `${u.origin}/reset-password`;
    }
  } catch {
    /* fall through to fallback */
  }
  return fallback;
}

function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskEmailForLog(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '(invalid)';
  return `${email.slice(0, 2)}***@${email.slice(at + 1)}`;
}

async function generateRecoveryUrl(
  supabase: ReturnType<typeof createClient>,
  email: string,
  redirectTo: string,
): Promise<{ url: string | null; reason?: string }> {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (error) {
      return { url: null, reason: error.message };
    }
    const props = data?.properties as { action_link?: string } | undefined;
    const link = props?.action_link ?? (data as { action_link?: string } | undefined)?.action_link ?? null;
    return { url: typeof link === 'string' && link ? link : null };
  } catch (e) {
    return { url: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

function buildResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
  const urlEsc = escapeHtml(resetUrl);
  const subject = 'Reset your StikmNek password';
  const html = `
<div style="font-family: Arial, sans-serif; line-height: 1.55; color: #111; max-width: 560px;">
  <p>Hi,</p>
  <p>We received a request to reset the password for your StikmNek account. Click the button below to choose a new password:</p>
  <p>
    <a href="${urlEsc}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:bold;">Reset your password</a>
  </p>
  <p style="font-size:0.85rem;color:#555;">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break:break-all;">${urlEsc}</span></p>
  <p style="font-size:0.85rem;color:#555;">This link can expire. If it stops working, request a new one from the Sign In screen. If you didn't request this, you can safely ignore this email.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:22px 0;">
  <p>The StikmNek Team</p>
</div>`.trim();
  const text = [
    'Hi,',
    '',
    'We received a request to reset the password for your StikmNek account.',
    'Open this link to choose a new password:',
    resetUrl,
    '',
    'This link can expire. If it stops working, request a new one from the Sign In screen.',
    "If you didn't request this, you can safely ignore this email.",
    '',
    'The StikmNek Team',
  ].join('\n');
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      console.error('[request-password-reset] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse(req, { success: false, error: 'Server misconfiguration' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const email = String((body as Record<string, unknown>)?.email ?? '').trim().toLowerCase();
    const redirectTo = resolveRedirectTo((body as Record<string, unknown>)?.redirectTo);

    if (!EMAIL_RE.test(email)) {
      return jsonResponse(req, { success: false, error: 'A valid email is required' }, 400);
    }

    if (!getResendApiKey()) {
      console.error('[request-password-reset] RESEND_API_KEY not set — cannot send recovery email');
      return jsonResponse(
        req,
        { success: false, error: 'Email service not configured. Please contact support.' },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { url: resetUrl, reason } = await generateRecoveryUrl(supabase, email, redirectTo);

    // No account enumeration: if there's no user (or link gen failed), still return success.
    if (!resetUrl) {
      console.warn(
        '[request-password-reset] No recovery link generated for',
        maskEmailForLog(email),
        '— reason:',
        reason ?? 'unknown (likely no account)',
      );
      return jsonResponse(req, { success: true, sent: false });
    }

    const { subject, html, text } = buildResetEmail(resetUrl);
    const res = await sendResendEmail({ to: email, subject, html, text });
    if (!res.ok) {
      console.error('[request-password-reset] Resend FAILED status=', res.status, 'body=', res.body);
      return jsonResponse(
        req,
        { success: false, error: parseResendErrorMessage(res.status, res.body) },
        502,
      );
    }

    console.log('[request-password-reset] Recovery email sent to', maskEmailForLog(email), '| redirectTo:', redirectTo);
    return jsonResponse(req, { success: true, sent: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    console.error('[request-password-reset] Caught error:', msg);
    return jsonResponse(req, { success: false, error: 'Internal server error' }, 500);
  }
});

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';
import { normalizePassTypeToDb } from '../_shared/passTypes.ts';
import { transactionalPassProductNameEn } from '../_shared/passDisplay.ts';
import {
  getResendApiKey,
  getTransactionalFromHeader,
  parseResendErrorMessage,
  sendResendEmail,
} from '../_shared/resend.ts';

/**
 * send-email Edge Function
 * Transactional email via Resend (https://resend.com).
 * Required secrets (Supabase → Project Settings → Edge Functions → Secrets):
 *   RESEND_API_KEY — Resend API key (re_…)
 * Optional:
 *   RESEND_FROM_EMAIL — default no-reply@stikmnek.com (domain must be verified in Resend)
 *   RESEND_FROM_NAME — default "StikmNek"
 *   Legacy migration: if RESEND_FROM_* unset, SENDGRID_FROM_EMAIL / SENDGRID_FROM_NAME are still read.
 *   SUPABASE_SERVICE_ROLE_KEY — required for send_booking_inquiry (pass check, business row, owner email)
 *   BOOKING_INQUIRY_BCC — comma-separated emails to BCC on every booking inquiry (e.g. ops inbox)
 *   PURCHASE_NOTIFY_EMAILS — comma-separated ops inboxes for new pass purchases (default: stikmnek@gmail.com);
 *     sent from paypal-capture / process-card-payment, not from this function.
 * CORS: CORS_ALLOWED_ORIGINS (comma-separated). If unset, Allow-Origin is *.
 */

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
const BEARER_PREFIX = /^Bearer\s+/i;

function safeDecodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1] ?? '');
    const payload = JSON.parse(json);
    return (payload && typeof payload === 'object') ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function getAuthUser(
  authClient: SupabaseServiceClient,
  req: Request,
): Promise<{ user: { id: string; email?: string } } | { response: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.trim()) {
    return { response: errorResponse(req, 'Missing Authorization header', 401, { reason: 'missing_authorization' }) };
  }
  const token = authHeader.replace(BEARER_PREFIX, '').trim();
  const tokenPayload = safeDecodeJwtPayload(token);
  if (tokenPayload) {
    console.log('[send-email] Auth header token payload (masked):', {
      iss: tokenPayload.iss,
      aud: tokenPayload.aud,
      role: tokenPayload.role,
      sub: tokenPayload.sub,
      exp: tokenPayload.exp,
    });
  } else {
    console.warn('[send-email] Auth header token is not a 3-part JWT (unexpected)');
  }
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) {
    console.error('[send-email] auth.getUser failed:', error?.message ?? '(no error message)');
    return {
      response: errorResponse(req, 'Invalid or expired session', 401, {
        reason: 'auth_invalid',
        authError: error?.message ?? null,
      }),
    };
  }
  return { user };
}

/** Mask email for logs (e.g. ab***@domain.com). */
function maskEmailForLog(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '(invalid)';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const show = local.slice(0, 2);
  return `${show}***@${domain}`;
}

function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amount: unknown, currency: unknown): string {
  const c = String(currency || 'AUD').toUpperCase();
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isFinite(n)) return `${c} ${n.toFixed(2)}`;
  const s = String(amount ?? '').trim();
  return s ? `${c} ${s}` : `${c} —`;
}

/** First YYYY-MM-DD in a value (handles ISO timestamps from DB/clients). */
function dateOnlyFromUnknown(v: unknown): string | null {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Inclusive calendar-day count between two date-only strings.
 * Uses UTC calendar components (no Date parsing ambiguity). Matches app `inclusiveCalendarDaysBetween`.
 */
function inclusiveCalendarDaysBetweenDateOnly(from: string, until: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return null;
  const y1 = Number(from.slice(0, 4));
  const m1 = Number(from.slice(5, 7)) - 1;
  const d1 = Number(from.slice(8, 10));
  const y2 = Number(until.slice(0, 4));
  const m2 = Number(until.slice(5, 7)) - 1;
  const d2 = Number(until.slice(8, 10));
  const a = Date.UTC(y1, m1, d1, 12);
  const b = Date.UTC(y2, m2, d2, 12);
  const ms = b - a;
  if (!Number.isFinite(ms)) return null;
  const daysBetween = Math.round(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, daysBetween + 1);
}

function shareBonusPromoText(passType: unknown): { headline: string; body: string } {
  const t = normalizePassTypeToDb(String(passType ?? ''));
  // Keep messaging generic enough for all pass types, but slightly more specific when we can.
  const base =
    `Log into your dashboard and click “Share App” to instantly upgrade your pass for FREE.`;
  if (!t) {
    return {
      headline: 'Unlock more value (free upgrade)',
      body: base,
    };
  }
  if (t === 'daily') {
    return {
      headline: 'Unlock more value (free upgrade)',
      body: `${base} You’ll add +2 people to your pass in seconds.`,
    };
  }
  if (t === 'weekly') {
    return {
      headline: 'Unlock more value (free upgrade)',
      body: `${base} You’ll add +2 people and an extra day to your pass.`,
    };
  }
  if (t === 'monthly') {
    return {
      headline: 'Unlock more value (free upgrade)',
      body: `${base} You’ll add extra capacity and an extra day to your pass.`,
    };
  }
  if (t === 'mega_group') {
    return {
      headline: 'Unlock more value (free upgrade)',
      body: `${base} You’ll unlock +5 extra days on your pass.`,
    };
  }
  if (t === 'dynamic') {
    return {
      headline: 'Share StikmNek with your crew',
      body:
        `Log into your dashboard and click “Share App” to spread the word. New StikmNek Pass pricing is based on your group size and trip length at purchase time.`,
    };
  }
  return {
    headline: 'Unlock more value (free upgrade)',
    body: `${base} You’ll add extra capacity (and potentially extra time) to your pass.`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey =
      (Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '').trim() ||
      (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim() ||
      (Deno.env.get('SUPABASE_ANON_KEY_PUBLIC') ?? '').trim();
    if (!supabaseUrl || !serviceKey) {
      console.error('[send-email] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return errorResponse(req, 'Server misconfiguration', 500);
    }
    if (!anonKey) {
      console.error('[send-email] Missing anon key for JWT validation (set APP_SUPABASE_ANON_KEY)');
      return errorResponse(req, 'Server misconfiguration', 500, { reason: 'missing_supabase_anon_key' });
    }
    const anonPayload = safeDecodeJwtPayload(anonKey);
    console.log('[send-email] JWT validation key (masked payload):', anonPayload ? {
      ref: anonPayload.ref,
      role: anonPayload.role,
      iss: anonPayload.iss,
      exp: anonPayload.exp,
    } : '(could not decode)');

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authResult = await getAuthUser(authClient, req);
    if ('response' in authResult) {
      return authResult.response;
    }
    const authUser = authResult.user;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    console.log('[send-email] Invoked with action:', action ?? '(missing)');

    if (!action) {
      return errorResponse(req, 'Missing action');
    }

    // ─── HEALTH ───
    if (action === 'health_check') {
      const hasKey = !!getResendApiKey();
      return jsonResponse(req, {
        success: true,
        resend_configured: hasKey,
        message: hasKey ? 'Resend configured' : 'RESEND_API_KEY not set - emails will not send',
      });
    }

    // ─── SEND_BUSINESS_DECISION ───
    if (action === 'send_business_decision') {
      if (!getResendApiKey()) {
        console.warn('[send-email] RESEND_API_KEY not set - skipping email');
        return jsonResponse(req, {
          success: false,
          error: 'Email not configured. Set RESEND_API_KEY in Supabase secrets.',
        });
      }

      const { owner_email, business_name, decision, admin_notes } = body;
      const emailStr = String(owner_email ?? '').trim();
      if (!emailStr) {
        return jsonResponse(req, {
          success: false,
          error: 'This submission has no owner email — add a valid address on the listing before notifying.',
        });
      }
      const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
      if (!emailLooksValid) {
        return jsonResponse(req, {
          success: false,
          error: `Owner email is not a valid address: ${emailStr}`,
        });
      }

      const safeBusinessName = escapeHtml(business_name);
      const subjectName = String(business_name ?? '').replace(/[\r\n\x00]/g, ' ').trim().slice(0, 200);
      const subject = decision === 'approved'
        ? `Your business "${subjectName}" has been approved!`
        : `Update on your business "${subjectName}" listing`;
      const notesBlock = admin_notes
        ? `<p><strong>Admin note:</strong> ${escapeHtml(admin_notes)}</p>`
        : '';
      const html = decision === 'approved'
        ? `<p>Congratulations! Your business listing "${safeBusinessName}" has been approved and is now live on StikmNek.</p>${notesBlock}`
        : `<p>Your business listing "${safeBusinessName}" was not approved at this time.</p>${notesBlock}<p>Please contact support if you have questions.</p>`;

      const templateId = decision === 'approved'
        ? Deno.env.get('RESEND_TEMPLATE_BUSINESS_APPROVED')?.trim()
        : Deno.env.get('RESEND_TEMPLATE_BUSINESS_REJECTED')?.trim();

      const res = await sendResendEmail({
        to: emailStr,
        subject,
        ...(templateId
          ? {
            template: {
              id: templateId,
              variables: {
                BUSINESS_NAME: String(business_name ?? '').replace(/[\r\n\x00]/g, ' ').trim(),
                ADMIN_NOTES: String(admin_notes ?? '').replace(/[\r\n\x00]/g, ' ').trim(),
              },
            },
          }
          : { html }),
      });

      if (!res.ok) {
        const errText = res.body;
        const logMsg = `[send-email] Resend send_business_decision FAILED status=${res.status} body=${errText}`;
        console.error(logMsg);
        const userMsg = parseResendErrorMessage(res.status, errText);
        return jsonResponse(req, {
          success: false,
          error: userMsg,
          resendStatus: res.status,
          details: errText.slice(0, 1200),
        });
      }

      return jsonResponse(req, { success: true, sent: true });
    }

    // ─── SEND_PASS_CONFIRMATION (receipt email after pass purchase) ───
    // Called from PaymentConfirmation page when user lands on receipt. Requires RESEND_API_KEY.
    // From address must use a domain verified in Resend (e.g. no-reply@stikmnek.com).
    if (action === 'send_pass_confirmation') {
      console.log('[send-email] send_pass_confirmation: started');

      console.log('[send-email] RESEND_API_KEY present:', !!getResendApiKey());
      console.log(
        '[send-email] RESEND_FROM_EMAIL from env:',
        Deno.env.get('RESEND_FROM_EMAIL') ?? Deno.env.get('SENDGRID_FROM_EMAIL') ?? '(not set, will use default)',
      );

      if (!getResendApiKey()) {
        const msg = 'Email not configured. Set RESEND_API_KEY in Supabase Edge Function secrets.';
        console.error('[send-email] send_pass_confirmation FAILED: ' + msg);
        return jsonResponse(req, { success: false, error: msg }, 500);
      }

      const {
        user_email,
        user_name,
        receipt_number,
        pass_type,
        amount,
        currency,
        payment_method,
        valid_from,
        valid_until,
        duration_days,
        share_bonus_applied,
        party_size,
        is_extended,
        group_label,
      } = body;

      const authAccountEmail = (authUser.email ?? '').trim();
      if (!authAccountEmail) {
        return errorResponse(req, 'Your account has no email address for receipts.', 400);
      }

      /** Temporary: set PASS_CONFIRMATION_EMAIL_OVERRIDE in Supabase secrets to receive test receipts at a real inbox. */
      const emailOverride = (Deno.env.get('PASS_CONFIRMATION_EMAIL_OVERRIDE') ?? '').trim();
      const toEmail = emailOverride || authAccountEmail;
      if (emailOverride) {
        console.warn('[send-email] PASS_CONFIRMATION_EMAIL_OVERRIDE active — sending to:', emailOverride);
      }

      const receiptStr = String(receipt_number ?? '').trim();
      let verifiedAmount = amount;
      let verifiedCurrency = currency;
      let verifiedValidFrom = valid_from;
      let verifiedValidUntil = valid_until;
      let verifiedShareBonus = share_bonus_applied;
      let verifiedPartySize = party_size;
      let verifiedIsExtended = is_extended;

      if (receiptStr) {
        const { data: passRows, error: passLookupErr } = await supabase
          .from('passes')
          .select(
            'id, amount_paid, currency, valid_from, valid_until, share_bonus_applied, max_people, payment_provider, purchased_at',
          )
          .eq('user_id', authUser.id)
          .order('purchased_at', { ascending: false })
          .limit(30);
        if (passLookupErr) {
          console.warn('[send-email] pass lookup failed:', passLookupErr.message);
        } else {
          const match = (passRows ?? []).find((row) => {
            const rid = String((row as { id?: string }).id ?? '');
            const derived = `STK-${rid.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
            return derived === receiptStr.toUpperCase();
          }) as Record<string, unknown> | undefined;
          if (!match) {
            return errorResponse(req, 'No matching purchase found for this receipt.', 404, {
              reason: 'receipt_not_found',
            });
          }
          verifiedAmount = Number(match.amount_paid) || amount;
          verifiedCurrency = match.currency ?? currency;
          verifiedValidFrom = match.valid_from ?? valid_from;
          verifiedValidUntil = match.valid_until ?? valid_until;
          verifiedShareBonus = match.share_bonus_applied ?? share_bonus_applied;
          verifiedPartySize = match.max_people ?? party_size;
        }
      } else {
        return errorResponse(req, 'Missing receipt_number');
      }

      console.log('[send-email] From (Resend):', getTransactionalFromHeader(), '| To:', toEmail);

      const passLabel = transactionalPassProductNameEn();
      const subject = `StikmNek receipt — ${passLabel}`;
      const safeName = escapeHtml(user_name || '');
      const safeReceipt = escapeHtml(receiptStr || '—');
      const safePayment = escapeHtml(payment_method || '—');
      const money = escapeHtml(formatMoney(verifiedAmount, verifiedCurrency));
      const promo = shareBonusPromoText(pass_type);

      const fromKey = dateOnlyFromUnknown(verifiedValidFrom);
      const untilKey = dateOnlyFromUnknown(verifiedValidUntil);
      const displayFrom = fromKey ?? (verifiedValidFrom != null && String(verifiedValidFrom).trim() ? String(verifiedValidFrom).trim() : '—');
      const displayUntil = untilKey ?? (verifiedValidUntil != null && String(verifiedValidUntil).trim() ? String(verifiedValidUntil).trim() : '—');
      const safeValidFrom = escapeHtml(displayFrom);
      const safeValidUntil = escapeHtml(displayUntil);

      const computedInclusiveDays =
        fromKey && untilKey ? inclusiveCalendarDaysBetweenDateOnly(fromKey, untilKey) : null;
      const fallbackDurationNum = typeof duration_days === 'number' ? duration_days : Number(duration_days);
      const durationLabel =
        computedInclusiveDays != null && computedInclusiveDays > 0
          ? `${computedInclusiveDays} day${computedInclusiveDays === 1 ? '' : 's'}`
          : Number.isFinite(fallbackDurationNum) && fallbackDurationNum > 0
            ? `${Math.floor(fallbackDurationNum)} day${fallbackDurationNum === 1 ? '' : 's'}`
            : '—';
      const shareApplied = verifiedShareBonus === true || verifiedShareBonus === 'true';

      const partyNum = typeof verifiedPartySize === 'number'
        ? verifiedPartySize
        : Number(verifiedPartySize);
      const partyLabel = (typeof group_label === 'string' && group_label.trim())
        ? group_label.trim()
        : Number.isFinite(partyNum) && partyNum >= 1
          ? `${Math.floor(partyNum)} guest${Math.floor(partyNum) === 1 ? '' : 's'} (ages 6+)`
          : '';
      const safePartyLabel = escapeHtml(partyLabel);
      const extendedPass = verifiedIsExtended === true || verifiedIsExtended === 'true';
      const passDurationType = extendedPass ? '7-day whole trip (+A$15)' : '1-day pass';
      const safePassDurationType = escapeHtml(passDurationType);

      const partyRowHtml = safePartyLabel
        ? `<tr>
                      <td colspan="2" style="padding:12px 0; border-bottom:1px solid #f1f5f9;">
                        <div style="font-size:12px; color:#64748b;">Party size</div>
                        <div style="font-size:14px; color:#0f172a;">${safePartyLabel}</div>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding:12px 0; border-bottom:1px solid #f1f5f9;">
                        <div style="font-size:12px; color:#64748b;">Pass option</div>
                        <div style="font-size:14px; color:#0f172a;">${safePassDurationType}</div>
                      </td>
                    </tr>`
        : '';

      // Premium, mobile-friendly, email-client-safe HTML (tables + inline styles).
      const html = `
<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f6f7f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 14px; font-family:Arial, sans-serif; color:#0f172a;">
                <div style="font-weight:800; letter-spacing:0.2px; font-size:16px; color:#0d9488;">StikmNek</div>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 24px rgba(15, 23, 42, 0.08);">
                <div style="padding:22px 22px 16px; background:linear-gradient(135deg, #0d9488 0%, #059669 100%); color:#ffffff; font-family:Arial, sans-serif;">
                  <div style="font-size:12px; opacity:0.95; margin-bottom:6px;">Purchase receipt</div>
                  <div style="font-size:22px; font-weight:800; line-height:1.2;">${escapeHtml(passLabel)}</div>
                  <div style="margin-top:10px; font-size:13px; opacity:0.92;">
                    ${safeName ? `Hi ${safeName}, ` : ''}your pass is now active.
                  </div>
                </div>

                <div style="padding:18px 22px 8px; font-family:Arial, sans-serif; color:#0f172a;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate; border-spacing:0; width:100%;">
                    <tr>
                      <td style="padding:12px 0; border-bottom:1px solid #e5e7eb;">
                        <div style="font-size:12px; color:#64748b;">Receipt</div>
                        <div style="font-size:14px; font-weight:700; color:#0f172a;">${safeReceipt}</div>
                      </td>
                      <td style="padding:12px 0; border-bottom:1px solid #e5e7eb;" align="right">
                        <div style="font-size:12px; color:#64748b;">Amount</div>
                        <div style="font-size:14px; font-weight:800; color:#0f172a;">${money}</div>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:12px 0; border-bottom:1px solid #f1f5f9;">
                        <div style="font-size:12px; color:#64748b;">Valid from</div>
                        <div style="font-size:14px; color:#0f172a;">${safeValidFrom}</div>
                      </td>
                      <td style="padding:12px 0; border-bottom:1px solid #f1f5f9;" align="right">
                        <div style="font-size:12px; color:#64748b;">Valid until</div>
                        <div style="font-size:14px; color:#0f172a;">${safeValidUntil}</div>
                      </td>
                    </tr>

                    ${partyRowHtml}

                    <tr>
                      <td style="padding:12px 0; border-bottom:1px solid #f1f5f9;">
                        <div style="font-size:12px; color:#64748b;">Pass duration</div>
                        <div style="font-size:14px; font-weight:700; color:#0f172a;">${escapeHtml(durationLabel)}</div>
                      </td>
                      <td style="padding:12px 0; border-bottom:1px solid #f1f5f9;" align="right">
                        <div style="font-size:12px; color:#64748b;">Share Bonus</div>
                        <div style="font-size:14px; color:#0f172a;">${shareApplied ? 'Applied ✓' : 'Not applied'}</div>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:12px 0;">
                        <div style="font-size:12px; color:#64748b;">Payment method</div>
                        <div style="font-size:14px; color:#0f172a;">${safePayment}</div>
                      </td>
                      <td style="padding:12px 0;" align="right">
                        <div style="font-size:12px; color:#64748b;">Support</div>
                        <div style="font-size:14px; color:#0f172a;">Reply to this email</div>
                      </td>
                    </tr>
                  </table>
                </div>

                <div style="padding:0 22px 20px; font-family:Arial, sans-serif;">
                  <div style="background:#ecfeff; border:1px solid #99f6e4; border-radius:14px; padding:14px 14px;">
                    <div style="display:block; font-weight:800; color:#115e59; font-size:14px; margin-bottom:6px;">
                      🎁 ${escapeHtml(promo.headline)}
                    </div>
                    <div style="color:#0f172a; font-size:13px; line-height:1.45;">
                      ${escapeHtml(promo.body)}
                    </div>
                    <div style="margin-top:12px;">
                      <a href="https://www.stikmnek.com" style="display:inline-block; background:#0d9488; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:700;">
                        Open StikmNek
                      </a>
                    </div>
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 8px 0; text-align:center; font-family:Arial, sans-serif; color:#94a3b8; font-size:12px;">
                © ${new Date().getFullYear()} StikmNek • Vanuatu travel deals
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
      `.trim();

      const passTemplateId = Deno.env.get('RESEND_TEMPLATE_PASS_CONFIRMATION')?.trim();
      const res = await sendResendEmail({
        to: toEmail,
        subject,
        ...(passTemplateId
          ? {
            template: {
              id: passTemplateId,
              variables: {
                USER_NAME: user_name || '',
                PASS_LABEL: passLabel,
                RECEIPT_NUMBER: receipt_number || '',
                AMOUNT_FORMATTED: formatMoney(verifiedAmount, verifiedCurrency),
                PAYMENT_METHOD: payment_method || '',
                VALID_FROM: displayFrom,
                VALID_UNTIL: displayUntil,
                DURATION_LABEL: durationLabel,
                SHARE_BONUS_LABEL: shareApplied ? 'Applied ✓' : 'Not applied',
                PARTY_LABEL: partyLabel,
                PASS_DURATION_TYPE: passDurationType,
                PROMO_HEADLINE: promo.headline,
                PROMO_BODY: promo.body,
                FOOTER_YEAR: new Date().getFullYear(),
              },
            },
          }
          : { html }),
      });

      console.log('[send-email] Resend response status:', res.status);

      if (!res.ok) {
        const errText = res.body;
        const logMsg = `[send-email] Resend send_pass_confirmation FAILED status=${res.status} body=${errText}`;
        console.error(logMsg);
        return jsonResponse(
          req,
          {
            success: false,
            error: parseResendErrorMessage(res.status, errText),
            details: errText,
          },
          500,
        );
      }

      console.log('[send-email] Pass confirmation sent to', toEmail);
      return jsonResponse(req, { success: true, sent: true, deliveredTo: toEmail, override: Boolean(emailOverride) });
    }

    // ─── SEND_BOOKING_INQUIRY (tourist → business owner via Resend) ───
    if (action === 'send_booking_inquiry') {
      console.log('[send-email] send_booking_inquiry: started');

      console.log('[send-email] RESEND_API_KEY present:', !!getResendApiKey());
      if (!getResendApiKey()) {
        return jsonResponse(req, {
          success: false,
          error: 'Email not configured. Set RESEND_API_KEY in Supabase secrets.',
        }, 500);
      }

      console.log('[send-email] Tourist user id:', authUser.id);

      const {
        business_id,
        visit_date,
        adults,
        children,
        infants,
        tourist_name,
        tourist_email,
        tourist_whatsapp,
        tourist_phone,
        message,
        total_standard_vt,
        total_deal_vt,
        savings_vt,
      } = body;

      if (!business_id || typeof business_id !== 'string') {
        return errorResponse(req, 'Missing business_id');
      }

      const a = Number(adults);
      const c = Number(children);
      const inf = infants !== undefined && infants !== null ? Number(infants) : 0;
      if (!Number.isFinite(a) || a < 0 || !Number.isFinite(c) || c < 0 || a + c < 1) {
        return errorResponse(req, 'Invalid adults/children');
      }
      if (!Number.isFinite(inf) || inf < 0) {
        return errorResponse(req, 'Invalid infants');
      }

      const nowIso = new Date().toISOString();
      const { data: passRows, error: passErr } = await supabase
        .from('passes')
        .select('id')
        .eq('user_id', authUser.id)
        .eq('active', true)
        .gt('expires_at', nowIso)
        .order('purchased_at', { ascending: false })
        .limit(1);

      if (passErr) {
        console.error('[send-email] send_booking_inquiry pass check:', passErr);
        return errorResponse(req, 'Could not verify pass', 500);
      }
      if (!passRows?.length) {
        console.warn('[send-email] send_booking_inquiry: no active pass for user');
        return errorResponse(req, 'Active pass required to send booking inquiries', 403);
      }
      console.log('[send-email] Pass check OK, pass row count:', passRows.length);

      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', business_id)
        .maybeSingle();

      if (bizErr || !biz) {
        console.error('[send-email] send_booking_inquiry: business fetch', bizErr?.message);
        return errorResponse(req, 'Business not found', 404);
      }

      const row = biz as Record<string, unknown>;
      const pickListingEmail = (): string | null => {
        for (const key of ['email', 'contact_email', 'business_email']) {
          const v = row[key];
          if (typeof v === 'string' && v.trim()) return v.trim();
        }
        return null;
      };

      let ownerEmail: string | null = pickListingEmail();
      const ownerId = row.owner_id as string | undefined;
      const bizNameLog = typeof row.name === 'string' ? row.name : business_id;
      console.log('[send-email] Listing email from row:', !!ownerEmail, '| owner_id:', ownerId ?? '(none)');

      if (!ownerEmail && ownerId) {
        const { data: prof, error: profErr } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('user_id', ownerId)
          .maybeSingle();
        if (profErr) {
          console.error('[send-email] send_booking_inquiry: user_profiles error', profErr.message);
        }
        const em = prof?.email;
        ownerEmail = typeof em === 'string' && em.trim() ? em.trim() : null;
        console.log('[send-email] Owner email from user_profiles:', ownerEmail ? maskEmailForLog(ownerEmail) : '(empty)');
      }

      // Fallback: auth.users.email (profile row can be empty or out of sync)
      if (!ownerEmail && ownerId) {
        const { data: authUserData, error: authUserErr } = await supabase.auth.admin.getUserById(ownerId);
        if (authUserErr) {
          console.error('[send-email] send_booking_inquiry: auth.admin.getUserById', authUserErr.message);
        }
        const authEmail = authUserData?.user?.email;
        ownerEmail = typeof authEmail === 'string' && authEmail.trim() ? authEmail.trim() : null;
        if (ownerEmail) {
          console.log('[send-email] Owner email from auth.users:', maskEmailForLog(ownerEmail));
        }
      }

      if (!ownerEmail) {
        console.error('[send-email] send_booking_inquiry: no recipient resolved for business', bizNameLog);
        return errorResponse(
          req,
          'No business email on file for this listing. Please use WhatsApp or phone.',
          400,
        );
      }

      const esc = (s: unknown) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const bizName = typeof row.name === 'string' ? row.name : 'Listing';
      const subject = `StikmNek booking inquiry — ${bizName}`;
      const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 12px;">New booking inquiry</h2>
      <p style="margin: 0 0 8px;"><strong>Listing:</strong> ${esc(bizName)}</p>
      <p style="margin: 0 0 8px;"><strong>Preferred visit date:</strong> ${esc(visit_date)}</p>
      <p style="margin: 0 0 8px;"><strong>Party:</strong> ${esc(adults)} adult(s), ${esc(children)} child(ren)${inf > 0 ? `, ${esc(inf)} infant(s)` : ''}</p>
      <table style="border-collapse: collapse; margin: 12px 0; max-width: 480px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #555;">Total standard (VT)</td><td style="padding: 4px 0; font-weight: 700;">${esc(total_standard_vt)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #555;">Total StikmNek (VT)</td><td style="padding: 4px 0; font-weight: 700;">${esc(total_deal_vt)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #555;">Guest savings (VT)</td><td style="padding: 4px 0; font-weight: 700; color: #0d9488;">${esc(savings_vt)}</td></tr>
      </table>
      <p style="margin: 12px 0 4px;"><strong>From</strong></p>
      <p style="margin: 0 0 4px;">${esc(tourist_name)}</p>
      <p style="margin: 0 0 4px;">Email: ${esc(tourist_email)}</p>
      ${tourist_whatsapp ? `<p style="margin: 0 0 4px;">WhatsApp: ${esc(tourist_whatsapp)}</p>` : ''}
      ${tourist_phone ? `<p style="margin: 0 0 4px;">Phone: ${esc(tourist_phone)}</p>` : ''}
      ${message ? `<p style="margin: 12px 0 0;"><strong>Message</strong></p><p style="margin: 4px 0 0; white-space: pre-wrap;">${esc(message)}</p>` : ''}
      <p style="margin: 16px 0 0; color: #555; font-size: 12px;">Sent via StikmNek. Reply directly to this email to reach the guest.</p>
    </div>
      `.trim();

      console.log('[send-email] From (Resend):', getTransactionalFromHeader(), '| To (business):', maskEmailForLog(ownerEmail));

      const bccRaw = Deno.env.get('BOOKING_INQUIRY_BCC')?.trim();
      const bccList = bccRaw
        ? bccRaw.split(',').map((e) => e.trim()).filter((e) => e.includes('@'))
        : [];
      if (bccList.length > 0) {
        console.log('[send-email] BCC count:', bccList.length);
      }

      const reply =
        typeof tourist_email === 'string' && tourist_email.trim()
          ? {
            email: tourist_email.trim(),
            name: typeof tourist_name === 'string' && tourist_name.trim() ? tourist_name.trim() : undefined,
          }
          : undefined;

      const bookingTemplateId = Deno.env.get('RESEND_TEMPLATE_BOOKING_INQUIRY')?.trim();
      console.log('[send-email] Calling Resend API (booking inquiry)...');
      const res = await sendResendEmail({
        to: ownerEmail,
        subject,
        ...(bookingTemplateId
          ? {
            template: {
              id: bookingTemplateId,
              variables: {
                LISTING_NAME: String(bizName),
                VISIT_DATE: String(visit_date ?? ''),
                ADULTS_COUNT: a,
                CHILDREN_COUNT: c,
                INFANTS_COUNT: inf,
                TOTAL_STANDARD_VT: String(total_standard_vt ?? ''),
                TOTAL_DEAL_VT: String(total_deal_vt ?? ''),
                SAVINGS_VT: String(savings_vt ?? ''),
                GUEST_NAME: String(tourist_name ?? ''),
                GUEST_MAIL: String(tourist_email ?? ''),
                GUEST_WHATSAPP: tourist_whatsapp ? String(tourist_whatsapp) : '',
                GUEST_PHONE: tourist_phone ? String(tourist_phone) : '',
                GUEST_MESSAGE: message ? String(message) : '',
              },
            },
          }
          : { html }),
        bcc: bccList.length > 0 ? bccList : undefined,
        replyTo: reply,
      });

      const sgStatus = res.status;
      console.log('[send-email] Resend response status:', sgStatus);

      if (!res.ok) {
        const errText = res.body;
        console.error('[send-email] Resend send_booking_inquiry FAILED status=', sgStatus, 'body=', errText);
        return jsonResponse(
          req,
          {
            success: false,
            error: parseResendErrorMessage(sgStatus, errText),
            details: errText,
          },
          500,
        );
      }

      if (res.id) {
        console.log('[send-email] Resend email id:', res.id);
      }
      console.log('[send-email] send_booking_inquiry: completed OK (HTTP', sgStatus, ')');

      return jsonResponse(req, { success: true, sent: true });
    }

    // ─── STUB: other actions (get_preferences, get_email_logs, etc.) ───
    if (action === 'get_preferences') {
      return jsonResponse(req, { preferences: { pass_purchase: true, business_approval: true, new_review: true, marketing: false, weekly_digest: true } });
    }
    if (action === 'get_email_logs') {
      return jsonResponse(req, { logs: [], total: 0 });
    }
    if (action === 'get_email_stats') {
      return jsonResponse(req, { stats: { sent: 0, failed: 0 } });
    }
    if (action === 'get_templates') {
      return jsonResponse(req, { templates: [] });
    }
    if (action === 'update_preferences' || action === 'update_template') {
      return jsonResponse(req, { success: true });
    }

    return errorResponse(req, 'Unknown action: ' + action);
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    const logMsg = `[send-email] Caught error: ${errMessage}`;
    console.error(logMsg);
    if (err instanceof Error && err.stack) {
      console.error('[send-email] Stack:', err.stack);
    }
    return jsonResponse(
      req,
      { success: false, error: errMessage || 'Internal server error' },
      500,
    );
  }
});

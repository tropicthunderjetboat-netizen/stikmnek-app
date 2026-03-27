// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * send-email Edge Function
 * Handles email notifications via SendGrid.
 * Required secrets (Supabase → Project Settings → Edge Functions → Secrets):
 *   SENDGRID_API_KEY — your SendGrid API key
 * Optional (defaults shown):
 *   SENDGRID_FROM_EMAIL — default no-reply@stikmnek.com (must be verified in SendGrid)
 *   SENDGRID_FROM_NAME — default "StikmNek"
 *   SUPABASE_SERVICE_ROLE_KEY — required for send_booking_inquiry (pass check, business row, owner email)
 * Optional:
 *   BOOKING_INQUIRY_BCC — comma-separated emails to BCC on every booking inquiry (e.g. ops inbox for debugging)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
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

/** StikmNek branded pass names (DB pass_type keys — never show raw keys to users). */
function passTypeToBrandDisplay(passType: unknown): string {
  const t = String(passType ?? '').toLowerCase().trim();
  if (t === 'daily') return 'Family Explorer Pass';
  if (t === 'weekly') return 'Extended Group Adventure Pass';
  if (t === 'monthly') return 'Ultimate Crew Experience Pass';
  if (t === 'mega_group') return 'Mega Group Experience Pass';
  return 'StikmNek Pass';
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

function shareBonusPromoText(passType: unknown): { headline: string; body: string } {
  const t = String(passType ?? '').toLowerCase().trim();
  // Keep messaging generic enough for all pass types, but slightly more specific when we can.
  const base =
    `Log into your dashboard and click “Share App” to instantly upgrade your pass for FREE.`;
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
      body: `${base} You’ll unlock +5 extra days on your Mega Group pass.`,
    };
  }
  return {
    headline: 'Unlock more value (free upgrade)',
    body: `${base} You’ll add extra capacity (and potentially extra time) to your pass.`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn('[send-email] Rejected: Missing Authorization header (is Verify JWT OFF for this function?)');
      return errorResponse('Missing Authorization header', 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    console.log('[send-email] Invoked with action:', action ?? '(missing)');

    if (!action) {
      return errorResponse('Missing action');
    }

    // ─── HEALTH ───
    if (action === 'health_check') {
      const hasKey = !!Deno.env.get('SENDGRID_API_KEY');
      return jsonResponse({
        success: true,
        sendgrid_configured: hasKey,
        message: hasKey ? 'SendGrid configured' : 'SENDGRID_API_KEY not set - emails will not send',
      });
    }

    // ─── SEND_BUSINESS_DECISION ───
    if (action === 'send_business_decision') {
      const apiKey = Deno.env.get('SENDGRID_API_KEY');
      if (!apiKey) {
        console.warn('[send-email] SENDGRID_API_KEY not set - skipping email');
        return jsonResponse({
          success: false,
          error: 'Email not configured. Set SENDGRID_API_KEY in Supabase secrets.',
        });
      }

      const { owner_email, business_name, decision, admin_notes } = body;
      if (!owner_email) {
        return errorResponse('Missing owner_email');
      }

      const subject = decision === 'approved'
        ? `Your business "${business_name}" has been approved!`
        : `Update on your business "${business_name}" listing`;
      const html = decision === 'approved'
        ? `<p>Congratulations! Your business listing "${business_name}" has been approved and is now live on StikmNek.</p>${admin_notes ? `<p><strong>Admin note:</strong> ${admin_notes}</p>` : ''}`
        : `<p>Your business listing "${business_name}" was not approved at this time.</p>${admin_notes ? `<p><strong>Admin note:</strong> ${admin_notes}</p>` : ''}<p>Please contact support if you have questions.</p>`;

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: owner_email }] }],
          from: {
            email: Deno.env.get('SENDGRID_FROM_EMAIL') || 'no-reply@stikmnek.com',
            name: Deno.env.get('SENDGRID_FROM_NAME') || 'StikmNek',
          },
          subject,
          content: [{ type: 'text/html', value: html }],
        }),
      });

      if (!res.ok) {
        let errText = '';
        try {
          errText = await res.text();
        } catch (e) {
          errText = '(could not read response body)';
        }
        const logMsg = `[send-email] SendGrid send_business_decision FAILED status=${res.status} body=${errText}`;
        console.error(logMsg);
        return jsonResponse(
          { success: false, error: `SendGrid error: ${res.status}`, details: errText },
          500
        );
      }

      return jsonResponse({ success: true, sent: true });
    }

    // ─── SEND_PASS_CONFIRMATION (receipt email after pass purchase) ───
    // Called from PaymentConfirmation page when user lands on receipt. Requires SENDGRID_API_KEY.
    // From address should be a verified sender in SendGrid (e.g. no-reply@stikmnek.com).
    if (action === 'send_pass_confirmation') {
      console.log('[send-email] send_pass_confirmation: started');

      const apiKey = Deno.env.get('SENDGRID_API_KEY');
      const fromEnv = Deno.env.get('SENDGRID_FROM_EMAIL');
      console.log('[send-email] SENDGRID_API_KEY present:', !!apiKey);
      console.log('[send-email] SENDGRID_FROM_EMAIL from env:', fromEnv ?? '(not set, will use default)');

      if (!apiKey) {
        const msg = 'Email not configured. Set SENDGRID_API_KEY in Supabase Edge Function secrets.';
        console.error('[send-email] send_pass_confirmation FAILED: ' + msg);
        return jsonResponse({ success: false, error: msg }, 500);
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
      } = body;

      console.log('[send-email] user_email present:', !!user_email, typeof user_email, user_email ? `${user_email.slice(0, 2)}***@${user_email.split('@')[1] ?? '?'}` : '(missing)');

      if (!user_email || typeof user_email !== 'string') {
        console.warn('[send-email] Missing or invalid user_email in body. Keys received:', Object.keys(body ?? {}));
        return errorResponse('Missing user_email');
      }

      const passLabel = passTypeToBrandDisplay(pass_type);

      const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'no-reply@stikmnek.com';
      const fromName = Deno.env.get('SENDGRID_FROM_NAME') || 'StikmNek';
      console.log('[send-email] From address:', fromEmail, '| To:', user_email);

      const subject = `StikmNek receipt — ${passLabel}`;
      const safeName = escapeHtml(user_name || '');
      const safeReceipt = escapeHtml(receipt_number || '—');
      const safePayment = escapeHtml(payment_method || '—');
      const safeValidFrom = escapeHtml(valid_from || '—');
      const safeValidUntil = escapeHtml(valid_until || '—');
      const money = escapeHtml(formatMoney(amount, currency));
      const promo = shareBonusPromoText(pass_type);

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
                      <a href="https://stikmnek.com" style="display:inline-block; background:#0d9488; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:700;">
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

      const sgBody = {
        personalizations: [{ to: [{ email: user_email, name: user_name ?? undefined }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      };
      console.log('[send-email] Calling SendGrid API...');
      let res: Response;
      try {
        res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sgBody),
        });
      } catch (fetchErr: unknown) {
        const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        const logMsg = `[send-email] SendGrid fetch threw: ${fetchMsg}`;
        console.error(logMsg);
        return jsonResponse(
          { success: false, error: 'SendGrid request failed', details: fetchMsg },
          500
        );
      }

      console.log('[send-email] SendGrid response status:', res.status);

      if (!res.ok) {
        let errText = '';
        try {
          errText = await res.text();
        } catch (e) {
          errText = '(could not read response body)';
        }
        const logMsg = `[send-email] SendGrid send_pass_confirmation FAILED status=${res.status} body=${errText}`;
        console.error(logMsg);
        return jsonResponse(
          { success: false, error: `SendGrid error: ${res.status}`, details: errText },
          500
        );
      }

      console.log('[send-email] Pass confirmation sent to', user_email);
      return jsonResponse({ success: true, sent: true });
    }

    // ─── SEND_BOOKING_INQUIRY (tourist → business owner via SendGrid) ───
    if (action === 'send_booking_inquiry') {
      console.log('[send-email] send_booking_inquiry: started');

      const apiKey = Deno.env.get('SENDGRID_API_KEY');
      console.log('[send-email] SENDGRID_API_KEY present:', !!apiKey);
      if (!apiKey) {
        return jsonResponse({
          success: false,
          error: 'Email not configured. Set SENDGRID_API_KEY in Supabase secrets.',
        }, 500);
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      console.log('[send-email] SUPABASE_URL present:', !!supabaseUrl, '| SUPABASE_SERVICE_ROLE_KEY present:', !!serviceKey);
      if (!supabaseUrl || !serviceKey) {
        console.error('[send-email] send_booking_inquiry: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        return errorResponse('Server misconfiguration', 500);
      }

      const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: { user: tourist }, error: touristErr } = await supabaseAdmin.auth.getUser(token);
      if (touristErr || !tourist) {
        console.error('[send-email] send_booking_inquiry: getUser failed', touristErr?.message);
        return errorResponse('Invalid or expired session', 401);
      }
      console.log('[send-email] Tourist user id:', tourist.id);

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
        return errorResponse('Missing business_id');
      }

      const a = Number(adults);
      const c = Number(children);
      const inf = infants !== undefined && infants !== null ? Number(infants) : 0;
      if (!Number.isFinite(a) || a < 0 || !Number.isFinite(c) || c < 0 || a + c < 1) {
        return errorResponse('Invalid adults/children');
      }
      if (!Number.isFinite(inf) || inf < 0) {
        return errorResponse('Invalid infants');
      }

      const nowIso = new Date().toISOString();
      const { data: passRows, error: passErr } = await supabaseAdmin
        .from('passes')
        .select('id')
        .eq('user_id', tourist.id)
        .eq('active', true)
        .gt('expires_at', nowIso)
        .order('purchased_at', { ascending: false })
        .limit(1);

      if (passErr) {
        console.error('[send-email] send_booking_inquiry pass check:', passErr);
        return errorResponse('Could not verify pass', 500);
      }
      if (!passRows?.length) {
        console.warn('[send-email] send_booking_inquiry: no active pass for user');
        return errorResponse('Active pass required to send booking inquiries', 403);
      }
      console.log('[send-email] Pass check OK, pass row count:', passRows.length);

      const { data: biz, error: bizErr } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('id', business_id)
        .maybeSingle();

      if (bizErr || !biz) {
        console.error('[send-email] send_booking_inquiry: business fetch', bizErr?.message);
        return errorResponse('Business not found', 404);
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
        const { data: prof, error: profErr } = await supabaseAdmin
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
        const { data: authUserData, error: authUserErr } = await supabaseAdmin.auth.admin.getUserById(ownerId);
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

      const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'no-reply@stikmnek.com';
      const fromName = Deno.env.get('SENDGRID_FROM_NAME') || 'StikmNek';

      console.log('[send-email] From address:', fromEmail, '| To (business):', maskEmailForLog(ownerEmail));

      const bccRaw = Deno.env.get('BOOKING_INQUIRY_BCC')?.trim();
      const bccList = bccRaw
        ? bccRaw.split(',').map((e) => e.trim()).filter((e) => e.includes('@'))
        : [];

      const personalization: Record<string, unknown> = {
        to: [{ email: ownerEmail }],
      };
      if (bccList.length > 0) {
        personalization.bcc = bccList.map((email) => ({ email }));
        console.log('[send-email] BCC count:', bccList.length);
      }

      const mailPayload: Record<string, unknown> = {
        personalizations: [personalization],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      };

      const reply = typeof tourist_email === 'string' && tourist_email.trim();
      if (reply) {
        mailPayload.reply_to = {
          email: tourist_email.trim(),
          name: typeof tourist_name === 'string' && tourist_name.trim() ? tourist_name.trim() : undefined,
        };
      }

      console.log('[send-email] Calling SendGrid API (booking inquiry)...');
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mailPayload),
      });

      const sgStatus = res.status;
      console.log('[send-email] SendGrid response status:', sgStatus);

      if (!res.ok) {
        let errText = '';
        try {
          errText = await res.text();
        } catch {
          errText = '(could not read response body)';
        }
        console.error('[send-email] SendGrid send_booking_inquiry FAILED status=', sgStatus, 'body=', errText);
        return jsonResponse(
          { success: false, error: `SendGrid error: ${sgStatus}`, details: errText },
          500,
        );
      }

      const msgId = res.headers.get('x-message-id') ?? res.headers.get('X-Message-Id');
      if (msgId) {
        console.log('[send-email] SendGrid X-Message-Id:', msgId);
      }
      console.log('[send-email] send_booking_inquiry: completed OK (HTTP', sgStatus, ')');

      return jsonResponse({ success: true, sent: true });
    }

    // ─── STUB: other actions (get_preferences, get_email_logs, etc.) ───
    if (action === 'get_preferences') {
      return jsonResponse({ preferences: { pass_purchase: true, business_approval: true, new_review: true, marketing: false, weekly_digest: true } });
    }
    if (action === 'get_email_logs') {
      return jsonResponse({ logs: [], total: 0 });
    }
    if (action === 'get_email_stats') {
      return jsonResponse({ stats: { sent: 0, failed: 0 } });
    }
    if (action === 'get_templates') {
      return jsonResponse({ templates: [] });
    }
    if (action === 'update_preferences' || action === 'update_template') {
      return jsonResponse({ success: true });
    }

    return errorResponse('Unknown action: ' + action);
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    const logMsg = `[send-email] Caught error: ${errMessage}`;
    console.error(logMsg);
    if (err instanceof Error && err.stack) {
      console.error('[send-email] Stack:', err.stack);
    }
    return jsonResponse(
      { success: false, error: errMessage || 'Internal server error' },
      500
    );
  }
});

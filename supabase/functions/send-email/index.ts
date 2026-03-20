// deno-lint-ignore-file no-explicit-any
/**
 * send-email Edge Function
 * Handles email notifications via SendGrid.
 * Required secrets (Supabase → Project Settings → Edge Functions → Secrets):
 *   SENDGRID_API_KEY — your SendGrid API key
 * Optional (defaults shown):
 *   SENDGRID_FROM_EMAIL — default no-reply@stikmnek.com (must be verified in SendGrid)
 *   SENDGRID_FROM_NAME — default "StikmNek"
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

/** StikmNek branded pass names (DB keys: daily | weekly | monthly — never show raw keys to users). */
function passTypeToBrandDisplay(passType: unknown): string {
  const t = String(passType ?? '').toLowerCase().trim();
  if (t === 'daily') return 'Family Explorer Pass';
  if (t === 'weekly') return 'Extended Group Adventure Pass';
  if (t === 'monthly') return 'Ultimate Crew Experience Pass';
  return 'StikmNek Pass';
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
      const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 12px;">Thanks for your purchase!</h2>
      <p style="margin: 0 0 12px;">Your pass is now active.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
        <tr><td style="padding: 6px 0; color: #555;">Receipt</td><td style="padding: 6px 0; font-weight: 700;">${receipt_number || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: #555;">Pass</td><td style="padding: 6px 0; font-weight: 700;">${passLabel}</td></tr>
        <tr><td style="padding: 6px 0; color: #555;">Valid from</td><td style="padding: 6px 0;">${valid_from || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: #555;">Valid until</td><td style="padding: 6px 0;">${valid_until || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: #555;">Amount</td><td style="padding: 6px 0; font-weight: 700;">${currency || 'AUD'} ${typeof amount === 'number' ? amount.toFixed(2) : amount ?? '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: #555;">Payment</td><td style="padding: 6px 0;">${payment_method || '—'}</td></tr>
      </table>
      <p style="margin: 16px 0 0; color: #555; font-size: 12px;">If you have any issues, reply to this email and we'll help.</p>
    </div>
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

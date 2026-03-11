// deno-lint-ignore-file no-explicit-any
/**
 * send-email Edge Function
 * Handles email notifications via SendGrid.
 * Requires: SendGrid API key (set SENDGRID_API_KEY in Supabase secrets)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

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
            email: Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@stikmnek.com',
            name: Deno.env.get('SENDGRID_FROM_NAME') || 'StikmNek',
          },
          subject,
          content: [{ type: 'text/html', value: html }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[send-email] SendGrid error:', res.status, errText);
        return errorResponse(`SendGrid error: ${res.status}`, 500);
      }

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
  } catch (err) {
    console.error('[send-email] error:', err);
    return errorResponse((err as Error).message, 500);
  }
});

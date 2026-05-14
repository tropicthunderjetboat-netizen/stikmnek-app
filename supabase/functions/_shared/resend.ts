/**
 * Resend API (https://resend.com/docs/api-reference/emails/send-email)
 * Used by send-email, manage-business, and paypal-capture Edge Functions.
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY — required to send mail
 * Optional (defaults below; SENDGRID_* still read for one-step migration):
 *   RESEND_FROM_EMAIL — default no-reply@stikmnek.com (or SENDGRID_FROM_EMAIL)
 *   RESEND_FROM_NAME — default StikmNek (or SENDGRID_FROM_NAME)
 *
 * Optional Resend Dashboard templates (published template id or alias).
 * When set, the matching send uses the template API instead of inline HTML.
 * See repo file `supabase/resend-templates.md` for variable names per template.
 *   RESEND_TEMPLATE_PASS_CONFIRMATION
 *   RESEND_TEMPLATE_BOOKING_INQUIRY
 *   RESEND_TEMPLATE_PAYPAL_RECEIPT
 *   RESEND_TEMPLATE_LISTING_LIVE
 *   RESEND_TEMPLATE_BUSINESS_APPROVED
 *   RESEND_TEMPLATE_BUSINESS_REJECTED
 */

export function getResendApiKey(): string | null {
  const k = Deno.env.get('RESEND_API_KEY')?.trim();
  return k || null;
}

/** Resend `from` must be `Name <email@domain.com>` or a verified domain address. */
export function getTransactionalFromHeader(): string {
  const email = (
    Deno.env.get('RESEND_FROM_EMAIL')?.trim() ||
    Deno.env.get('SENDGRID_FROM_EMAIL')?.trim() ||
    'no-reply@stikmnek.com'
  );
  const name = (
    Deno.env.get('RESEND_FROM_NAME')?.trim() ||
    Deno.env.get('SENDGRID_FROM_NAME')?.trim() ||
    'StikmNek'
  );
  return `${name} <${email}>`;
}

export function parseResendErrorMessage(status: number, errText: string): string {
  try {
    const parsed = JSON.parse(errText) as { message?: string; name?: string };
    if (parsed?.message && typeof parsed.message === 'string') return parsed.message.trim();
  } catch {
    /* ignore */
  }
  if (status === 401 || status === 403) {
    return 'Resend rejected the request (check RESEND_API_KEY).';
  }
  if (status === 422 || status === 400) {
    return 'Resend rejected the request (verify domain + from address, and check recipient).';
  }
  return `Email could not be sent (Resend HTTP ${status}).`;
}

export type ResendTemplatePayload = {
  /** Published template id or alias from Resend dashboard */
  id: string;
  /** Keys must match variables defined on the template (see resend-templates.md). */
  variables: Record<string, unknown>;
};

export type ResendMailInput = {
  to: string | string[];
  subject: string;
  /** Inline HTML body; omit when using `template` (Resend forbids mixing). */
  html?: string;
  text?: string;
  template?: ResendTemplatePayload;
  bcc?: string[];
  replyTo?: { email: string; name?: string };
};

export type ResendSendResult = {
  ok: boolean;
  status: number;
  body: string;
  id?: string;
};

/** Normalize template variables for Resend (strings + finite numbers). */
export function resendTemplateVariables(
  vars: Record<string, unknown>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (v === null || v === undefined) {
      out[k] = '';
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === 'boolean') {
      out[k] = v ? 'true' : 'false';
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export async function sendResendEmail(input: ResendMailInput): Promise<ResendSendResult> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, body: 'RESEND_API_KEY not set' };
  }

  const useTemplate = Boolean(input.template?.id?.trim());
  if (useTemplate && (input.html || input.text)) {
    return {
      ok: false,
      status: 0,
      body: 'Invalid Resend payload: cannot mix template with html/text',
    };
  }
  if (!useTemplate && !input.html) {
    return { ok: false, status: 0, body: 'Missing html (or template with id)' };
  }

  const to = Array.isArray(input.to) ? input.to : [input.to];
  const payload: Record<string, unknown> = {
    from: getTransactionalFromHeader(),
    to,
    subject: input.subject,
  };
  if (useTemplate && input.template) {
    payload.template = {
      id: input.template.id.trim(),
      variables: resendTemplateVariables(input.template.variables),
    };
  } else {
    payload.html = input.html;
    if (input.text) payload.text = input.text;
  }
  if (input.bcc?.length) payload.bcc = input.bcc;
  if (input.replyTo?.email?.trim()) {
    const e = input.replyTo.email.trim();
    const n = input.replyTo.name?.trim();
    payload.reply_to = n ? `${n} <${e}>` : e;
  }

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: msg };
  }

  const body = await res.text();
  let id: string | undefined;
  if (res.ok) {
    try {
      const j = JSON.parse(body) as { id?: string };
      id = typeof j?.id === 'string' ? j.id : undefined;
    } catch {
      /* ignore */
    }
  }
  return { ok: res.ok, status: res.status, body, id };
}

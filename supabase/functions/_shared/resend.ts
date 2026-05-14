/**
 * Resend API (https://resend.com/docs/api-reference/emails/send-email)
 * Used by send-email, manage-business, and paypal-capture Edge Functions.
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY — required to send mail
 * Optional (defaults below; SENDGRID_* still read for one-step migration):
 *   RESEND_FROM_EMAIL — default no-reply@stikmnek.com (or SENDGRID_FROM_EMAIL)
 *   RESEND_FROM_NAME — default StikmNek (or SENDGRID_FROM_NAME)
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

export type ResendMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  bcc?: string[];
  replyTo?: { email: string; name?: string };
};

export type ResendSendResult = {
  ok: boolean;
  status: number;
  body: string;
  id?: string;
};

export async function sendResendEmail(input: ResendMailInput): Promise<ResendSendResult> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, body: 'RESEND_API_KEY not set' };
  }

  const to = Array.isArray(input.to) ? input.to : [input.to];
  const payload: Record<string, unknown> = {
    from: getTransactionalFromHeader(),
    to,
    subject: input.subject,
    html: input.html,
  };
  if (input.text) payload.text = input.text;
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

/**
 * Ops notification when a tourist pass is purchased (PayPal or legacy card flow).
 *
 * Supabase secret (optional):
 *   PURCHASE_NOTIFY_EMAILS — comma-separated inboxes (e.g. stikmnek@gmail.com,ops@example.com)
 * If unset, defaults to stikmnek@gmail.com.
 *
 * Best-effort: never fails the purchase if notify fails.
 */
import { getResendApiKey, sendResendEmail } from './resend.ts';

const DEFAULT_NOTIFY = 'stikmnek@gmail.com';

export function getPurchaseNotifyEmails(): string[] {
  const raw = (Deno.env.get('PURCHASE_NOTIFY_EMAILS') ?? '').trim();
  const parts = raw
    ? raw.split(',').map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'))
    : [DEFAULT_NOTIFY];
  return [...new Set(parts)];
}

export type PassPurchaseNotifyParams = {
  receiptNumber: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  buyerEmail: string | null;
  validFrom: string;
  validUntil: string;
  partySize?: number;
  userId?: string;
};

export async function notifyAdminsOfPassPurchase(
  params: PassPurchaseNotifyParams,
): Promise<{ sent: boolean; skipped?: boolean; error?: string; recipients?: string[] }> {
  const recipients = getPurchaseNotifyEmails();
  if (recipients.length === 0) {
    return { sent: false, skipped: true, error: 'No notify recipients' };
  }
  if (!getResendApiKey()) {
    console.warn('[purchaseNotify] RESEND_API_KEY not set — skipping admin purchase notify');
    return { sent: false, skipped: true, error: 'RESEND_API_KEY not set' };
  }

  const buyer = (params.buyerEmail ?? '').trim() || '(no email on account)';
  const amountLine = `${params.currency} ${params.amount.toFixed(2)}`;
  const partyRow = params.partySize != null
    ? `<tr><td style="padding:6px 0;color:#555;">Party size</td><td style="padding:6px 0;">${params.partySize}</td></tr>`
    : '';
  const userRow = params.userId
    ? `<tr><td style="padding:6px 0;color:#555;">User id</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${params.userId}</td></tr>`
    : '';

  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;">',
    '<h2 style="margin:0 0 12px;">New StikmNek pass purchase</h2>',
    '<table style="border-collapse:collapse;width:100%;">',
    `<tr><td style="padding:6px 0;color:#555;">Receipt</td><td style="padding:6px 0;font-weight:700;">${params.receiptNumber}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#555;">Amount</td><td style="padding:6px 0;font-weight:700;">${amountLine}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#555;">Payment</td><td style="padding:6px 0;">${params.paymentMethod}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#555;">Buyer email</td><td style="padding:6px 0;">${buyer}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#555;">Valid from</td><td style="padding:6px 0;">${params.validFrom}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#555;">Valid until</td><td style="padding:6px 0;">${params.validUntil}</td></tr>`,
    partyRow,
    userRow,
    '</table>',
    '<p style="margin:16px 0 0;color:#555;font-size:12px;">Automated ops notification from StikmNek.</p>',
    '</div>',
  ].join('');

  const text = [
    'New StikmNek pass purchase',
    `Receipt: ${params.receiptNumber}`,
    `Amount: ${amountLine}`,
    `Payment: ${params.paymentMethod}`,
    `Buyer: ${buyer}`,
    `Valid: ${params.validFrom} → ${params.validUntil}`,
    params.partySize != null ? `Party size: ${params.partySize}` : '',
    params.userId ? `User id: ${params.userId}` : '',
  ].filter(Boolean).join('\n');

  const res = await sendResendEmail({
    to: recipients.length === 1 ? recipients[0]! : recipients,
    subject: `[StikmNek] New pass purchase — ${params.receiptNumber}`,
    html,
    text,
  });

  if (!res.ok) {
    console.error('[purchaseNotify] Resend error:', res.status, res.body);
    return { sent: false, error: res.body, recipients };
  }

  console.log('[purchaseNotify] sent to', recipients.join(', '));
  return { sent: true, recipients };
}

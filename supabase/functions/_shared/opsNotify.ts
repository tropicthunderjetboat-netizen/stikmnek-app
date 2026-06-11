/**
 * Ops inbox list for automated admin alerts (deal expiry, etc.).
 *
 * Supabase secrets (optional):
 *   OPS_NOTIFY_EMAILS — comma-separated inboxes for ops alerts
 *   PURCHASE_NOTIFY_EMAILS — fallback if OPS_NOTIFY_EMAILS unset
 * Default: stikmnek@gmail.com
 */
import { getResendApiKey, sendResendEmail } from './resend.ts';

const DEFAULT_NOTIFY = 'stikmnek@gmail.com';

export function getOpsNotifyEmails(): string[] {
  const ops = (Deno.env.get('OPS_NOTIFY_EMAILS') ?? '').trim();
  const purchase = (Deno.env.get('PURCHASE_NOTIFY_EMAILS') ?? '').trim();
  const raw = ops || purchase;
  const parts = raw
    ? raw.split(',').map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'))
    : [DEFAULT_NOTIFY];
  return [...new Set(parts)];
}

export type ExpiringDealRow = {
  offeringId: string;
  dealTitle: string;
  businessName: string;
  expiresOn: string;
  daysRemaining: number;
  phone: string;
  whatsapp: string;
  ownerEmail: string;
  ownerName: string;
};

function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export async function notifyOpsOfExpiringDeals(
  deals: ExpiringDealRow[],
  windowDays: number,
): Promise<{ sent: boolean; skipped?: boolean; error?: string; recipients?: string[] }> {
  if (deals.length === 0) {
    return { sent: false, skipped: true, error: 'No expiring deals' };
  }

  const recipients = getOpsNotifyEmails();
  if (recipients.length === 0) {
    return { sent: false, skipped: true, error: 'No notify recipients' };
  }
  if (!getResendApiKey()) {
    console.warn('[opsNotify] RESEND_API_KEY not set — skipping expiring-deals notify');
    return { sent: false, skipped: true, error: 'RESEND_API_KEY not set' };
  }

  const todayLabel = formatDateLabel(new Date().toISOString().slice(0, 10));
  const urgent = deals.filter((d) => d.daysRemaining <= 1).length;
  const subject = urgent > 0
    ? `[StikmNek] ${deals.length} deal${deals.length === 1 ? '' : 's'} expiring soon (${urgent} within 24h) — ${todayLabel}`
    : `[StikmNek] ${deals.length} business deal${deals.length === 1 ? '' : 's'} expiring in ${windowDays} days — ${todayLabel}`;

  const rowsHtml = deals.map((d) => {
    const urgency = d.daysRemaining <= 1
      ? '<strong style="color:#b45309;">Today / tomorrow</strong>'
      : `${d.daysRemaining} day${d.daysRemaining === 1 ? '' : 's'}`;
    return [
      '<tr>',
      `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(d.businessName)}</td>`,
      `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(d.dealTitle)}</td>`,
      `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${formatDateLabel(d.expiresOn)}</td>`,
      `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${urgency}</td>`,
      `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(d.ownerName || '—')}</td>`,
      `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(d.ownerEmail || '—')}</td>`,
      `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(d.phone || d.whatsapp || '—')}</td>`,
      '</tr>',
    ].join('');
  }).join('');

  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:720px;">',
    `<h2 style="margin:0 0 8px;">Business deals expiring soon</h2>`,
    `<p style="margin:0 0 16px;color:#475569;">`,
    `${deals.length} active deal${deals.length === 1 ? '' : 's'} `,
    `expire within the next ${windowDays} days. Contact these businesses to renew or extend their StikmNek discount.`,
    `</p>`,
    '<table style="border-collapse:collapse;width:100%;font-size:13px;">',
    '<thead><tr style="background:#f0fdfa;text-align:left;">',
    '<th style="padding:8px 10px;">Business</th>',
    '<th style="padding:8px 10px;">Deal</th>',
    '<th style="padding:8px 10px;">Expires</th>',
    '<th style="padding:8px 10px;">Left</th>',
    '<th style="padding:8px 10px;">Owner</th>',
    '<th style="padding:8px 10px;">Email</th>',
    '<th style="padding:8px 10px;">Phone</th>',
    '</tr></thead>',
    `<tbody>${rowsHtml}</tbody>`,
    '</table>',
    '<p style="margin:16px 0 0;color:#64748b;font-size:12px;">',
    'Automated daily digest from StikmNek. Review listings in the Admin panel.',
    '</p>',
    '</div>',
  ].join('');

  const textLines = [
    `Business deals expiring within ${windowDays} days (${todayLabel})`,
    '',
    ...deals.map((d) => [
      d.businessName,
      `  Deal: ${d.dealTitle}`,
      `  Expires: ${d.expiresOn} (${d.daysRemaining}d left)`,
      `  Owner: ${d.ownerName || '—'} <${d.ownerEmail || '—'}>`,
      `  Phone: ${d.phone || d.whatsapp || '—'}`,
      '',
    ].join('\n')),
  ];

  const res = await sendResendEmail({
    to: recipients.length === 1 ? recipients[0]! : recipients,
    subject,
    html,
    text: textLines.join('\n'),
  });

  if (!res.ok) {
    console.error('[opsNotify] Resend error:', res.status, res.body);
    return { sent: false, error: res.body, recipients };
  }

  console.log('[opsNotify] expiring-deals digest sent to', recipients.join(', '));
  return { sent: true, recipients };
}

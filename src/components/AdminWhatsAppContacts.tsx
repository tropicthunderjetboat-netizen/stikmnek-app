import React, { useMemo, useState } from 'react';
import { Download, MessageCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { normalizeWhatsAppForExport, whatsAppChatUrl } from '@/lib/phoneUtils';

export type BusinessWhatsAppContact = {
  business_id: string;
  owner_id: string;
  business_name: string;
  owner_name: string | null;
  owner_email: string | null;
  business_phone: string | null;
  whatsapp_number: string | null;
  whatsapp_marketing_opt_in: boolean;
  whatsapp_marketing_opt_in_at: string | null;
  onboarding_complete: boolean;
  listing_status: string;
  location: string | null;
  category: string | null;
  profile_created_at: string;
};

type AdminWhatsAppContactsProps = {
  contacts: BusinessWhatsAppContact[];
  loading: boolean;
  onRefresh: () => void;
};

const LISTING_STATUS_LABELS: Record<string, string> = {
  live: 'Live listing',
  pending_review: 'Pending review',
  listing_inactive: 'Listing inactive',
  no_listing: 'No listing yet',
};

function csvEscape(value: string): string {
  return `"${(value || '').replace(/"/g, '""')}"`;
}

function buildContactsCsv(rows: BusinessWhatsAppContact[]): string {
  const headers = [
    'Owner Name',
    'Business Name',
    'WhatsApp',
    'Phone',
    'Email',
    'WhatsApp Opt-in',
    'Listing Status',
    'Category',
    'Location',
    'Profile Created',
    'wa.me Link',
  ];
  const lines = rows.map((r) => {
    const wa = normalizeWhatsAppForExport(r.whatsapp_number || '');
    return [
      csvEscape(r.owner_name || ''),
      csvEscape(r.business_name || ''),
      csvEscape(wa),
      csvEscape(r.business_phone || ''),
      csvEscape(r.owner_email || ''),
      r.whatsapp_marketing_opt_in ? 'yes' : 'no',
      csvEscape(LISTING_STATUS_LABELS[r.listing_status] || r.listing_status),
      csvEscape(r.category || ''),
      csvEscape(r.location || ''),
      csvEscape(new Date(r.profile_created_at).toISOString().split('T')[0]),
      csvEscape(whatsAppChatUrl(r.whatsapp_number || '')),
    ].join(',');
  });
  return [headers.join(','), ...lines].join('\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const AdminWhatsAppContacts: React.FC<AdminWhatsAppContactsProps> = ({
  contacts,
  loading,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<'opt_in' | 'all' | 'no_listing' | 'phone_only'>('all');

  const filtered = useMemo(() => {
    if (filter === 'opt_in') {
      return contacts.filter((c) => c.whatsapp_marketing_opt_in && (c.whatsapp_number || '').trim());
    }
    if (filter === 'no_listing') {
      return contacts.filter((c) => c.listing_status === 'no_listing' && (c.whatsapp_number || '').trim());
    }
    if (filter === 'phone_only') {
      return contacts.filter(
        (c) => !(c.whatsapp_number || '').trim() && (c.business_phone || '').trim(),
      );
    }
    return contacts.filter((c) => (c.whatsapp_number || '').trim());
  }, [contacts, filter]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error('No contacts to export for this filter.');
      return;
    }
    const date = new Date().toISOString().split('T')[0];
    downloadCsv(`stikmnek_whatsapp_contacts_${filter}_${date}.csv`, buildContactsCsv(filtered));
    toast.success(`Exported ${filtered.length} contact(s) for WhatsApp outreach.`);
  };

  return (
    <div className="mb-6 rounded-xl border border-green-200 bg-green-50/50 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-green-200/80 bg-green-100/40">
        <div>
          <h3 className="text-sm font-bold text-green-950 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" aria-hidden />
            WhatsApp business contacts
          </h3>
          <p className="text-xs text-green-900/80 mt-0.5 max-w-2xl">
            Opt-in is a separate checkbox (education tips), not “has a WhatsApp on the listing”.
            Most field/admin-onboarded partners never saw that box — use <strong>All with WhatsApp</strong> to
            reach them. Opted in: {contacts.filter((c) => c.whatsapp_marketing_opt_in).length} · With
            WhatsApp: {contacts.filter((c) => (c.whatsapp_number || '').trim()).length} · Total:{' '}
            {contacts.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-green-200 bg-white text-green-900"
          >
            <option value="opt_in">Opted in only</option>
            <option value="no_listing">No listing yet</option>
            <option value="all">All with WhatsApp</option>
            <option value="phone_only">Phone/email only (no WhatsApp)</option>
          </select>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-green-200 text-green-900 text-xs font-semibold hover:bg-green-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-semibold hover:bg-green-800 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {loading && contacts.length === 0 ? (
        <p className="px-4 py-6 text-sm text-green-900 text-center">Loading contacts…</p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-6 text-sm text-green-800 text-center">
          No contacts match this filter yet. New business profiles with WhatsApp opt-in will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/60 text-green-900 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 font-semibold">Owner</th>
                <th className="px-4 py-2 font-semibold">Business</th>
                <th className="px-4 py-2 font-semibold">WhatsApp</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Opt-in</th>
                <th className="px-4 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-green-100 bg-white/30">
              {filtered.slice(0, 25).map((c) => {
                const wa = normalizeWhatsAppForExport(c.whatsapp_number || '');
                const chatUrl = whatsAppChatUrl(c.whatsapp_number || '');
                return (
                  <tr key={c.business_id}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-gray-900">{c.owner_name || '—'}</p>
                      <p className="text-gray-500 truncate max-w-[140px]">{c.owner_email || ''}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{c.business_name}</p>
                      <p className="text-gray-500 capitalize">{c.category || ''}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-800">{wa || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                        {LISTING_STATUS_LABELS[c.listing_status] || c.listing_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.whatsapp_marketing_opt_in ? (
                        <span className="text-green-700 font-semibold">Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {chatUrl ? (
                        <a
                          href={chatUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-green-700 font-semibold hover:underline"
                        >
                          Chat <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 25 && (
            <p className="px-4 py-2 text-[11px] text-green-800 border-t border-green-100">
              Showing 25 of {filtered.length} — export CSV for the full list.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export async function fetchBusinessWhatsAppContactsForAdmin(): Promise<BusinessWhatsAppContact[]> {
  const { data, error } = await supabase.rpc('get_business_whatsapp_contacts_for_admin');
  if (error) throw error;
  return (data || []) as BusinessWhatsAppContact[];
}

export default AdminWhatsAppContacts;

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Download,
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { normalizeWhatsAppForExport, whatsAppChatUrl } from '@/lib/phoneUtils';
import { formatVT } from '@/lib/utils';
import DealReactivateControl from '@/components/DealReactivateControl';

export type ExpiredBusinessListing = {
  offering_id: string;
  business_id: string;
  listing_title: string;
  category: string;
  discount: string;
  original_price: number;
  deal_price: number;
  discount_valid_from: string | null;
  discount_valid_until: string;
  days_expired: number;
  offering_active: boolean;
  business_name: string;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  business_phone: string | null;
  whatsapp_number: string | null;
  whatsapp_marketing_opt_in: boolean;
  location: string | null;
  profile_created_at: string;
};

type AdminExpiredListingsProps = {
  listings: ExpiredBusinessListing[];
  loading: boolean;
  onRefresh: () => void;
  onReactivated?: () => void;
  onGoToBusiness?: (businessId: string, businessName: string) => void;
};

function csvEscape(value: string): string {
  return `"${(value || '').replace(/"/g, '""')}"`;
}

function buildExpiredCsv(rows: ExpiredBusinessListing[]): string {
  const headers = [
    'Business Name',
    'Listing Title',
    'Category',
    'Expired On',
    'Days Expired',
    'Discount',
    'Deal Price (VT)',
    'Owner Name',
    'Email',
    'Phone',
    'WhatsApp',
    'WhatsApp Opt-in',
    'Location',
    'wa.me Link',
  ];
  const lines = rows.map((r) => {
    const wa = normalizeWhatsAppForExport(r.whatsapp_number || '');
    return [
      csvEscape(r.business_name || ''),
      csvEscape(r.listing_title || ''),
      csvEscape(r.category || ''),
      csvEscape(String(r.discount_valid_until || '').slice(0, 10)),
      String(r.days_expired ?? ''),
      csvEscape(r.discount || ''),
      String(r.deal_price ?? ''),
      csvEscape(r.owner_name || ''),
      csvEscape(r.owner_email || ''),
      csvEscape(r.business_phone || ''),
      csvEscape(wa),
      r.whatsapp_marketing_opt_in ? 'yes' : 'no',
      csvEscape(r.location || ''),
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

function formatExpiryDate(iso: string): string {
  const d = String(iso || '').slice(0, 10);
  if (!d) return '—';
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Offerings past `discount_valid_until` — hidden from tourists until renewed.
 * Admins use this list to contact owners about extending or replacing deals.
 */
const AdminExpiredListings: React.FC<AdminExpiredListingsProps> = ({
  listings,
  loading,
  onRefresh,
  onReactivated,
  onGoToBusiness,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...listings].sort((a, b) => {
        const untilCmp = String(a.discount_valid_until).localeCompare(String(b.discount_valid_until));
        if (untilCmp !== 0) return untilCmp;
        return (a.business_name || '').localeCompare(b.business_name || '');
      }),
    [listings],
  );

  const handleExport = () => {
    if (sorted.length === 0) {
      toast.error('No expired listings to export.');
      return;
    }
    const date = new Date().toISOString().split('T')[0];
    downloadCsv(`stikmnek_expired_listings_${date}.csv`, buildExpiredCsv(sorted));
    toast.success(`Exported ${sorted.length} expired listing(s) for outreach.`);
  };

  if (!loading && sorted.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-red-200 bg-red-50/50 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-red-200/80 bg-red-100/40">
        <div>
          <h3 className="text-sm font-bold text-red-950 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" aria-hidden />
            Expired listings — contact to renew
            {!loading && sorted.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold">
                {sorted.length}
              </span>
            )}
          </h3>
          <p className="text-xs text-red-900/80 mt-0.5 max-w-3xl">
            These deals are past their end date and hidden from tourists. Reach out on WhatsApp or email
            to ask the owner to renew the same deal or submit a new one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || sorted.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-900 text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-900 text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && sorted.length === 0 ? (
        <p className="px-4 py-6 text-sm text-red-900 text-center">Loading expired listings…</p>
      ) : (
        <ul className="divide-y divide-red-100">
          {sorted.map((row) => {
            const waUrl = whatsAppChatUrl(row.whatsapp_number || '');
            const expanded = expandedId === row.offering_id;
            return (
              <li key={row.offering_id} className="px-4 py-3 bg-white/50">
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{row.listing_title}</p>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-[10px] font-bold text-red-700 uppercase">
                        Expired
                      </span>
                      {row.discount && (
                        <span className="text-[11px] font-bold text-orange-600">{row.discount}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {row.business_name}
                      {row.category ? ` · ${row.category}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1 text-red-800 font-medium">
                        <Calendar className="w-3.5 h-3.5" aria-hidden />
                        Ended {formatExpiryDate(row.discount_valid_until)}
                        {row.days_expired > 0
                          ? ` (${row.days_expired} day${row.days_expired === 1 ? '' : 's'} ago)`
                          : ''}
                      </span>
                      {row.deal_price > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5" aria-hidden />
                          {formatVT(row.deal_price)}
                          {row.original_price > row.deal_price && (
                            <span className="text-gray-400 line-through ml-1">
                              {formatVT(row.original_price)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                      {(row.owner_email) && (
                        <a
                          href={`mailto:${row.owner_email}`}
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                        >
                          <Mail className="w-3.5 h-3.5" aria-hidden />
                          {row.owner_email}
                        </a>
                      )}
                      {row.business_phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" aria-hidden />
                          {row.business_phone}
                        </span>
                      )}
                      {row.whatsapp_number ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-green-700 font-medium hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" aria-hidden />
                          {normalizeWhatsAppForExport(row.whatsapp_number)}
                          {row.whatsapp_marketing_opt_in ? ' · tips OK' : ''}
                          <ExternalLink className="w-3 h-3 opacity-60" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-gray-400">No WhatsApp on file</span>
                      )}
                      {row.owner_name && (
                        <span className="text-gray-500">Owner: {row.owner_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {onGoToBusiness && (
                      <button
                        type="button"
                        onClick={() => onGoToBusiness(row.business_id, row.business_name)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50"
                      >
                        Find in list
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expanded ? null : row.offering_id)
                      }
                      className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100"
                    >
                      {expanded ? 'Hide renew' : 'Renew deal'}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900 mb-2">
                      Set a new end date to turn this listing back on for tourists.
                    </p>
                    <DealReactivateControl
                      compact
                      businessId={row.business_id}
                      offeringId={row.offering_id}
                      currentValidUntil={row.discount_valid_until}
                      onReactivated={() => {
                        onReactivated?.();
                        setExpandedId(null);
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export async function fetchExpiredBusinessListingsForAdmin(): Promise<ExpiredBusinessListing[]> {
  const { data, error } = await supabase.rpc('get_expired_business_listings_for_admin');
  if (error) throw error;
  return (data || []) as ExpiredBusinessListing[];
}

export default AdminExpiredListings;

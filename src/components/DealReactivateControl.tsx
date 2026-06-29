import React, { useState } from 'react';
import { supabase, getEdgeAuthHeaders } from '@/lib/supabase';
import { toast } from 'sonner';
import { Power, Loader2, Calendar } from 'lucide-react';

interface DealReactivateControlProps {
  /** `public.businesses.id` — the master profile that owns the offering. */
  businessId: string;
  /** `business_offerings.id` — the specific deal to reactivate. */
  offeringId: string;
  /** Current `discount_valid_until` (YYYY-MM-DD), shown for context. */
  currentValidUntil?: string | null;
  /** Called after a successful reactivation with the new end date. */
  onReactivated?: (newValidUntil: string) => void;
  /** Compact layout for tight rows (e.g. admin deal list). */
  compact?: boolean;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Default reset: 30 days from today. */
function defaultNewExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return toDateOnly(d);
}

function tomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return toDateOnly(d);
}

/**
 * Turn an expired (hidden) deal back on by resetting its expiry date to a future
 * day. Calls the `reactivate_offering` edge action (owner- or admin-authorized),
 * which updates `discount_valid_until` and sets the offering + business `active`.
 */
const DealReactivateControl: React.FC<DealReactivateControlProps> = ({
  businessId,
  offeringId,
  currentValidUntil,
  onReactivated,
  compact = false,
}) => {
  const [newDate, setNewDate] = useState<string>(defaultNewExpiry());
  const [submitting, setSubmitting] = useState(false);

  const minDate = tomorrow();

  const handleReactivate = async () => {
    const until = String(newDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= toDateOnly(new Date())) {
      toast.error('Pick a future expiry date first.');
      return;
    }
    if (!businessId) {
      toast.error('Missing business reference for this deal.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: res, error: invokeErr } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'reactivate_offering',
          businessId,
          offeringId,
          discountValidUntil: until,
        },
      });
      const payload = res as { success?: boolean; error?: string; discountValidUntil?: string } | null;
      if (invokeErr) throw invokeErr;
      if (payload?.error) throw new Error(payload.error);
      if (payload?.success === false) throw new Error('Could not reactivate this deal.');

      toast.success('Deal turned back on and visible to tourists again.');
      onReactivated?.(payload?.discountValidUntil || until);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate deal';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`flex ${compact ? 'flex-wrap items-center gap-2' : 'flex-col sm:flex-row sm:items-end gap-3'}`}
    >
      <div className={compact ? '' : 'flex-1'}>
        <label className="block text-[11px] font-semibold text-gray-500 mb-1 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          New expiry date
        </label>
        <input
          type="date"
          value={newDate}
          min={minDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        />
        {currentValidUntil && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            Expired on {new Date(String(currentValidUntil).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleReactivate}
        disabled={submitting}
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60"
      >
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
        Turn On Deal
      </button>
    </div>
  );
};

export default DealReactivateControl;

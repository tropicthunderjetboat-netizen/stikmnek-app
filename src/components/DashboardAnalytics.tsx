import React, { useEffect, useMemo, useState } from 'react';
import type { Business } from '@/data/businesses';
import { effectiveProfileBusinessId } from '@/lib/businessOfferingMap';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { Eye, Heart, Loader2, Percent } from 'lucide-react';

interface DashboardAnalyticsProps {
  selectedBusiness: Business;
}

type AnalyticsResponse = {
  redemptionCount: number;
  viewCount?: number;
};

/**
 * Simple business stats — no charts, no redemption savings tracker.
 */
const DashboardAnalytics: React.FC<DashboardAnalyticsProps> = ({ selectedBusiness }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  const profileId = useMemo(() => effectiveProfileBusinessId(selectedBusiness as any), [selectedBusiness]);
  const offeringId = useMemo(() => {
    const id = String((selectedBusiness as any)?.id ?? '').trim();
    if (!id) return null;
    return id !== String(profileId) ? id : null;
  }, [selectedBusiness, profileId]);

  const discountPercent = useMemo(() => {
    const orig = Number((selectedBusiness as any)?.originalPrice) || 0;
    const deal = Number((selectedBusiness as any)?.dealPrice) || 0;
    if (orig > 0 && deal > 0 && deal < orig) {
      return Math.round(((orig - deal) / orig) * 100);
    }
    return 20;
  }, [selectedBusiness]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await getEdgeAuthHeaders();
        const { data, error: invokeError } = await supabase.functions.invoke('manage-business', {
          headers,
          body: { action: 'get_analytics', businessId: profileId, offeringId, rangeDays: 30 },
        });
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(String(data.error));
        if (!cancelled) {
          setAnalytics({
            redemptionCount: Number(data?.redemptionCount) || 0,
            viewCount: Number(data?.viewCount) || 0,
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, offeringId]);

  const travelers = analytics?.redemptionCount ?? 0;
  const views = analytics?.viewCount ?? 0;

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-gray-900">Your stats</h2>
        {loading ? (
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="text-xs text-red-600">{error}</div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Heart className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 tabular-nums">{travelers}</p>
            <p className="text-sm text-gray-600">travelers saved you</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <Eye className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 tabular-nums">{views}</p>
            <p className="text-sm text-gray-600">viewed your page</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Percent className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-amber-950">
            Your offer: Save {discountPercent}% with Pass
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardAnalytics;

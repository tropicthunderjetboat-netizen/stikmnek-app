import React, { useEffect, useMemo, useState } from 'react';
import type { Business } from '@/data/businesses';
import { effectiveProfileBusinessId } from '@/lib/businessOfferingMap';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { BarChart3, DollarSign, Loader2, ShoppingBag, Sparkles, Star } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface DashboardAnalyticsProps {
  selectedBusiness: Business;
}

type AnalyticsResponse = {
  reviewCount: number;
  superStarCount: number;
  redemptionCount: number;
  totalDealAmount: number;
  avgDealPerRedemption: number;
  redemptionsMissingDealAmount: number;
  avgRating: number;
  redemptionsByDay: { date: string; count: number; saved: number; deal?: number }[];
  viewCount?: number;
  clickCount?: number;
  requestBookingTapCount?: number;
  whatsappTapCount?: number;
  eventsByDay?: { date: string; views: number; clicks: number; requestBookings: number; whatsappTaps: number }[];
};

const DashboardAnalytics: React.FC<DashboardAnalyticsProps> = ({ selectedBusiness }) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  const rangeDays = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;
  const profileId = useMemo(() => effectiveProfileBusinessId(selectedBusiness as any), [selectedBusiness]);
  const offeringId = useMemo(() => {
    const id = String((selectedBusiness as any)?.id ?? '').trim();
    if (!id) return null;
    // If this row represents a specific listing/offering, `id` differs from the profile business id.
    return id !== String(profileId) ? id : null;
  }, [selectedBusiness, profileId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await getEdgeAuthHeaders();
        const { data, error: invokeError } = await supabase.functions.invoke('manage-business', {
          headers,
          body: { action: 'get_analytics', businessId: profileId, offeringId, rangeDays },
        });
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(String(data.error));
        if (!cancelled) {
          setAnalytics({
            reviewCount: Number(data?.reviewCount) || 0,
            superStarCount: Number(data?.superStarCount) || 0,
            redemptionCount: Number(data?.redemptionCount) || 0,
            totalDealAmount: Number(data?.totalDealAmount) || 0,
            avgDealPerRedemption: Number(data?.avgDealPerRedemption) || 0,
            redemptionsMissingDealAmount: Number(data?.redemptionsMissingDealAmount) || 0,
            avgRating: Number(data?.avgRating) || 0,
            redemptionsByDay: Array.isArray(data?.redemptionsByDay) ? data.redemptionsByDay : [],
            viewCount: Number(data?.viewCount) || 0,
            clickCount: Number(data?.clickCount) || 0,
            requestBookingTapCount: Number(data?.requestBookingTapCount) || 0,
            whatsappTapCount: Number(data?.whatsappTapCount) || 0,
            eventsByDay: Array.isArray(data?.eventsByDay) ? data.eventsByDay : [],
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, offeringId, rangeDays]);

  const redemptionCount = analytics?.redemptionCount ?? 0;
  const totalDealAmount = analytics?.totalDealAmount ?? 0;
  const avgDealPerRedemption = analytics?.avgDealPerRedemption ?? 0;
  const redemptionsMissingDealAmount = analytics?.redemptionsMissingDealAmount ?? 0;
  const avgRating = analytics?.avgRating ?? 0;
  const reviewCount = analytics?.reviewCount ?? 0;
  const superStarCount = analytics?.superStarCount ?? 0;
  const avgDealDisplay =
    redemptionCount === 0
      ? '—'
      : redemptionsMissingDealAmount === redemptionCount
        ? '—'
        : Math.round(avgDealPerRedemption).toLocaleString();

  const viewCount = analytics?.viewCount ?? 0;
  const clickCount = analytics?.clickCount ?? 0;
  const requestBookingTapCount = analytics?.requestBookingTapCount ?? 0;
  const whatsappTapCount = analytics?.whatsappTapCount ?? 0;
  const conversionRate = viewCount > 0 ? (clickCount / viewCount) * 100 : 0;

  const chartData = useMemo(() => {
    const evRows = analytics?.eventsByDay ?? [];
    const redRows = analytics?.redemptionsByDay ?? [];
    const byDate = new Map<
      string,
      { dateFull: string; views: number; clicks: number; whatsapp: number; bookings: number; dealVt: number }
    >();
    for (const r of evRows) {
      const d = String(r.date);
      byDate.set(d, {
        dateFull: d,
        views: Number(r.views) || 0,
        clicks: Number(r.clicks) || 0,
        whatsapp: Number(r.whatsappTaps) || 0,
        bookings: Number(r.requestBookings) || 0,
        dealVt: 0,
      });
    }
    for (const r of redRows) {
      const d = String(r.date);
      const deal = Number(r.deal) || 0;
      const prev = byDate.get(d);
      if (prev) prev.dealVt += deal;
      else {
        byDate.set(d, {
          dateFull: d,
          views: 0,
          clicks: 0,
          whatsapp: 0,
          bookings: 0,
          dealVt: deal,
        });
      }
    }
    return [...byDate.values()]
      .sort((a, b) => a.dateFull.localeCompare(b.dateFull))
      .map((row) => ({
        date: row.dateFull.slice(5),
        views: row.views,
        clicks: row.clicks,
        whatsapp: row.whatsapp,
        bookings: row.bookings,
        dealVt: row.dealVt,
      }));
  }, [analytics]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-600" />
          Performance Analytics
        </h2>
        <div className="flex items-center bg-gray-100 rounded-xl p-1">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                timeRange === range
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: 'Pass redemptions',
            value: redemptionCount.toLocaleString(),
            icon: <ShoppingBag className="w-4 h-4 text-teal-600" />,
            bg: 'bg-teal-50',
          },
          {
            label: 'StikmNek deal volume (VT)',
            value: Math.round(totalDealAmount).toLocaleString(),
            icon: <DollarSign className="w-4 h-4 text-violet-600" />,
            bg: 'bg-violet-50',
          },
          {
            label: 'Avg deal / redemption (VT)',
            value: avgDealDisplay,
            icon: <DollarSign className="w-4 h-4 text-purple-600" />,
            bg: 'bg-purple-50',
          },
          {
            label: 'Avg rating',
            value: avgRating ? avgRating.toFixed(1) : '—',
            icon: <Star className="w-4 h-4 text-amber-500" />,
            bg: 'bg-amber-50',
          },
          {
            label: 'Views · Clicks',
            value: `${viewCount.toLocaleString()} · ${clickCount.toLocaleString()}`,
            icon: <Sparkles className="w-4 h-4 text-purple-600" />,
            bg: 'bg-purple-50',
          },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center`}>{m.icon}</div>
            </div>
            <p className="text-xl font-extrabold text-gray-900">{m.value}</p>
            <p className="text-[11px] text-gray-400 mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      {redemptionsMissingDealAmount > 0 ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {redemptionsMissingDealAmount} pass redemption{redemptionsMissingDealAmount === 1 ? '' : 's'} in this range
          do not include VT deal totals (recorded before this metric). New scans include member-rate volume for
          analytics.
        </p>
      ) : null}

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-teal-600" />
              Views & deal volume over time
            </h3>
            <p className="text-xs text-gray-400">
              {`Teal: listing views · Violet: StikmNek deal VT (redemptions) · Conversion: ${conversionRate.toFixed(1)}% · WhatsApp: ${whatsappTapCount.toLocaleString()} · Booking taps: ${requestBookingTapCount.toLocaleString()} · Reviews: ${reviewCount.toLocaleString()}${superStarCount ? ` (${superStarCount} Super Star)` : ''}`}
            </p>
          </div>
          {loading ? (
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="text-xs text-red-600">{error}</div>
          ) : null}
        </div>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cntGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dealGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={44} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="views"
                name="Views"
                stroke="#0d9488"
                strokeWidth={2}
                fill="url(#cntGrad)"
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="dealVt"
                name="Deal VT"
                stroke="#7c3aed"
                strokeWidth={2}
                fill="url(#dealGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardAnalytics;


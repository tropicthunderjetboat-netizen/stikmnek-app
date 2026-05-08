import React, { useEffect, useMemo, useState } from 'react';
import type { Business } from '@/data/businesses';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';
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
  totalSaved: number;
  avgRating: number;
  redemptionsByDay: { date: string; count: number; saved: number }[];
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
  const profileId = useMemo(() => profileBusinessIdFor(selectedBusiness), [selectedBusiness]);
  const offeringId = useMemo(
    () => (selectedBusiness?.profileBusinessId ? String(selectedBusiness.id) : null),
    [selectedBusiness],
  );

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
            totalSaved: Number(data?.totalSaved) || 0,
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
  const totalSaved = analytics?.totalSaved ?? 0;
  const avgRating = analytics?.avgRating ?? 0;
  const reviewCount = analytics?.reviewCount ?? 0;
  const superStarCount = analytics?.superStarCount ?? 0;
  const avgSavedPerRedemption = redemptionCount > 0 ? totalSaved / redemptionCount : 0;

  const viewCount = analytics?.viewCount ?? 0;
  const clickCount = analytics?.clickCount ?? 0;
  const requestBookingTapCount = analytics?.requestBookingTapCount ?? 0;
  const whatsappTapCount = analytics?.whatsappTapCount ?? 0;
  const conversionRate = viewCount > 0 ? (clickCount / viewCount) * 100 : 0;

  const chartData = useMemo(() => {
    const rows = analytics?.eventsByDay ?? [];
    return rows.map((r) => ({
      date: String(r.date).slice(5), // MM-DD
      views: Number(r.views) || 0,
      clicks: Number(r.clicks) || 0,
      whatsapp: Number(r.whatsappTaps) || 0,
      bookings: Number(r.requestBookings) || 0,
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
            label: 'Redemptions',
            value: redemptionCount.toLocaleString(),
            icon: <ShoppingBag className="w-4 h-4 text-teal-600" />,
            bg: 'bg-teal-50',
          },
          {
            label: 'Total saved (VT)',
            value: Math.round(totalSaved).toLocaleString(),
            icon: <DollarSign className="w-4 h-4 text-green-600" />,
            bg: 'bg-green-50',
          },
          {
            label: 'Avg saved / redemption',
            value: Math.round(avgSavedPerRedemption).toLocaleString(),
            icon: <DollarSign className="w-4 h-4 text-emerald-600" />,
            bg: 'bg-emerald-50',
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

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-teal-600" />
              Views & actions over time
            </h3>
            <p className="text-xs text-gray-400">
              {`Conversion: ${conversionRate.toFixed(1)}% · WhatsApp taps: ${whatsappTapCount.toLocaleString()} · Booking taps: ${requestBookingTapCount.toLocaleString()} · Reviews: ${reviewCount.toLocaleString()}${superStarCount ? ` (${superStarCount} Super Star)` : ''}`}
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
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
              <Area type="monotone" dataKey="views" stroke="#0d9488" strokeWidth={2} fill="url(#cntGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardAnalytics;


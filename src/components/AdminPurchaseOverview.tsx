import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  DollarSign, Users, TrendingUp, CreditCard, ArrowUpRight, ArrowDownRight,
  RefreshCw, Loader2, Calendar, Clock, ShoppingBag, BarChart3,
  Download, Filter, ChevronDown, AlertCircle, CheckCircle, XCircle,
  Zap, Eye, Activity, Award, FileText
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line
} from 'recharts';
import { PASS_PRODUCTS } from '@/data/pricing';

interface PassPurchase {
  id: string;
  user_id: string;
  pass_type: string;
  purchase_date: string;
  expiry_date: string;
  amount_paid: number;
  payment_status: string;
  receipt_number: string;
  payment_method: string;
  user_email: string;
  user_name: string;
  valid_from: string;
  valid_until: string;
  paypal_order_id: string;
  created_at: string;
}

interface AdminPurchaseOverviewProps {
  totalBusinesses: number;
  dbBusinessCount: number;
}

const PASS_COLORS: Record<string, string> = {
  daily: '#0EA5E9',
  weekly: '#8B5CF6',
  monthly: '#F59E0B',
  mega_group: '#C026D3',
};

const PASS_LABELS: Record<string, string> = {
  daily: PASS_PRODUCTS.daily.title,
  weekly: PASS_PRODUCTS.weekly.title,
  monthly: PASS_PRODUCTS.monthly.title,
  mega_group: PASS_PRODUCTS.mega_group.title,
};

const PASS_PRICES: Record<string, number> = {
  daily: 15,
  weekly: 45,
  monthly: 99,
  mega_group: 199,
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  refunded: { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' },
};

const AdminPurchaseOverview: React.FC<AdminPurchaseOverviewProps> = ({
  totalBusinesses,
  dbBusinessCount,
}) => {
  const [purchases, setPurchases] = useState<PassPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadPurchases = useCallback(async (showToast = false) => {
    try {
      let query = supabase
        .from('pass_purchases')
        .select('*')
        .order('purchase_date', { ascending: false });

      // Apply time range filter
      if (timeRange !== 'all') {
        const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
        const since = new Date();
        since.setDate(since.getDate() - daysMap[timeRange]);
        query = query.gte('purchase_date', since.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error('[AdminPurchaseOverview] Query error:', error);
        if (showToast) toast.error('Failed to load purchase data');
        return;
      }

      setPurchases((data || []) as PassPurchase[]);
      setLastRefreshed(new Date());
      if (showToast) toast.success(`Loaded ${(data || []).length} purchase records`);
    } catch (err) {
      console.error('[AdminPurchaseOverview] Load error:', err);
      if (showToast) toast.error('Failed to load purchase data');
    }
  }, [timeRange]);

  useEffect(() => {
    setLoading(true);
    loadPurchases().finally(() => setLoading(false));
  }, [loadPurchases]);

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-pass-purchases-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pass_purchases' },
        (payload) => {
          const newPurchase = payload.new as PassPurchase;
          setPurchases(prev => [newPurchase, ...prev]);
          toast.info(`New pass purchase: ${PASS_LABELS[newPurchase.pass_type] || newPurchase.pass_type} - $${newPurchase.amount_paid}`, {
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPurchases(true);
    setRefreshing(false);
  };

  // ─── Computed Analytics ───
  const completedPurchases = purchases.filter(p => p.payment_status === 'completed');
  const failedPurchases = purchases.filter(p => p.payment_status === 'failed');
  const now = new Date();

  const totalRevenue = completedPurchases.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const activePasses = completedPurchases.filter(p => new Date(p.expiry_date) > now).length;
  const totalPurchases = completedPurchases.length;
  const avgOrderValue = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

  // Revenue by pass type
  const revenueByType = ['daily', 'weekly', 'monthly', 'mega_group'].map(type => {
    const typePurchases = completedPurchases.filter(p => p.pass_type === type);
    return {
      name: PASS_LABELS[type] || type,
      shortName: type.charAt(0).toUpperCase() + type.slice(1),
      value: typePurchases.reduce((sum, p) => sum + Number(p.amount_paid), 0),
      count: typePurchases.length,
      active: typePurchases.filter(p => new Date(p.expiry_date) > now).length,
      color: PASS_COLORS[type],
      price: PASS_PRICES[type],
    };
  });

  // Purchase trends over time (group by day)
  const trendData = (() => {
    const dayMap: Record<string, { date: string; revenue: number; count: number; daily: number; weekly: number; monthly: number; mega_group: number }> = {};
    
    // Determine how many days to show
    const daysToShow = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 180;
    
    // Pre-fill all days
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dayMap[key] = { date: key, revenue: 0, count: 0, daily: 0, weekly: 0, monthly: 0, mega_group: 0 };
    }

    completedPurchases.forEach(p => {
      const day = new Date(p.purchase_date).toISOString().split('T')[0];
      if (dayMap[day]) {
        dayMap[day].revenue += Number(p.amount_paid);
        dayMap[day].count += 1;
        if (p.pass_type === 'daily') dayMap[day].daily += 1;
        if (p.pass_type === 'weekly') dayMap[day].weekly += 1;
        if (p.pass_type === 'monthly') dayMap[day].monthly += 1;
        if (p.pass_type === 'mega_group') dayMap[day].mega_group += 1;
      }
    });

    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
  })();

  // Format trend data for display (show abbreviated dates)
  const formattedTrendData = trendData.map(d => ({
    ...d,
    label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  // Only show every Nth label to avoid crowding
  const labelInterval = timeRange === '7d' ? 1 : timeRange === '30d' ? 5 : timeRange === '90d' ? 10 : 20;

  // Weekly aggregation for bar chart
  const weeklyData = (() => {
    const weeks: Record<string, { week: string; revenue: number; count: number }> = {};
    completedPurchases.forEach(p => {
      const d = new Date(p.purchase_date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split('T')[0];
      if (!weeks[key]) {
        weeks[key] = {
          week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: 0,
          count: 0,
        };
      }
      weeks[key].revenue += Number(p.amount_paid);
      weeks[key].count += 1;
    });
    return Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)).slice(-12);
  })();

  // Pie chart data for pass type distribution
  const pieData = revenueByType
    .filter(r => r.value > 0)
    .map(r => ({
      name: r.name,
      value: r.value,
      color: r.color,
      count: r.count,
    }));

  // Recent purchases (last 10)
  const recentPurchases = purchases.slice(0, 10);

  // Calculate period-over-period changes
  const calcChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const pct = ((current - previous) / previous) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  // Compare current period vs previous period
  const periodDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - periodDays);
  const prevPeriodStart = new Date(periodStart);
  prevPeriodStart.setDate(prevPeriodStart.getDate() - periodDays);

  const currentPeriodRevenue = completedPurchases
    .filter(p => new Date(p.purchase_date) >= periodStart)
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const prevPeriodRevenue = completedPurchases
    .filter(p => {
      const d = new Date(p.purchase_date);
      return d >= prevPeriodStart && d < periodStart;
    })
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);

  const revenueChange = calcChange(currentPeriodRevenue, prevPeriodRevenue);
  const revenueUp = currentPeriodRevenue >= prevPeriodRevenue;

  const currentPeriodCount = completedPurchases.filter(p => new Date(p.purchase_date) >= periodStart).length;
  const prevPeriodCount = completedPurchases.filter(p => {
    const d = new Date(p.purchase_date);
    return d >= prevPeriodStart && d < periodStart;
  }).length;
  const countChange = calcChange(currentPeriodCount, prevPeriodCount);
  const countUp = currentPeriodCount >= prevPeriodCount;

  // Export CSV
  const handleExportPurchases = () => {
    try {
      const headers = ['Receipt', 'Pass Type', 'Amount', 'Status', 'User Email', 'User Name', 'Purchase Date', 'Expiry Date', 'Payment Method', 'PayPal Order ID'];
      const rows = purchases.map(p => [
        p.receipt_number || '',
        p.pass_type,
        `$${Number(p.amount_paid).toFixed(2)}`,
        p.payment_status,
        `"${(p.user_email || '').replace(/"/g, '""')}"`,
        `"${(p.user_name || '').replace(/"/g, '""')}"`,
        new Date(p.purchase_date).toLocaleString(),
        new Date(p.expiry_date).toLocaleString(),
        p.payment_method || 'paypal',
        p.paypal_order_id || '',
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pass_purchases_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${purchases.length} purchase records to CSV`);
    } catch (err) {
      toast.error('Failed to export purchases');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-gray-200" />
                <div className="w-16 h-5 rounded bg-gray-200" />
              </div>
              <div className="w-24 h-8 rounded bg-gray-200 mb-1" />
              <div className="w-20 h-4 rounded bg-gray-200" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading purchase analytics...</p>
        </div>
      </div>
    );
  }

  const hasData = completedPurchases.length > 0;

  return (
    <div className="space-y-6">
      {/* Time Range + Actions Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border border-gray-100">
          {(['7d', '30d', '90d', 'all'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                timeRange === range
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : 'All Time'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              Updated: <span className="font-medium text-gray-600">{lastRefreshed.toLocaleTimeString()}</span>
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExportPurchases}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-200/50">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold ${revenueUp ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'} px-2 py-1 rounded-lg`}>
              {revenueUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {revenueChange}
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Revenue</p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200/50">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
              <Activity className="w-3 h-3" />
              Live
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{activePasses.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">Active Passes</p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-200/50">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold ${countUp ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'} px-2 py-1 rounded-lg`}>
              {countUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {countChange}
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{totalPurchases.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Purchases</p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200/50">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">${avgOrderValue.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Avg. Order Value</p>
        </div>
      </div>

      {/* Revenue by Pass Type Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {revenueByType.map(type => (
          <div key={type.shortName} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-10 rounded-full"
                  style={{ backgroundColor: type.color }}
                />
                <div>
                  <p className="text-sm font-bold text-gray-900">{type.name}</p>
                  <p className="text-[11px] text-gray-400">${type.price}/pass</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-bold">
                {type.active} active
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[10px] text-gray-400 font-medium uppercase">Revenue</p>
                <p className="text-lg font-extrabold text-gray-900">${type.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[10px] text-gray-400 font-medium uppercase">Sold</p>
                <p className="text-lg font-extrabold text-gray-900">{type.count}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {hasData ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Trend */}
            <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                    Revenue Trend
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Daily revenue from pass purchases</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={formattedTrendData}>
                  <defs>
                    <linearGradient id="revTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={labelInterval - 1}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0d9488"
                    fill="url(#revTrendGrad)"
                    strokeWidth={2.5}
                    dot={timeRange === '7d' ? { fill: '#0d9488', strokeWidth: 2, r: 4 } : false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Pass Type Distribution */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-purple-600" />
                Revenue by Pass Type
              </h3>
              <p className="text-xs text-gray-400 mb-4">Distribution of revenue across pass types</p>
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {pieData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-gray-600">{item.name}</span>
                          <span className="text-gray-400">({item.count})</span>
                        </div>
                        <span className="font-bold text-gray-900">${item.value.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                  No purchase data yet
                </div>
              )}
            </div>
          </div>

          {/* Purchase Volume by Day */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-indigo-600" />
                Pass sales by day
              </h3>
              <p className="text-xs text-gray-400 mb-4">Number of passes sold per day (by product)</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={formattedTrendData.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  />
                  <Bar dataKey="daily" name={PASS_PRODUCTS.daily.title} fill={PASS_COLORS.daily} radius={[4, 4, 0, 0]} stackId="stack" />
                  <Bar dataKey="weekly" name={PASS_PRODUCTS.weekly.title} fill={PASS_COLORS.weekly} radius={[0, 0, 0, 0]} stackId="stack" />
                  <Bar dataKey="monthly" name={PASS_PRODUCTS.monthly.title} fill={PASS_COLORS.monthly} radius={[4, 4, 0, 0]} stackId="stack" />
                  <Bar dataKey="mega_group" name={PASS_PRODUCTS.mega_group.title} fill={PASS_COLORS.mega_group} radius={[4, 4, 0, 0]} stackId="stack" />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3">
                {Object.entries(PASS_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                    <span className="text-[11px] text-gray-600 leading-tight">{PASS_LABELS[type] ?? type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Pass Breakdown */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                Active Pass Breakdown
              </h3>
              <div className="space-y-4">
                {revenueByType.map(type => {
                  const pct = activePasses > 0 ? (type.active / activePasses) * 100 : 0;
                  return (
                    <div key={type.shortName}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: type.color }} />
                          <span className="text-sm font-semibold text-gray-700">{type.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-gray-900">{type.active}</span>
                          <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: type.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-gray-100">
                <div className="p-3 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100">
                  <p className="text-[10px] text-teal-600 font-medium uppercase">Success Rate</p>
                  <p className="text-xl font-extrabold text-teal-800 mt-1">
                    {purchases.length > 0 ? ((completedPurchases.length / purchases.length) * 100).toFixed(1) : '0'}%
                  </p>
                  <p className="text-[10px] text-teal-500 mt-0.5">
                    {completedPurchases.length} of {purchases.length} attempts
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
                  <p className="text-[10px] text-amber-600 font-medium uppercase">Failed</p>
                  <p className="text-xl font-extrabold text-amber-800 mt-1">{failedPurchases.length}</p>
                  <p className="text-[10px] text-amber-500 mt-0.5">
                    {purchases.length > 0 ? ((failedPurchases.length / purchases.length) * 100).toFixed(1) : '0'}% failure rate
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Purchase Data Yet</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Pass purchases will appear here once tourists start buying passes through PayPal.
            All revenue, trends, and analytics will be tracked in real-time.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold">
              <CreditCard className="w-3.5 h-3.5" />
              {PASS_PRODUCTS.daily.title}: ${PASS_PRODUCTS.daily.priceAUD}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 text-purple-700 text-xs font-semibold">
              <CreditCard className="w-3.5 h-3.5" />
              {PASS_PRODUCTS.weekly.title}: ${PASS_PRODUCTS.weekly.priceAUD}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-semibold">
              <CreditCard className="w-3.5 h-3.5" />
              {PASS_PRODUCTS.monthly.title}: ${PASS_PRODUCTS.monthly.priceAUD}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-50 text-fuchsia-700 text-xs font-semibold">
              <CreditCard className="w-3.5 h-3.5" />
              {PASS_PRODUCTS.mega_group.title}: ${PASS_PRODUCTS.mega_group.priceAUD}
            </div>
          </div>
        </div>
      )}

      {/* Recent Purchases Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            Recent Purchases
          </h3>
          <span className="text-xs text-gray-400">{purchases.length} total records</span>
        </div>
        {recentPurchases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Receipt</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Pass Type</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Customer</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Amount</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentPurchases.map(purchase => {
                  const statusStyle = STATUS_COLORS[purchase.payment_status] || STATUS_COLORS.pending;
                  const isExpired = new Date(purchase.expiry_date) < now;
                  return (
                    <tr key={purchase.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <span className="text-xs font-mono font-semibold text-gray-700">
                          {purchase.receipt_number || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: PASS_COLORS[purchase.pass_type] || '#6B7280' }}
                          />
                          <span className="text-xs font-semibold text-gray-700 capitalize">
                            {PASS_LABELS[purchase.pass_type] || purchase.pass_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{purchase.user_name || 'Unknown'}</p>
                          <p className="text-[10px] text-gray-400">{purchase.user_email || ''}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-sm font-bold text-gray-900">
                          ${Number(purchase.amount_paid).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize ${statusStyle.bg} ${statusStyle.text}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                          {purchase.payment_status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-gray-600">
                          {new Date(purchase.purchase_date).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-medium ${isExpired ? 'text-red-500' : 'text-emerald-600'}`}>
                            {new Date(purchase.expiry_date).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric'
                            })}
                          </span>
                          {isExpired && (
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[9px] font-bold">
                              EXPIRED
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <ShoppingBag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No purchases recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPurchaseOverview;

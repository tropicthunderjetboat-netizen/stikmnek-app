import React, { useState } from 'react';
import { Business } from '@/data/businesses';
import {
  Users, DollarSign, TrendingUp, TrendingDown, BarChart3,
  Calendar, Clock, Target, ArrowUpRight, ArrowDownRight,
  Zap, Eye, ShoppingBag, Star, MapPin, Percent
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';

interface DashboardAnalyticsProps {
  selectedBusiness: Business;
}

const DashboardAnalytics: React.FC<DashboardAnalyticsProps> = ({ selectedBusiness }) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Mock data
  const weeklyRedemptions = [
    { day: 'Mon', count: 12, revenue: 180 },
    { day: 'Tue', count: 8, revenue: 120 },
    { day: 'Wed', count: 15, revenue: 225 },
    { day: 'Thu', count: 18, revenue: 270 },
    { day: 'Fri', count: 24, revenue: 360 },
    { day: 'Sat', count: 32, revenue: 480 },
    { day: 'Sun', count: 28, revenue: 420 },
  ];

  const monthlyTrend = [
    { month: 'Sep', tourists: 45, revenue: 2250 },
    { month: 'Oct', tourists: 62, revenue: 3100 },
    { month: 'Nov', tourists: 78, revenue: 3900 },
    { month: 'Dec', tourists: 95, revenue: 4750 },
    { month: 'Jan', tourists: 110, revenue: 5500 },
    { month: 'Feb', tourists: 88, revenue: 4400 },
  ];

  const dailyViews = [
    { date: 'Feb 8', views: 42, clicks: 18 },
    { date: 'Feb 9', views: 55, clicks: 22 },
    { date: 'Feb 10', views: 38, clicks: 15 },
    { date: 'Feb 11', views: 67, clicks: 28 },
    { date: 'Feb 12', views: 72, clicks: 31 },
    { date: 'Feb 13', views: 85, clicks: 38 },
    { date: 'Feb 14', views: 91, clicks: 42 },
  ];

  const categoryBreakdown = [
    { name: 'Direct', value: 35, color: '#0d9488' },
    { name: 'Search', value: 28, color: '#6366f1' },
    { name: 'Browse', value: 22, color: '#f59e0b' },
    { name: 'Referral', value: 15, color: '#ec4899' },
  ];

  const peakHours = [
    { hour: '6am', visitors: 2 },
    { hour: '8am', visitors: 8 },
    { hour: '10am', visitors: 22 },
    { hour: '12pm', visitors: 35 },
    { hour: '2pm', visitors: 28 },
    { hour: '4pm', visitors: 18 },
    { hour: '6pm', visitors: 32 },
    { hour: '8pm', visitors: 25 },
    { hour: '10pm', visitors: 10 },
  ];

  const totalRedemptions = weeklyRedemptions.reduce((sum, d) => sum + d.count, 0);
  const totalRevenue = weeklyRedemptions.reduce((sum, d) => sum + d.revenue, 0);
  const totalViews = dailyViews.reduce((sum, d) => sum + d.views, 0);
  const totalClicks = dailyViews.reduce((sum, d) => sum + d.clicks, 0);
  const conversionRate = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-600" />
          Performance Analytics
        </h2>
        <div className="flex items-center bg-gray-100 rounded-xl p-1">
          {(['7d', '30d', '90d'] as const).map(range => (
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

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: 'Total Views',
            value: totalViews.toLocaleString(),
            change: '+25%',
            positive: true,
            icon: <Eye className="w-4 h-4 text-blue-600" />,
            bg: 'bg-blue-50',
          },
          {
            label: 'Clicks',
            value: totalClicks.toLocaleString(),
            change: '+18%',
            positive: true,
            icon: <Target className="w-4 h-4 text-indigo-600" />,
            bg: 'bg-indigo-50',
          },
          {
            label: 'Conversion',
            value: `${conversionRate}%`,
            change: '+3.2%',
            positive: true,
            icon: <Percent className="w-4 h-4 text-emerald-600" />,
            bg: 'bg-emerald-50',
          },
          {
            label: 'Redemptions',
            value: totalRedemptions.toString(),
            change: '+12%',
            positive: true,
            icon: <ShoppingBag className="w-4 h-4 text-teal-600" />,
            bg: 'bg-teal-50',
          },
          {
            label: 'Revenue',
            value: `$${totalRevenue.toLocaleString()}`,
            change: '+8%',
            positive: true,
            icon: <DollarSign className="w-4 h-4 text-green-600" />,
            bg: 'bg-green-50',
          },
        ].map(metric => (
          <div key={metric.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${metric.bg} flex items-center justify-center`}>
                {metric.icon}
              </div>
            </div>
            <p className="text-xl font-extrabold text-gray-900">{metric.value}</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-gray-400">{metric.label}</p>
              <span className={`flex items-center gap-0.5 text-[10px] font-bold ${
                metric.positive ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {metric.positive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                {metric.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Views & Clicks Trend */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-600" />
            Views & Engagement
          </h3>
          <p className="text-xs text-gray-400 mb-4">Daily profile views and click-throughs</p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailyViews}>
              <defs>
                <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              />
              <Area type="monotone" dataKey="views" stroke="#6366f1" strokeWidth={2} fill="url(#viewsGrad)" />
              <Area type="monotone" dataKey="clicks" stroke="#0d9488" strokeWidth={2} fill="url(#clicksGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-[11px] text-gray-500">Views</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-teal-500" />
              <span className="text-[11px] text-gray-500">Clicks</span>
            </div>
          </div>
        </div>

        {/* Weekly Redemptions */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-teal-600" />
            Weekly Redemptions
          </h3>
          <p className="text-xs text-gray-400 mb-4">Coupon redemptions by day of week</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyRedemptions}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              />
              <Bar dataKey="count" fill="#0d9488" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Tourist Trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Monthly Tourist Trend
          </h3>
          <p className="text-xs text-gray-400 mb-4">6-month tourist engagement overview</p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyTrend}>
              <defs>
                <linearGradient id="touristGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              />
              <Area type="monotone" dataKey="tourists" stroke="#10b981" strokeWidth={2.5} fill="url(#touristGrad)" dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Traffic Sources */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-600" />
            Traffic Sources
          </h3>
          <p className="text-xs text-gray-400 mb-4">How tourists find your listing</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={categoryBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={4}
                dataKey="value"
              >
                {categoryBreakdown.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {categoryBreakdown.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-gray-600">{item.name}</span>
                </div>
                <span className="text-xs font-bold text-gray-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peak Hours + Revenue Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Peak Hours */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Peak Visitor Hours
          </h3>
          <p className="text-xs text-gray-400 mb-4">When tourists are most active</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={peakHours}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              />
              <Bar dataKey="visitors" radius={[6, 6, 0, 0]}>
                {peakHours.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.visitors >= 30 ? '#0d9488' : entry.visitors >= 20 ? '#14b8a6' : entry.visitors >= 10 ? '#5eead4' : '#ccfbf1'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-teal-600" /> High</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-teal-400" /> Medium</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-teal-200" /> Low</span>
          </div>
        </div>

        {/* Revenue Impact Summary */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Revenue Impact
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100">
              <p className="text-[11px] text-teal-600 font-medium">This Week</p>
              <p className="text-xl font-extrabold text-teal-800 mt-1">${totalRevenue.toLocaleString()}</p>
              <p className="text-[10px] text-teal-500 mt-1">{totalRedemptions} redemptions</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
              <p className="text-[11px] text-blue-600 font-medium">This Month</p>
              <p className="text-xl font-extrabold text-blue-800 mt-1">$8,450</p>
              <p className="text-[10px] text-blue-500 mt-1 flex items-center gap-0.5">
                <ArrowUpRight className="w-2.5 h-2.5" />+15% vs last month
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100">
              <p className="text-[11px] text-purple-600 font-medium">Avg. Spend</p>
              <p className="text-xl font-extrabold text-purple-800 mt-1">$42</p>
              <p className="text-[10px] text-purple-500 mt-1">per tourist visit</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
              <p className="text-[11px] text-amber-600 font-medium">Return Rate</p>
              <p className="text-xl font-extrabold text-amber-800 mt-1">34%</p>
              <p className="text-[10px] text-amber-500 mt-1">tourists visit again</p>
            </div>
          </div>

          {/* Conversion Funnel */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Conversion Funnel
            </p>
            <div className="space-y-2">
              {[
                { label: 'Profile Views', count: 1245, pct: 100, color: 'bg-blue-500' },
                { label: 'Detail Clicks', count: 456, pct: 36.6, color: 'bg-indigo-500' },
                { label: 'Coupon Views', count: 234, pct: 18.8, color: 'bg-teal-500' },
                { label: 'Redemptions', count: 137, pct: 11.0, color: 'bg-emerald-500' },
              ].map(step => (
                <div key={step.label}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-gray-600">{step.label}</span>
                    <span className="font-bold text-gray-900">{step.count} ({step.pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${step.color} rounded-full transition-all`} style={{ width: `${step.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardAnalytics;

import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Business } from '@/data/businesses';
import {
  Users, DollarSign, Star, Eye, ArrowUpRight, ArrowDownRight,
  TrendingUp, MapPin, Phone, Clock, Edit3, Power, Tag,
  AlertCircle, CheckCircle, XCircle, FileText, ArrowRight,
  Zap, Share2, BarChart3, MessageSquare, Calendar, Heart,
  Globe, Target, Award, Sparkles, Activity, ShoppingBag, ScanLine,
  Plus, Home
} from 'lucide-react';
import {
  looksLikeRichDescriptionHtml,
  looksLikeSqlOrTechnicalDump,
  sanitizeBusinessDescriptionHtml,
} from '@/lib/businessDescriptionHtml';
import { formatVT } from '@/lib/utils';
import {
  customerFacingListPrice,
  effectiveListingOriginalPrice,
  listingHasActiveDiscount,
} from '@/data/businesses';


interface DashboardOverviewProps {
  selectedBusiness: Business;
  totalRedemptions: number;
  totalRevenue: number;
  businessReviews: any[];
  pendingBusinesses: any[];
  currentPendingEdit: any;
  onSwitchTab: (tab: string) => void;
  onToggleActive: (active: boolean) => void;
  onOpenScanner?: () => void;
}

const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  selectedBusiness,
  totalRedemptions,
  totalRevenue,
  businessReviews,
  pendingBusinesses,
  currentPendingEdit,
  onSwitchTab,
  onToggleActive,
  onOpenScanner,
}) => {

  const { language, setCurrentView } = useAppContext();
  const [showShareTooltip, setShowShareTooltip] = useState(false);

  // Calculate business health score
  const ratingScore = (selectedBusiness.rating / 5) * 25;
  const reviewScore = Math.min(selectedBusiness.reviewCount / 100, 1) * 25;
  const redemptionScore = Math.min(totalRedemptions / 200, 1) * 25;
  const descriptionIsUsable =
    Boolean(selectedBusiness.description?.trim()) &&
    !looksLikeSqlOrTechnicalDump(selectedBusiness.description || '');
  const completenessScore = [
    descriptionIsUsable ? selectedBusiness.description : '',
    selectedBusiness.phone,
    selectedBusiness.hours,
    selectedBusiness.image,
  ].filter(Boolean).length / 4 * 25;
  const healthScore = Math.round(ratingScore + reviewScore + redemptionScore + completenessScore);

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-teal-600';
    if (score >= 40) return 'text-amber-600';
    return 'text-red-500';
  };

  const getHealthLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Work';
  };

  const getHealthGradient = (score: number) => {
    if (score >= 80) return 'from-emerald-500 to-teal-500';
    if (score >= 60) return 'from-teal-500 to-cyan-500';
    if (score >= 40) return 'from-amber-500 to-orange-500';
    return 'from-red-500 to-orange-500';
  };

  // Mock recent activity
  const recentActivity = [
    { type: 'review', text: 'New 5-star review from Sarah M.', time: '2 hours ago', icon: <Star className="w-4 h-4 text-yellow-500" /> },
    { type: 'redemption', text: '3 coupon redemptions today', time: '4 hours ago', icon: <ShoppingBag className="w-4 h-4 text-teal-500" /> },
    { type: 'view', text: '45 profile views this week', time: '1 day ago', icon: <Eye className="w-4 h-4 text-blue-500" /> },
    { type: 'favorite', text: '12 new saves to favorites', time: '2 days ago', icon: <Heart className="w-4 h-4 text-pink-500" /> },
    { type: 'milestone', text: 'Reached 100+ total reviews!', time: '3 days ago', icon: <Award className="w-4 h-4 text-purple-500" /> },
  ];

  const handleShare = () => {
    const url = `${window.location.origin}?business=${selectedBusiness.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShowShareTooltip(true);
      setTimeout(() => setShowShareTooltip(false), 2000);
    });
  };

  // ═══ 6 QUICK ACTION BUTTONS ═══
  const quickActions = [
    {
      label: 'Scan QR Code',
      description: 'Scan tourist passes',
      icon: <ScanLine className="w-7 h-7" />,
      gradient: 'from-teal-500 to-emerald-600',
      shadowColor: 'shadow-teal-200/60',
      bgHover: 'hover:shadow-teal-300/70',
      onClick: () => onOpenScanner?.(),
    },
    {
      label: 'Edit Listing',
      description: 'Update your details',
      icon: <Edit3 className="w-7 h-7" />,
      gradient: 'from-blue-500 to-indigo-600',
      shadowColor: 'shadow-blue-200/60',
      bgHover: 'hover:shadow-blue-300/70',
      onClick: () => onSwitchTab('edit'),
    },
    {
      label: 'Reviews',
      description: 'See customer feedback',
      icon: <MessageSquare className="w-7 h-7" />,
      gradient: 'from-amber-500 to-orange-600',
      shadowColor: 'shadow-amber-200/60',
      bgHover: 'hover:shadow-amber-300/70',
      onClick: () => onSwitchTab('reviews'),
    },
    {
      label: 'Add New Listing',
      description: 'Submit a new business',
      icon: <Plus className="w-7 h-7" />,
      gradient: 'from-purple-500 to-violet-600',
      shadowColor: 'shadow-purple-200/60',
      bgHover: 'hover:shadow-purple-300/70',
      onClick: () => onSwitchTab('submit'),
    },
    {
      label: 'Analytics',
      description: 'View performance data',
      icon: <BarChart3 className="w-7 h-7" />,
      gradient: 'from-pink-500 to-rose-600',
      shadowColor: 'shadow-pink-200/60',
      bgHover: 'hover:shadow-pink-300/70',
      onClick: () => onSwitchTab('analytics'),
    },
    {
      label: 'Home',
      description: 'Back to main site',
      icon: <Home className="w-7 h-7" />,
      gradient: 'from-gray-600 to-slate-700',
      shadowColor: 'shadow-gray-200/60',
      bgHover: 'hover:shadow-gray-300/70',
      onClick: () => setCurrentView('home'),
    },
  ];

  return (
    <div className="space-y-6">

      {/* ═══ QUICK ACTIONS GRID - 6 BUTTONS ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-extrabold text-gray-900">Quick Actions</h2>
            <p className="text-sm text-gray-500 mt-0.5">Jump to any section of your dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-green-600">Online</span>
          </div>
        </div>
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {quickActions.map((action, index) => (
            <button
              key={index}
              type="button"
              onClick={action.onClick}
              className={`group relative flex min-h-[5.5rem] flex-row items-center gap-4 p-4 sm:flex-col sm:items-center sm:gap-3 sm:p-6 rounded-2xl bg-white border-2 border-gray-100 hover:border-transparent transition-all duration-300 active:scale-[0.99] shadow-sm hover:shadow-xl sm:hover:-translate-y-1 ${action.bgHover}`}
            >
              {/* Icon Container */}
              <div className={`w-14 h-14 shrink-0 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white shadow-lg ${action.shadowColor} sm:group-hover:scale-110 transition-transform duration-300`}>
                {action.icon}
              </div>
              {/* Label */}
              <div className="min-w-0 flex-1 text-left sm:flex-none sm:text-center">
                <p className="text-base font-bold text-gray-900 group-hover:text-gray-800">
                  {action.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 sm:text-gray-400">
                  {action.description}
                </p>
              </div>
              {/* Hover glow effect */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300`} />
            </button>
          ))}
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow min-h-[8.5rem]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200/50">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
              <ArrowUpRight className="w-3 h-3" />+18%
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{totalRedemptions}</p>
          <p className="text-xs text-gray-400 mt-0.5">Tourists This Week</p>
          <div className="mt-3 flex gap-0.5">
            {[65, 45, 80, 55, 90, 70, 85].map((h, i) => (
              <div key={i} className="flex-1 bg-blue-100 rounded-full overflow-hidden" style={{ height: '24px' }}>
                <div className="bg-blue-500 rounded-full w-full" style={{ height: `${h}%`, marginTop: `${100 - h}%` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow min-h-[8.5rem]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-200/50">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
              <ArrowUpRight className="w-3 h-3" />+12%
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{formatVT(totalRevenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Revenue Impact (VT)</p>
          <div className="mt-3 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" style={{ width: '72%' }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">72% of monthly target</p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow min-h-[8.5rem]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-200/50">
              <Star className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{selectedBusiness.rating}</p>
          <p className="text-xs text-gray-400 mt-0.5">{selectedBusiness.reviewCount} reviews</p>
          <div className="mt-3 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(i => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${i <= Math.round(selectedBusiness.rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow min-h-[8.5rem]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-200/50">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
              <ArrowUpRight className="w-3 h-3" />+25%
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">1,245</p>
          <p className="text-xs text-gray-400 mt-0.5">Profile Views</p>
          <div className="mt-3 flex gap-0.5">
            {[40, 55, 35, 70, 60, 85, 75].map((h, i) => (
              <div key={i} className="flex-1 bg-purple-100 rounded-full overflow-hidden" style={{ height: '24px' }}>
                <div className="bg-purple-500 rounded-full w-full" style={{ height: `${h}%`, marginTop: `${100 - h}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Business Card + Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Business Card Preview */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="relative">
              <img
                src={selectedBusiness.image}
                alt={selectedBusiness.name}
                className="w-full h-48 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <div className="flex items-end justify-between">
                  <div>
                    <h3 className="text-xl font-extrabold text-white drop-shadow-lg">{selectedBusiness.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-white/90 text-sm">
                        <MapPin className="w-3.5 h-3.5" />{selectedBusiness.location}
                      </span>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/90 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    Active
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {looksLikeSqlOrTechnicalDump(selectedBusiness.description || '') ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900">Description needs an update</p>
                  <p className="text-xs text-amber-800/90 mt-2 leading-relaxed">
                    This listing’s description field contains database or technical text (not shown here for safety).
                    Open <strong>Edit Listing</strong> and replace it with a short customer-facing description of your business.
                  </p>
                  <button
                    type="button"
                    onClick={() => onSwitchTab('edit')}
                    className="mt-3 w-full rounded-xl bg-amber-700 px-4 py-3 text-sm font-bold text-white hover:bg-amber-800 sm:w-auto"
                  >
                    Go to Edit Listing
                  </button>
                </div>
              ) : looksLikeRichDescriptionHtml(selectedBusiness.description || '') ? (
                <div
                  className="prose prose-sm max-w-none max-h-64 overflow-y-auto text-gray-600 leading-relaxed sm:max-h-none"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeBusinessDescriptionHtml(selectedBusiness.description || ''),
                  }}
                />
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto sm:max-h-none">
                  {selectedBusiness.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-4">
                {listingHasActiveDiscount(selectedBusiness) && (
                  <span className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 text-orange-700 text-sm font-bold">
                    {selectedBusiness.discount?.trim() ||
                      `${Math.round((1 - effectiveListingDealPrice(selectedBusiness) / effectiveListingOriginalPrice(selectedBusiness)) * 100)}% OFF`}
                  </span>
                )}
                <span className="text-sm text-gray-500">
                  {listingHasActiveDiscount(selectedBusiness) ? (
                    <>
                      <span className="line-through text-gray-400">{formatVT(effectiveListingOriginalPrice(selectedBusiness))}</span>
                      <span className="font-bold text-gray-900 ml-2">{formatVT(effectiveListingDealPrice(selectedBusiness))}</span>
                    </>
                  ) : (
                    <span className="font-bold text-gray-900">{formatVT(customerFacingListPrice(selectedBusiness))}</span>
                  )}
                </span>
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="w-3.5 h-3.5" />{selectedBusiness.hours}
                </span>
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Phone className="w-3.5 h-3.5" />{selectedBusiness.phone}
                </span>
              </div>

              {/* Inline action row */}
              <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-gray-100">
                {onOpenScanner && (
                  <button
                    onClick={onOpenScanner}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50 hover:shadow-xl hover:shadow-teal-200/60"
                  >
                    <ScanLine className="w-4 h-4" />
                    Scan QR Code
                  </button>
                )}
                <button
                  onClick={() => onSwitchTab('edit')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-50 text-teal-700 text-sm font-semibold hover:bg-teal-100 transition-all hover:shadow-sm"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit Listing
                </button>
                <button
                  onClick={() => onSwitchTab('photos')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 text-purple-700 text-sm font-semibold hover:bg-purple-100 transition-all hover:shadow-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  Manage Photos
                </button>
                <button
                  onClick={() => onSwitchTab('analytics')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-all hover:shadow-sm"
                >
                  <BarChart3 className="w-4 h-4" />
                  View Analytics
                </button>
                <div className="relative">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 text-gray-700 text-sm font-semibold hover:bg-gray-100 transition-all hover:shadow-sm"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                  {showShareTooltip && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium whitespace-nowrap shadow-lg">
                      Link copied!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>



          {/* Pending Edit Notice */}
          {currentPendingEdit && (
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800">Pending Edit Under Review</p>
                <p className="text-xs text-amber-600 mt-1">
                  You submitted changes on {new Date(currentPendingEdit.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Our admin team is reviewing your edits.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.keys(currentPendingEdit.changes).map(key => (
                    <span key={key} className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-semibold capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => onSwitchTab('edit')}
                  className="mt-3 text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1"
                >
                  View Details <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Pending Submissions */}
          {pendingBusinesses.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-500" />
                  Pending Submissions
                </h3>
                <span className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 text-xs font-bold">
                  {pendingBusinesses.length}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {pendingBusinesses.slice(0, 5).map(pb => (
                  <div key={pb.id} className="p-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      pb.status === 'pending' ? 'bg-yellow-50' : pb.status === 'approved' ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      {pb.status === 'pending' ? <Clock className="w-5 h-5 text-yellow-500" /> :
                       pb.status === 'approved' ? <CheckCircle className="w-5 h-5 text-green-500" /> :
                       <XCircle className="w-5 h-5 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{pb.name}</p>
                      <p className="text-xs text-gray-400">{pb.category} - {new Date(pb.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize ${
                      pb.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                      pb.status === 'approved' ? 'bg-green-50 text-green-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {pb.status}
                    </span>
                  </div>
                ))}
              </div>
              {pendingBusinesses.length > 5 && (
                <div className="p-3 border-t border-gray-100 text-center">
                  <button
                    onClick={() => onSwitchTab('submissions')}
                    className="text-xs font-semibold text-teal-600 hover:text-teal-700"
                  >
                    View all {pendingBusinesses.length} submissions
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column - Health Score + Activity Feed */}
        <div className="space-y-6">
          {/* Business Health Score */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              Listing Health
            </h3>
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke="url(#healthGradient)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(healthScore / 100) * 327} 327`}
                  />
                  <defs>
                    <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={healthScore >= 60 ? '#0d9488' : '#f59e0b'} />
                      <stop offset="100%" stopColor={healthScore >= 60 ? '#10b981' : '#ef4444'} />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-extrabold ${getHealthColor(healthScore)}`}>{healthScore}</span>
                  <span className="text-[10px] text-gray-400 font-medium">{getHealthLabel(healthScore)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Rating', score: ratingScore, max: 25, icon: <Star className="w-3.5 h-3.5 text-amber-500" /> },
                { label: 'Reviews', score: reviewScore, max: 25, icon: <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> },
                { label: 'Redemptions', score: redemptionScore, max: 25, icon: <ShoppingBag className="w-3.5 h-3.5 text-teal-500" /> },
                { label: 'Completeness', score: completenessScore, max: 25, icon: <Target className="w-3.5 h-3.5 text-purple-500" /> },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5 text-gray-600 font-medium">
                      {item.icon}{item.label}
                    </span>
                    <span className="font-bold text-gray-900">{Math.round(item.score)}/{item.max}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${getHealthGradient(Math.round((item.score / item.max) * 100))}`}
                      style={{ width: `${(item.score / item.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {healthScore < 80 && (
              <div className="mt-4 p-3 rounded-xl bg-teal-50 border border-teal-100">
                <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Tip to improve
                </p>
                <p className="text-[11px] text-teal-600 mt-1">
                  {completenessScore < 25
                    ? 'Complete all listing fields (description, phone, hours, photo) to boost your score.'
                    : reviewScore < 15
                    ? 'Encourage satisfied customers to leave reviews to improve your ranking.'
                    : 'Keep up the great work! More redemptions will boost your score further.'}
                </p>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Recent Activity
            </h3>
            <div className="space-y-4">
              {recentActivity.map((activity, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {activity.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">{activity.text}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => onSwitchTab('analytics')}
              className="mt-4 w-full py-2.5 rounded-xl bg-gray-50 text-gray-600 text-xs font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5"
            >
              View Full Analytics <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Quick Performance */}
          <div className="bg-gradient-to-br from-teal-600 to-emerald-700 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-teal-200" />
              <h3 className="text-sm font-bold">Visitor Origins</h3>
            </div>
            <div className="space-y-3">
              {[
                { country: 'Australia', pct: 38 },
                { country: 'New Zealand', pct: 24 },
                { country: 'France', pct: 15 },
                { country: 'USA', pct: 12 },
                { country: 'Other', pct: 11 },
              ].map(item => (
                <div key={item.country}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-teal-100">{item.country}</span>
                    <span className="font-bold">{item.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/80 rounded-full"
                      style={{ width: `${item.pct}%` }}
                    />
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

export default DashboardOverview;

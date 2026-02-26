import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { businesses as localBusinesses } from '@/data/businesses';
import {
  Ticket, Heart, History, QrCode, Calendar, ChevronRight, Wifi,
  LayoutDashboard, TrendingUp, PiggyBank, BarChart3,
  MapPin, Star, Zap, Target, Clock, Flame,
  MessageCircle, Crown, Award, Info, RefreshCw
} from 'lucide-react';

import QRCodeDisplay from './QRCodeDisplay';
import SavingsTracker from './SavingsTracker';
import DashboardFeedback from './DashboardFeedback';

type DashboardTab = 'overview' | 'savings' | 'analytics' | 'feedback';

const Dashboard: React.FC = () => {
  const {
    language, user, userPass, favorites, redemptions, setSelectedBusiness, 
    setCurrentView, dbBusinesses, refreshUserPass
  } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual refresh helper
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshUserPass();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Auto-refresh on mount to ensure we have the latest pass
  useEffect(() => {
    refreshUserPass();
  }, []);

  if (!user) return null;

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;
  const favBizs = allBusinesses.filter(b => favorites.includes(b.id));
  const totalSaved = redemptions.reduce((sum, r) => sum + r.saved, 0);

  // Analytics logic
  const analytics = useMemo(() => {
    const uniqueBusinesses = new Set(redemptions.map(r => r.businessId));
    const categoryBreakdown: Record<string, { count: number; saved: number }> = {};

    redemptions.forEach(r => {
      const biz = allBusinesses.find(b => b.id === r.businessId);
      const cat = biz?.category || 'Other';
      if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { count: 0, saved: 0 };
      categoryBreakdown[cat].count++;
      categoryBreakdown[cat].saved += r.saved;
    });

    return {
      uniqueBusinesses: uniqueBusinesses.size,
      topCategory: Object.entries(categoryBreakdown).sort((a, b) => b[1].saved - a[1].saved)[0]?.[0] || 'None',
      avgSaved: redemptions.length > 0 ? totalSaved / redemptions.length : 0
    };
  }, [redemptions, allBusinesses, totalSaved]);

  // Pass Tier Styling
  const getTierStyles = (type: string) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('gold')) return { bg: 'from-amber-400 via-yellow-500 to-amber-600', icon: <Crown className="w-6 h-6 text-white" />, label: 'GOLD MEMBER' };
    if (t.includes('silver')) return { bg: 'from-slate-300 via-gray-400 to-slate-500', icon: <Award className="w-6 h-6 text-white" />, label: 'SILVER MEMBER' };
    return { bg: 'from-orange-400 via-amber-600 to-orange-700', icon: <Star className="w-6 h-6 text-white" />, label: 'BRONZE MEMBER' };
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white px-6 pt-8 pb-6 border-b border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {language === 'en' ? 'My Dashboard' : 'Mon Tableau de bord'}
            </h1>
            <p className="text-sm text-gray-500">
              {language === 'en' ? `Welcome back, ${user.email?.split('@')[0]}` : `Bon retour, ${user.email?.split('@')[0]}`}
            </p>
          </div>
          <button 
            onClick={handleRefresh}
            className={`p-2 rounded-full hover:bg-gray-100 transition-all ${isRefreshing ? 'animate-spin text-teal-600' : 'text-gray-400'}`}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar">
          {(['overview', 'savings', 'analytics', 'feedback'] as DashboardTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === tab ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview' && <LayoutDashboard className="w-3.5 h-3.5" />}
              {tab === 'savings' && <PiggyBank className="w-3.5 h-3.5" />}
              {tab === 'analytics' && <BarChart3 className="w-3.5 h-3.5" />}
              {tab === 'feedback' && <MessageCircle className="w-3.5 h-3.5" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {/* ── DIGITAL PASS SECTION ── */}
            {userPass ? (
              <div className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-xl bg-gradient-to-br ${getTierStyles(userPass.pass_type).bg}`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                
                <div className="relative flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {getTierStyles(userPass.pass_type).icon}
                      <span className="text-[10px] font-black tracking-widest opacity-90">
                        {getTierStyles(userPass.pass_type).label}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold uppercase tracking-tight">{user.email?.split('@')[0]}</h2>
                  </div>
                  <div className="bg-white/20 backdrop-blur-md p-2 rounded-xl border border-white/30">
                    <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                  </div>
                </div>

                {/* QR Code */}
                <div className="relative bg-white p-3 rounded-2xl mx-auto w-40 h-40 flex items-center justify-center shadow-inner">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${user.id}`} 
                    alt="Pass QR"
                    className="w-32 h-32"
                  />
                  <div className="absolute -bottom-2 bg-teal-600 text-[8px] px-3 py-1 rounded-full font-bold border-2 border-white shadow-md">
                    SCAN TO REDEEM
                  </div>
                </div>

                <div className="mt-6 flex justify-between items-end">
                  <div>
                    <p className="text-[9px] uppercase tracking-tighter opacity-70">Valid Until</p>
                    <p className="text-sm font-mono font-bold">
                      {new Date(userPass.valid_until).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-tighter opacity-70">Capacity</p>
                    <p className="text-sm font-bold">4 People</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 text-center border-2 border-dashed border-gray-200">
                <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">No Active Pass Found</h3>
                <p className="text-sm text-gray-500 mb-4">Buy a pass to start getting discounts at local businesses!</p>
                <button 
                  onClick={() => setCurrentView('pricing')}
                  className="bg-teal-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm"
                >
                  View Pass Options
                </button>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center mb-3">
                  <Flame className="w-5 h-5 text-orange-500" />
                </div>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Visits</p>
                <p className="text-xl font-black text-gray-900">{redemptions.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center mb-3">
                  <PiggyBank className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Total Saved</p>
                <p className="text-xl font-black text-gray-900">{totalSaved} VT</p>
              </div>
            </div>

            {/* Favorite Businesses */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  {language === 'en' ? 'Favorite Deals' : 'Offres favorites'}
                </h3>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
                  {favBizs.length}
                </span>
              </div>
              
              {favBizs.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {favBizs.map(biz => {
                    const visitCount = redemptions.filter(r => r.businessId === biz.id).length;
                    return (
                      <div 
                        key={biz.id}
                        onClick={() => { setSelectedBusiness(biz); setCurrentView('business-detail'); }}
                        className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                          <img src={biz.image} alt={biz.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm text-gray-900 truncate">{biz.name}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded">
                              {biz.discount}
                            </span>
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" /> {biz.location}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div className="hidden xs:block">
                            <p className="text-xs font-bold text-gray-900">{visitCount}x</p>
                            <p className="text-[10px] text-gray-400">{language === 'en' ? 'visits' : 'visites'}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Star className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">
                    {language === 'en' ? 'Visit businesses to see your favorites here' : 'Visitez des entreprises pour voir vos favoris ici'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'savings' && <SavingsTracker />}
        {activeTab === 'analytics' && (
          <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 text-center py-12">
             <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
             <h3 className="font-bold">Coming Soon</h3>
             <p className="text-sm text-gray-500">Advanced travel analytics will appear here.</p>
          </div>
        )}
        {activeTab === 'feedback' && <DashboardFeedback />}
      </div>
    </div>
  );
};

export default Dashboard;

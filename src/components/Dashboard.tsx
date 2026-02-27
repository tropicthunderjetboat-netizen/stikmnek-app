import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses as localBusinesses } from '@/data/businesses';
import {
  Ticket, Heart, ChevronRight, PiggyBank, 
  Flame, Compass, Users, Crown, RefreshCw, ShieldCheck
} from 'lucide-react';

import QRCodeDisplay from './QRCodeDisplay';
import SavingsTracker from './SavingsTracker';
import DashboardFeedback from './DashboardFeedback';

type DashboardTab = 'overview' | 'savings' | 'analytics' | 'feedback';

const Dashboard: React.FC = () => {
  const context = useAppContext();
  
  // Safety guard: if context is missing, return null to prevent crashes
  if (!context) return null;

  const {
    language = 'en',
    user = null,
    userPass = null,
    favorites = [],
    redemptions = [],
    dbBusinesses = [],
    setSelectedBusiness = () => {},
    setCurrentView = () => {},
    refreshUserPass = async () => {},
  } = context;
  
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id && refreshUserPass) {
      refreshUserPass();
    }
  }, [user?.id]);

  // Stable data calculations
  const allBusinesses = useMemo(() => {
    const base = (dbBusinesses && dbBusinesses.length > 0) ? dbBusinesses : localBusinesses;
    return Array.isArray(base) ? base : [];
  }, [dbBusinesses]);

  const favBizs = useMemo(() => {
    const safeFavs = Array.isArray(favorites) ? favorites : [];
    return allBusinesses.filter(b => b && b.id && safeFavs.includes(b.id));
  }, [allBusinesses, favorites]);

  const totalSaved = useMemo(() => {
    const safeRedemptions = Array.isArray(redemptions) ? redemptions : [];
    return safeRedemptions.reduce((sum, r) => sum + (Number(r?.saved) || 0), 0);
  }, [redemptions]);

  if (!user) return null;

  // Helper for original pass logic (Weekly/Monthly)
  const isWeekly = userPass?.pass_type?.toLowerCase().includes('weekly');
  const isMonthly = userPass?.pass_type?.toLowerCase().includes('monthly');

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-md mx-auto px-4 pt-8">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              {language === 'fr' ? 'Tableau de bord' : language === 'bi' ? 'Dashboard blong yu' : 'Dashboard'}
            </h1>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
              {user.email}
            </p>
          </div>
          <button 
            onClick={async () => {
              setIsRefreshing(true);
              await refreshUserPass();
              setTimeout(() => setIsRefreshing(false), 1000);
            }}
            className={`p-2 bg-white rounded-xl border border-gray-100 shadow-sm transition-all ${isRefreshing ? 'animate-spin' : 'active:scale-95'}`}
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-6 bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
          {(['overview', 'savings', 'feedback'] as DashboardTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                activeTab === tab 
                  ? 'bg-gray-900 text-white shadow-md' 
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Pass Status Card */}
            <div className={`relative overflow-hidden rounded-[2.5rem] p-8 text-white shadow-2xl bg-gradient-to-br ${
              isWeekly ? 'from-teal-500 to-emerald-600' : 
              isMonthly ? 'from-blue-600 to-indigo-700' : 
              'from-gray-800 to-black'
            }`}>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-12">
                  <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl">
                    <Ticket className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Status</p>
                    <div className="flex items-center gap-1.5 justify-end mt-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-wider">Active</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-3xl font-black tracking-tight mb-2">
                    {userPass?.pass_type || 'Standard Pass'}
                  </h2>
                  <div className="flex items-center gap-2 text-white/80">
                    <ShieldCheck className="w-4 h-4" />
                    <p className="text-xs font-bold uppercase tracking-widest">
                      Valid until {userPass?.expiry_date ? new Date(userPass.expiry_date).toLocaleDateString() : '---'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Decorative circles */}
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-black/10 rounded-full blur-3xl" />
            </div>

            {/* Savings Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                <div className="bg-amber-50 w-10 h-10 rounded-xl flex items-center justify-center mb-4">
                  <PiggyBank className="w-5 h-5 text-amber-600" />
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Saved</p>
                <p className="text-xl font-black text-gray-900">{totalSaved.toLocaleString()} VT</p>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                <div className="bg-rose-50 w-10 h-10 rounded-xl flex items-center justify-center mb-4">
                  <Flame className="w-5 h-5 text-rose-600" />
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Redeemed</p>
                <p className="text-xl font-black text-gray-900">{redemptions.length} Deals</p>
              </div>
            </div>

            {/* Favorites Section */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                  Favorites
                </h3>
              </div>
              {favBizs.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {favBizs.slice(0, 3).map(biz => (
                    <div 
                      key={biz.id} 
                      onClick={() => { setSelectedBusiness(biz); setCurrentView('business-detail'); }} 
                      className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer"
                    >
                      <img src={biz.image} className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xs text-gray-900 truncate">{biz.name}</h4>
                        <p className="text-[10px] text-gray-400 truncate uppercase">{biz.location}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                  Nothing saved yet
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'savings' && <SavingsTracker />}
        {activeTab === 'feedback' && <DashboardFeedback />}
      </div>
    </div>
  );
};

export default Dashboard;

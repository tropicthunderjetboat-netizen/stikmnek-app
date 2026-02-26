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
  // Use a try-catch or a null-safe approach to the context
  const context = useAppContext();

  // FIX: Extreme safety destructuring. If any of these are undefined, they become the default [] or null.
  const {
    language = 'en',
    user = null,
    userPass = null,
    userProfile = null,
    favorites = [],
    redemptions = [],
    dbBusinesses = [],
    setSelectedBusiness = () => {},
    setCurrentView = () => {},
    refreshUserPass = async () => {},
    setShowQR = () => {}
  } = context || {};
  
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id && refreshUserPass) {
      refreshUserPass();
    }
  }, [user?.id]);

  // FIX: Optional chaining on length checks
  const allBusinesses = (dbBusinesses?.length > 0) ? dbBusinesses : localBusinesses;
  const favBizs = allBusinesses.filter(b => favorites?.includes(b.id));
  const totalSaved = redemptions?.reduce((sum: number, r: any) => sum + (r.saved || 0), 0) || 0;

  // LOADING GUARD: If we don't have a user yet, don't even try to render the stats
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <RefreshCw className="w-10 h-10 text-teal-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading your profile...</p>
      </div>
    );
  }

  const getPassDetails = (passType: string | null) => {
    const type = (passType || '').toLowerCase();
    if (type.includes('family')) return { name: 'Family Explorer Pass', bg: 'from-teal-400 to-emerald-600', icon: <Compass className="w-6 h-6 text-white" /> };
    if (type.includes('extended')) return { name: 'Extended Group Adventure Pass', bg: 'from-blue-500 to-indigo-700', icon: <Users className="w-6 h-6 text-white" /> };
    if (type.includes('ultimate')) return { name: 'Ultimate Crew Experience Pass', bg: 'from-purple-500 via-fuchsia-600 to-pink-600', icon: <Crown className="w-6 h-6 text-white" /> };
    return { name: 'Vanuatu Experience Pass', bg: 'from-gray-800 to-black', icon: <Ticket className="w-6 h-6 text-white" /> };
  };

  const passDetails = getPassDetails(userPass?.pass_type);

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans">
      {/* Header */}
      <div className="bg-white px-6 pt-8 pb-6 border-b border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {language === 'en' ? 'My Dashboard' : 'Mon Tableau de bord'}
            </h1>
            <p className="text-sm text-gray-500 font-medium">
              Welcome, {userProfile?.name || user.email?.split('@')[0]}
            </p>
          </div>
          <button 
            onClick={() => {
              setIsRefreshing(true);
              refreshUserPass().finally(() => setIsRefreshing(false));
            }}
            className={`p-2 rounded-full transition-all ${isRefreshing ? 'animate-spin text-teal-600' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {(['overview', 'savings', 'analytics', 'feedback'] as DashboardTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                activeTab === tab ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* PASS CARD */}
            {userPass ? (
              <div 
                onClick={() => setShowQR(userPass.id)}
                className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-xl cursor-pointer active:scale-[0.98] transition-transform bg-gradient-to-br ${passDetails.bg}`}
              >
                <div className="relative z-10 flex justify-between items-start mb-6">
                  <div className="flex items-center gap-2">
                    {passDetails.icon}
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90">{passDetails.name}</span>
                  </div>
                  <ShieldCheck className="w-5 h-5 opacity-50" />
                </div>

                <div className="relative z-10 bg-white p-3 rounded-2xl mx-auto w-40 h-40 flex items-center justify-center shadow-inner">
                  <QRCodeDisplay value={userPass.id} size={130} />
                  <div className="absolute -bottom-2 bg-teal-600 text-[9px] px-3 py-1 rounded-full font-bold border-2 border-white shadow-md">
                    TAP TO SCAN
                  </div>
                </div>

                <div className="mt-8 flex justify-between items-end border-t border-white/20 pt-4 font-mono">
                  <div>
                    <p className="text-[9px] uppercase opacity-70 italic">Expires</p>
                    <p className="text-xs font-bold">{new Date(userPass.expires_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase opacity-70 italic">Pass ID</p>
                    <p className="text-[10px] font-bold">#{userPass.id?.substring(0, 8).toUpperCase()}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-8 text-center border-2 border-dashed border-gray-200">
                <Ticket className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <h3 className="font-bold text-gray-800">No Active Pass</h3>
                <p className="text-xs text-gray-500 mb-4">Get a pass to unlock exclusive deals.</p>
                <button 
                  onClick={() => setCurrentView('passes')}
                  className="bg-teal-600 text-white px-8 py-3 rounded-xl font-bold text-sm"
                >
                  View Passes
                </button>
              </div>
            )}

            {/* QUICK STATS */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <Flame className="w-5 h-5 text-orange-500 mb-2" />
                <p className="text-2xl font-black text-gray-900">{redemptions?.length || 0}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Visits</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <PiggyBank className="w-5 h-5 text-green-500 mb-2" />
                <p className="text-2xl font-black text-gray-900">{totalSaved} VT</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Saved</p>
              </div>
            </div>

            {/* FAVORITES PREVIEW */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-tight">
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

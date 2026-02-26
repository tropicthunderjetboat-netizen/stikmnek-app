import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { businesses as localBusinesses } from '@/data/businesses';
import {
  Ticket, Heart, QrCode, Calendar, ChevronRight,
  LayoutDashboard, PiggyBank, BarChart3,
  MapPin, Star, Flame, Compass, Users,
  MessageCircle, Crown, Info, RefreshCw, ShieldCheck
} from 'lucide-react';

import QRCodeDisplay from './QRCodeDisplay';
import SavingsTracker from './SavingsTracker';
import DashboardFeedback from './DashboardFeedback';

type DashboardTab = 'overview' | 'savings' | 'analytics' | 'feedback';

const Dashboard: React.FC = () => {
  // FIXED: Added default values [] to prevent "Cannot read properties of undefined (reading 'length')"
  const {
    language, 
    user, 
    userPass, 
    userProfile,
    favorites = [], 
    redemptions = [], 
    setSelectedBusiness, 
    setCurrentView, 
    dbBusinesses = [], 
    refreshUserPass,
    setShowQR
  } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    refreshUserPass();
  }, []);

  // FIXED: Added safety guard. If data isn't ready, show a spinner instead of crashing.
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;
  const favBizs = allBusinesses.filter(b => favorites.includes(b.id));
  const totalSaved = redemptions.reduce((sum, r) => sum + r.saved, 0);

  // BRANDED PASS LOGIC
  const getPassDetails = (passType: string | null) => {
    const type = (passType || '').toLowerCase();
    if (type.includes('family') || type.includes('explorer')) {
      return { 
        name: 'Family Explorer Pass', 
        bg: 'from-teal-400 to-emerald-600', 
        icon: <Compass className="w-6 h-6 text-white" /> 
      };
    }
    if (type.includes('extended') || type.includes('adventure')) {
      return { 
        name: 'Extended Group Adventure Pass', 
        bg: 'from-blue-500 to-indigo-700', 
        icon: <Users className="w-6 h-6 text-white" /> 
      };
    }
    if (type.includes('ultimate') || type.includes('crew')) {
      return { 
        name: 'Ultimate Crew Experience Pass', 
        bg: 'from-purple-500 via-fuchsia-600 to-pink-600', 
        icon: <Crown className="w-6 h-6 text-white" /> 
      };
    }
    return { 
      name: 'Vanuatu Experience Pass', 
      bg: 'from-gray-700 to-black', 
      icon: <Ticket className="w-6 h-6 text-white" /> 
    };
  };

  const passDetails = getPassDetails(userPass?.pass_type);

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
              {language === 'en' 
                ? `Welcome, ${userProfile?.name || user.email?.split('@')[0]}` 
                : `Bienvenue, ${userProfile?.name || user.email?.split('@')[0]}`}
            </p>
          </div>
          <button 
            onClick={refreshUserPass}
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
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {/* ── BRANDED PASS SECTION ── */}
            {userPass ? (
              <div 
                onClick={() => setShowQR(userPass.id)}
                className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-xl cursor-pointer transition-transform hover:scale-[1.01] bg-gradient-to-br ${passDetails.bg}`}
              >
                <div className="relative flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {passDetails.icon}
                      <span className="text-[10px] font-black tracking-widest opacity-90 uppercase">
                        {passDetails.name}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold uppercase truncate max-w-[200px]">
                       {userProfile?.name || user.email?.split('@')[0]}
                    </h2>
                  </div>
                  <ShieldCheck className="w-6 h-6 opacity-50" />
                </div>

                {/* QR Code Container */}
                <div className="relative bg-white p-3 rounded-2xl mx-auto w-44 h-44 flex flex-col items-center justify-center shadow-inner group">
                  <QRCodeDisplay value={userPass.id} size={140} />
                  <div className="absolute -bottom-2 bg-teal-600 text-[9px] px-4 py-1.5 rounded-full font-bold border-2 border-white shadow-md animate-bounce-slow">
                    {language === 'en' ? 'TAP TO EXPAND' : 'TAPPER POUR SCANNER'}
                  </div>
                </div>

                <div className="mt-8 flex justify-between items-end border-t border-white/10 pt-4">
                  <div>
                    <p className="text-[9px] uppercase tracking-tighter opacity-70">Valid Thru</p>
                    <p className="text-sm font-mono font-bold">
                      {new Date(userPass.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-tighter opacity-70">Pass ID</p>
                    <p className="text-[10px] font-mono opacity-80 uppercase tracking-widest">
                      #{userPass.id.substring(0, 8)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 text-center border-2 border-dashed border-gray-200">
                <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">No Active Pass</h3>
                <button 
                  onClick={() => setCurrentView('passes')}
                  className="mt-2 bg-teal-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm"
                >
                  View Passes
                </button>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <Flame className="w-5 h-5 text-orange-500 mb-2" />
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Visits</p>
                <p className="text-xl font-black text-gray-900">{redemptions.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <PiggyBank className="w-5 h-5 text-green-500 mb-2" />
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Saved</p>
                <p className="text-xl font-black text-gray-900">{totalSaved} VT</p>
              </div>
            </div>

            {/* Favorites List */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  Favorites
                </h3>
              </div>
              
              {favBizs.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {favBizs.map(biz => (
                    <div 
                      key={biz.id}
                      onClick={() => { setSelectedBusiness(biz); setCurrentView('business-detail'); }}
                      className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden">
                        <img src={biz.image} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-gray-900 truncate">{biz.name}</h4>
                        <p className="text-[10px] text-gray-400">{biz.location}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-400 text-sm italic">
                  No favorites yet
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

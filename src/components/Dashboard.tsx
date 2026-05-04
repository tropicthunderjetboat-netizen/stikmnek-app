import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getPassDisplayTitle } from '@/data/pricing';
import type { PassProductId } from '@/data/passCatalog';
import { t } from '@/data/translations';
import { businesses as localBusinesses } from '@/data/businesses';
import {
  Ticket, Heart, History, QrCode, Calendar, ChevronRight, Wifi,
  LayoutDashboard, TrendingUp, BarChart3,
  MapPin, Star, Zap, Target, Clock, Flame, Sparkles,
} from 'lucide-react';

import QRCodeDisplay from './QRCodeDisplay';
import ProfilePassPreferencesForm from '@/components/ProfilePassPreferencesForm';

type DashboardTab = 'overview' | 'analytics';

const Dashboard: React.FC = () => {
  const {
    language, user, favorites, redemptions, setSelectedBusiness, setCurrentView, dbBusinesses,
    refreshRedemptions, purchasePass,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  useEffect(() => {
    void refreshRedemptions();
  }, [refreshRedemptions]);

  if (!user) return null;

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;
  const favBizs = allBusinesses.filter(b => favorites.includes(b.id));
  const totalSaved = redemptions.reduce((sum, r) => sum + r.saved, 0);

  // Analytics data
  const analytics = useMemo(() => {
    const uniqueBusinesses = new Set(redemptions.map(r => r.businessId));
    const categoryBreakdown: Record<string, { count: number; saved: number }> = {};

    redemptions.forEach(r => {
      const biz = allBusinesses.find(b => b.id === r.businessId);
      if (biz) {
        if (!categoryBreakdown[biz.category]) {
          categoryBreakdown[biz.category] = { count: 0, saved: 0 };
        }
        categoryBreakdown[biz.category].count++;
        categoryBreakdown[biz.category].saved += r.saved;
      }
    });

    // Top categories
    const topCategories = Object.entries(categoryBreakdown)
      .sort(([, a], [, b]) => b.saved - a.saved)
      .slice(0, 5);

    // Most visited businesses
    const bizVisitCount: Record<string, number> = {};
    redemptions.forEach(r => {
      bizVisitCount[r.businessId] = (bizVisitCount[r.businessId] || 0) + 1;
    });
    const topBusinesses = Object.entries(bizVisitCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => ({ business: allBusinesses.find(b => b.id === id), count }));

    // Streak calculation
    const dates = [...new Set(redemptions.map(r => r.date))].sort().reverse();
    let streak = 0;
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      if (dates[i] === expected) streak++;
      else break;
    }

    return {
      uniqueBusinesses: uniqueBusinesses.size,
      topCategories,
      topBusinesses,
      avgSavingsPerDeal: redemptions.length > 0 ? totalSaved / redemptions.length : 0,
      streak,
      totalDeals: redemptions.length,
    };
  }, [redemptions, allBusinesses, totalSaved]);

  const passColors: Record<PassProductId, string> = {
    dynamic: 'from-teal-500 to-emerald-600',
  };

  const categoryLabels: Record<string, string> = {
    dining: language === 'en' ? 'Dining' : language === 'fr' ? 'Restauration' : 'Kakae',
    activities: language === 'en' ? 'Activities' : language === 'fr' ? 'Activités' : 'Aktiviti',
    tours: language === 'en' ? 'Tours' : language === 'fr' ? 'Visites' : 'Tua',
    shopping: language === 'en' ? 'Shopping' : 'Shopping',
    spa: language === 'en' ? 'Spa' : 'Spa',
    accommodation: language === 'en' ? 'Accommodation' : language === 'fr' ? 'Hébergement' : 'Ples blong slip',
  };

  const categoryColors: Record<string, string> = {
    dining: 'from-orange-400 to-orange-600',
    activities: 'from-blue-400 to-blue-600',
    tours: 'from-emerald-400 to-emerald-600',
    shopping: 'from-pink-400 to-pink-600',
    spa: 'from-purple-400 to-purple-600',
    accommodation: 'from-amber-400 to-amber-600',
  };

  const tabLabels = {
    overview: { en: 'Overview', fr: 'Aperçu', bi: 'Ovaviu' },
    analytics: { en: 'My Analytics', fr: 'Mes analyses', bi: 'Analitiks blong mi' },
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-teal-200">
            {user.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">{t('dash.title', language)}</h1>
            <p className="text-gray-500">{user.email}</p>
          </div>
        </div>

        {/* Tab Navigation — full-width on small screens for reliable touch + clear state */}
        <div
          className="relative z-10 mb-8 grid grid-cols-2 gap-1 rounded-xl border border-gray-100 bg-white p-1 shadow-sm sm:flex sm:w-fit sm:grid-cols-none touch-manipulation"
          role="tablist"
          aria-label={language === 'en' ? 'Dashboard sections' : 'Sections du tableau de bord'}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all sm:px-5 sm:py-2.5 ${
              activeTab === 'overview'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-200'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className="text-center leading-tight">{tabLabels.overview[language]}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'analytics'}
            onClick={() => setActiveTab('analytics')}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all sm:px-5 sm:py-2.5 ${
              activeTab === 'analytics'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-200'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="text-center leading-tight">{tabLabels.analytics[language]}</span>
          </button>
        </div>

        {/* ─── OVERVIEW TAB ─── */}
        {activeTab === 'overview' && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mb-2"><Ticket className="w-5 h-5 text-teal-600" /></div>
                <p className="text-2xl font-bold text-gray-900">{user.pass ? '1' : '0'}</p>
                <p className="text-xs text-gray-500">{t('dash.passes', language)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-2"><Heart className="w-5 h-5 text-red-500" /></div>
                <p className="text-2xl font-bold text-gray-900">{favorites.length}</p>
                <p className="text-xs text-gray-500">{t('dash.favorites', language)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-2"><History className="w-5 h-5 text-purple-600" /></div>
                <p className="text-2xl font-bold text-gray-900">{redemptions.length}</p>
                <p className="text-xs text-gray-500">{language === 'en' ? 'Redeemed' : language === 'fr' ? 'Utilisés' : 'Yusim'}</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 shadow-sm border border-green-100 text-left">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-green-700">{totalSaved.toLocaleString()}<span className="text-xs font-semibold text-green-500 ml-1">VT</span></p>
                <p className="text-xs text-green-600 font-medium">
                  {language === 'en' ? 'Total saved (redemptions)' : language === 'fr' ? 'Total économisé (utilisations)' : 'Total sevem (redim)'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Pass Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-5 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2"><Ticket className="w-5 h-5 text-teal-600" />{t('dash.passes', language)}</h3>
                  </div>
                  {user.pass ? (
                    <div className="p-5">
                      <div className={`relative bg-gradient-to-r ${passColors[user.pass] ?? passColors.dynamic} rounded-2xl p-6 text-white overflow-hidden`}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-6 -translate-x-6" />
                        <div className="relative">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-white/80 text-sm font-medium uppercase tracking-wider">StikmNek Pass</span>
                            <QrCode className="w-6 h-6 text-white/80" />
                          </div>
                          <h4 className="text-2xl font-bold mb-1 leading-snug">{user.pass ? getPassDisplayTitle(user.pass, language) : ''}</h4>
                          <div className="flex items-center gap-4 text-sm text-white/80">
                            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{language === 'en' ? 'Expires: ' : 'Expire: '}{user.passExpiry}</span>
                          </div>
                          {(user.passValidFrom || user.passValidUntil) && (
                            <div className="mt-3 p-3 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20">
                              <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider mb-1.5">
                                {language === 'en' ? 'Discount Validity Period' : language === 'fr' ? 'Période de validité' : 'Taem blong Diskount'}
                              </p>
                              <div className="flex items-center gap-3 text-sm">
                                <div className="flex-1">
                                  <p className="text-[10px] text-white/60">{language === 'en' ? 'Valid From' : language === 'fr' ? 'Valide du' : 'Stat'}</p>
                                  <p className="font-bold text-white">{user.passValidFrom ? new Date(user.passValidFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</p>
                                </div>
                                <div className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                                  {language === 'en' ? 'to' : language === 'fr' ? 'au' : 'go'}
                                </div>
                                <div className="flex-1 text-right">
                                  <p className="text-[10px] text-white/60">{language === 'en' ? 'Valid Until' : language === 'fr' ? 'Valide jusqu\'au' : 'Finis'}</p>
                                  <p className="font-bold text-white">{user.passValidUntil ? new Date(user.passValidUntil + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</p>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="mt-3 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                            <span className="text-xs text-white/70">{language === 'en' ? 'Active' : 'Actif'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-gray-400 mb-4">{t('dash.nopass', language)}</p>
                      <button
                        type="button"
                        onClick={() => void purchasePass()}
                        className="px-6 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
                      >
                        {t('hero.cta', language)}
                      </button>
                    </div>
                  )}
                </div>

                {/* Redemption History (compact) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2"><History className="w-5 h-5 text-purple-600" />{t('dash.history', language)}</h3>
                    {redemptions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('analytics')}
                        className="text-xs text-teal-600 font-semibold hover:text-teal-700 flex items-center gap-1 transition-colors"
                      >
                        {language === 'en' ? 'Insights' : language === 'fr' ? 'Analyses' : 'Analitiks'}
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {redemptions.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {redemptions.slice(0, 5).map((r, i) => {
                        const biz = allBusinesses.find(b => b.id === r.businessId);
                        if (!biz) return null;
                        return (
                          <div key={i} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => { setSelectedBusiness(biz); setCurrentView('business-detail'); }}>
                            <img src={biz.image} alt={biz.name} className="w-12 h-12 rounded-xl object-cover" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-gray-900 truncate">{biz.name}</p>
                              <p className="text-xs text-gray-400">{r.date}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-green-600">-{r.saved.toLocaleString()} VT</p>
                              <p className="text-[10px] text-gray-400">{language === 'en' ? 'saved' : 'économisé'}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                          </div>
                        );
                      })}
                      {redemptions.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('analytics')}
                          className="w-full p-3 text-center text-sm text-teal-600 font-semibold hover:bg-teal-50 transition-colors"
                        >
                          {language === 'en' ? `More stats (${redemptions.length} redemptions)` : language === 'fr' ? `Plus de stats (${redemptions.length})` : `Moa stats (${redemptions.length})`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      {language === 'en' ? 'No redemptions yet. Start exploring deals!' : language === 'fr' ? 'Pas encore d\'utilisations. Explorez les offres!' : 'No gat yusim yet. Stat eksploarem dils!'}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {user.pass && user.passId && (
                  <QRCodeDisplay />
                )}

                {/* Savings quick glance → analytics */}
                {user.type === 'tourist' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-500" />
                        {t('dash.pass_prefs_title', language)}
                      </h3>
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-muted-foreground mb-4">{t('dash.pass_prefs_sub', language)}</p>
                      <ProfilePassPreferencesForm />
                    </div>
                  </div>
                )}

                {totalSaved > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('analytics')}
                    className="w-full bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white text-left shadow-lg shadow-teal-200/50 hover:shadow-xl hover:shadow-teal-200/60 transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{language === 'en' ? 'Your savings' : language === 'fr' ? 'Vos économies' : 'Sevin blong yu'}</p>
                        <p className="text-xs text-white/60">{language === 'en' ? 'Open analytics' : language === 'fr' ? 'Voir les analyses' : 'Openem analitiks'}</p>
                      </div>
                    </div>
                    <p className="text-3xl font-black">{totalSaved.toLocaleString()} <span className="text-lg font-bold text-white/70">VT</span></p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-white/70 group-hover:text-white/90 transition-colors">
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>{language === 'en' ? `from ${redemptions.length} redemptions` : language === 'fr' ? `${redemptions.length} utilisations` : `long ${redemptions.length} redim`}</span>
                      <ChevronRight className="w-3 h-3 ml-auto group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                )}

                {/* Favorites */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-5 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2"><Heart className="w-5 h-5 text-red-500" />{t('dash.favorites', language)}</h3>
                  </div>
                  {favBizs.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {favBizs.map(biz => (
                        <div key={biz.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => { setSelectedBusiness(biz); setCurrentView('business-detail'); }}>
                          <img src={biz.image} alt={biz.name} className="w-10 h-10 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{biz.name}</p>
                            <p className="text-xs text-gray-400">{biz.discount}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <p className="text-sm text-gray-400">{language === 'en' ? 'No favorites yet' : language === 'fr' ? 'Pas encore de favoris' : 'No gat favrit yet'}</p>
                    </div>
                  )}
                </div>

                {/* DB Status */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Wifi className="w-5 h-5 text-green-600" /></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{language === 'en' ? 'Connected to Database' : language === 'fr' ? 'Connecté à la base de données' : 'Konetim long Database'}</p>
                      <p className="text-xs text-gray-400">{language === 'en' ? 'Real-time sync active' : language === 'fr' ? 'Synchronisation en temps réel' : 'Riel-taem sink aktiv'}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    {language === 'en'
                      ? 'Your data is securely stored and synced across devices. QR codes work offline too!'
                      : language === 'fr'
                        ? 'Vos données sont stockées en toute sécurité et synchronisées entre les appareils.'
                        : 'Data blong yu i sef mo sink akros olgeta divaes.'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ─── ANALYTICS TAB ─── */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Analytics Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-24 translate-x-24" />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center">
                  <BarChart3 className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{language === 'en' ? 'Your Travel Analytics' : 'Vos analyses de voyage'}</h2>
                  <p className="text-white/70 text-sm">{language === 'en' ? 'Insights into your StikmNek activity' : 'Aperçu de votre activité StikmNek'}</p>
                </div>
              </div>
            </div>

            {/* Quick Insight Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{analytics.uniqueBusinesses}</p>
                <p className="text-xs text-gray-500">{language === 'en' ? 'Places Visited' : 'Lieux visités'}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{analytics.avgSavingsPerDeal > 0 ? Math.round(analytics.avgSavingsPerDeal).toLocaleString() : '0'}<span className="text-xs text-gray-400 ml-1">VT</span></p>
                <p className="text-xs text-gray-500">{language === 'en' ? 'Avg. Savings/Deal' : 'Écon. moy./offre'}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{analytics.streak}</p>
                <p className="text-xs text-gray-500">{language === 'en' ? 'Day Streak' : 'Jours consécutifs'}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-2">
                  <Zap className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalDeals}</p>
                <p className="text-xs text-gray-500">{language === 'en' ? 'Total Deals Used' : 'Total offres utilisées'}</p>
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-600" />
                  {language === 'en' ? 'Spending by Category' : 'Dépenses par catégorie'}
                </h3>
              </div>
              <div className="p-5">
                {analytics.topCategories.length > 0 ? (
                  <div className="space-y-4">
                    {analytics.topCategories.map(([cat, data]) => {
                      const maxSaved = Math.max(...analytics.topCategories.map(([, d]) => d.saved));
                      const pct = maxSaved > 0 ? (data.saved / maxSaved) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${categoryColors[cat] || 'from-gray-400 to-gray-600'} flex items-center justify-center text-white text-[10px] font-bold`}>
                                {(categoryLabels[cat] || cat).charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{categoryLabels[cat] || cat}</p>
                                <p className="text-[10px] text-gray-400">{data.count} {language === 'en' ? 'deals' : 'offres'}</p>
                              </div>
                            </div>
                            <p className="text-sm font-bold text-green-600">{data.saved.toLocaleString()} VT</p>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full bg-gradient-to-r ${categoryColors[cat] || 'from-gray-400 to-gray-600'} transition-all duration-700`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Target className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">{language === 'en' ? 'No category data yet. Start redeeming deals!' : 'Pas encore de données. Commencez à utiliser des offres!'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Most Visited */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  {language === 'en' ? 'Your Top Businesses' : 'Vos entreprises préférées'}
                </h3>
              </div>
              {analytics.topBusinesses.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {analytics.topBusinesses.map((item, i) => {
                    if (!item.business) return null;
                    return (
                      <div
                        key={item.business.id}
                        className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => { setSelectedBusiness(item.business!); setCurrentView('business-detail'); }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 text-sm font-bold">
                          {i + 1}
                        </div>
                        <img src={item.business.image} alt={item.business.name} className="w-12 h-12 rounded-xl object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{item.business.name}</p>
                          <p className="text-xs text-gray-400">{item.business.location}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">{item.count}x</p>
                          <p className="text-[10px] text-gray-400">{language === 'en' ? 'visits' : 'visites'}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Star className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">{language === 'en' ? 'Visit businesses to see your favorites here' : 'Visitez des entreprises pour voir vos favoris ici'}</p>
                </div>
              )}
            </div>

            {/* Explore More */}
            <div className="text-center">
              <button
                onClick={() => setCurrentView('deals')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200"
              >
                <Zap className="w-4 h-4" />
                {language === 'en' ? 'Explore More Deals' : 'Explorer plus d\'offres'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;

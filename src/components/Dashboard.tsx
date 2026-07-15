import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { clampPartySize } from '@/data/pricing';
import { t } from '@/data/translations';
import { businesses as localBusinesses } from '@/data/businesses';
import { getHolidayPassMaskDisplay } from '@/lib/holidayPassDisplay';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';
import { businessesMatchingFavoriteKeys } from '@/lib/favoritesUi';
import { dealPathForBusiness } from '@/lib/dealUrl';
import { partyCountsFromTouristProfile, computeRedemptionSavingsForListing } from '@/lib/redemptionSavings';
import { APPROX_VTU_PER_AUD, approximateAudFromVatu, approximateVatuFromAud } from '@/lib/passValueDisplay';
import type { Business } from '@/data/businesses';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Ticket, Heart, History, ChevronRight, Wifi,
  LayoutDashboard, TrendingUp, BarChart3,
  MapPin, Star, Zap, Target, Clock, Flame, Users, Share2, Loader2, Pencil,
  Wallet, Sparkles, PartyPopper,
} from 'lucide-react';

import QRCodeDisplay from './QRCodeDisplay';
import PassTicketCard from './PassTicketCard';

type DashboardTab = 'overview' | 'analytics';

function resolveListingForRedemption(
  r: { businessId: string; offeringId: string | null },
  listings: Business[],
): Business | undefined {
  if (r.offeringId) {
    const byOffering = listings.find((b) => b.id === r.offeringId);
    if (byOffering) return byOffering;
  }
  return listings.find((b) => profileBusinessIdFor(b) === r.businessId);
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    language, user, userProfile, favorites, redemptions, setSelectedBusiness, setCurrentView, dbBusinesses,
    refreshRedemptions, purchasePass, refreshUserPass,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    void refreshRedemptions();
    void refreshUserPass();
  }, [refreshRedemptions, refreshUserPass]);

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;
  const favBizs = useMemo(
    () => businessesMatchingFavoriteKeys(allBusinesses, favorites),
    [allBusinesses, favorites],
  );

  const party = useMemo(() => partyCountsFromTouristProfile(userProfile), [userProfile]);

  /** When `saved_amount` was missing in DB (legacy redemptions), estimate from listing + profile party. */
  const redemptionsForAnalytics = useMemo(() => {
    return redemptions.map((r) => {
      if (r.saved > 0) return r;
      const listing = resolveListingForRedemption(r, allBusinesses);
      if (!listing) return r;
      const { savedAmount } = computeRedemptionSavingsForListing(
        {
          pricing_tiers: listing.pricingTiers ?? null,
          original_price: listing.originalPrice,
          deal_price: listing.dealPrice,
        },
        party,
      );
      return savedAmount > 0 ? { ...r, saved: savedAmount } : r;
    });
  }, [redemptions, allBusinesses, party]);

  const totalSaved = useMemo(
    () => redemptionsForAnalytics.reduce((sum, r) => sum + r.saved, 0),
    [redemptionsForAnalytics],
  );

  const passVtApprox = useMemo(() => {
    const aud = user?.passAmountPaidAud;
    if (aud == null || !Number.isFinite(aud) || aud <= 0) return null;
    return approximateVatuFromAud(aud);
  }, [user?.passAmountPaidAud]);

  const netSavingsVsPassVtApprox =
    passVtApprox != null ? totalSaved - passVtApprox : null;

  const totalSavedAudApprox = totalSaved > 0 ? approximateAudFromVatu(totalSaved) : 0;
  const netBalanceAudApprox =
    netSavingsVsPassVtApprox != null && netSavingsVsPassVtApprox !== 0
      ? approximateAudFromVatu(netSavingsVsPassVtApprox)
      : null;

  /** Deal savings in VT strictly exceed approximate pass cost — show celebration. */
  const isPassCostBeaten =
    netSavingsVsPassVtApprox != null && netSavingsVsPassVtApprox > 0;

  // Analytics data
  const analytics = useMemo(() => {
    const uniqueBusinesses = new Set(redemptionsForAnalytics.map(r => r.businessId));
    const categoryBreakdown: Record<string, { count: number; saved: number }> = {};

    redemptionsForAnalytics.forEach(r => {
      const biz = resolveListingForRedemption(r, allBusinesses) ??
        allBusinesses.find((b) => profileBusinessIdFor(b) === r.businessId);
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
    redemptionsForAnalytics.forEach(r => {
      bizVisitCount[r.businessId] = (bizVisitCount[r.businessId] || 0) + 1;
    });
    const topBusinesses = Object.entries(bizVisitCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => ({
        business: allBusinesses.find((b) => profileBusinessIdFor(b) === id),
        count,
      }));

    // Streak calculation
    const dates = [...new Set(redemptionsForAnalytics.map(r => r.date))].sort().reverse();
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
      avgSavingsPerDeal:
        redemptionsForAnalytics.length > 0 ? totalSaved / redemptionsForAnalytics.length : 0,
      streak,
      totalDeals: redemptionsForAnalytics.length,
    };
  }, [redemptionsForAnalytics, allBusinesses, totalSaved]);

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

  const holidayPassUi = useMemo(
    () =>
      getHolidayPassMaskDisplay({
        validFrom: user?.passValidFrom,
        validUntil: user?.passValidUntil,
        shareBonusApplied: user?.shareBonusApplied,
        isExtendedPass: null,
      }),
    [user?.passValidFrom, user?.passValidUntil, user?.shareBonusApplied],
  );

  const fmtPassDate = useCallback(
    (isoDate: string | null | undefined) => {
      if (!isoDate) return '-';
      const d = String(isoDate).slice(0, 10);
      const loc = language === 'fr' ? 'fr-FR' : 'en-US';
      return new Date(`${d}T12:00:00`).toLocaleDateString(loc, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    },
    [language],
  );

  const passLang = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';

  const handleUnlockSecondWeek = useCallback(async () => {
    if (!user?.id || shareBusy) return;
    setShareBusy(true);
    try {
      let shareSucceeded = false;
      const shareData = {
        title: 'StikmNek',
        text: t('share.holiday_navigator_body', passLang),
        url: typeof window !== 'undefined' ? window.location.origin : '',
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
          shareSucceeded = true;
        } catch (e: unknown) {
          const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
          if (name === 'AbortError') {
            setShareBusy(false);
            return;
          }
          try {
            await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
            shareSucceeded = true;
            toast.success('Link copied — claiming bonus…');
          } catch {
            toast.error('Could not share or copy link.');
            return;
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
          shareSucceeded = true;
          toast.success('Link copied — claiming bonus…');
        } catch {
          toast.error('Could not copy link.');
          return;
        }
      }
      if (!shareSucceeded) return;

      const { data, error } = await supabase.functions.invoke('extend-pass', {
        body: {
          user_id: user!.id,
          share_proof: `dash_${Date.now()}_passcard`,
          platform: 'dashboard',
        },
      });
      if (error) {
        toast.error(typeof error.message === 'string' ? error.message : 'Could not apply bonus');
        return;
      }
      const d = data as {
        success?: boolean;
        already_claimed?: boolean;
        share_bonus_ineligible?: boolean;
        code?: string;
        error?: string;
        bonus?: { days?: number };
      };
      if (d?.share_bonus_ineligible || d?.code === 'no_active_pass') {
        toast.info(d.error || 'Share bonus is only available on a 7-day holiday pass.');
        return;
      }
      if (d?.already_claimed) {
        toast.info('Share bonus already applied.');
        await refreshUserPass();
        return;
      }
      if (d?.success) {
        const bd = d.bonus?.days ?? 0;
        if (bd > 0) {
          toast.success('Second week unlocked!');
        } else {
          toast.info(d.error || 'No bonus applied for this pass.');
        }
        await refreshUserPass();
        return;
      }
      toast.error(d?.error ?? 'Could not apply bonus');
    } finally {
      setShareBusy(false);
    }
  }, [user?.id, shareBusy, refreshUserPass, passLang]);

  if (!user) {
    return null;
  }

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
              <button
                type="button"
                onClick={() => setCurrentView('my-favorites')}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-left w-full transition-all hover:border-red-200 hover:shadow-md hover:bg-red-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-2">
                  <Heart className="w-5 h-5 text-red-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{favorites.length}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  {t('dash.favorites', language)}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" aria-hidden />
                </p>
              </button>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-2"><History className="w-5 h-5 text-purple-600" /></div>
                <p className="text-2xl font-bold text-gray-900">{redemptions.length}</p>
                <p className="text-xs text-gray-500">{language === 'en' ? 'Redeemed' : language === 'fr' ? 'Utilisés' : 'Yusim'}</p>
              </div>
              <div
                className={`rounded-xl p-4 text-left shadow-sm ${
                  isPassCostBeaten
                    ? 'border-2 border-amber-300/80 bg-gradient-to-br from-amber-50 via-emerald-50 to-teal-50 shadow-md shadow-emerald-100/70 ring-1 ring-fuchsia-200/40'
                    : totalSaved > 0
                      ? 'border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50'
                      : 'border border-green-100 bg-gradient-to-br from-green-50 to-emerald-50'
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      totalSaved > 0
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm'
                        : 'bg-green-100'
                    }`}
                  >
                    <TrendingUp className={`h-5 w-5 ${totalSaved > 0 ? 'text-white' : 'text-green-600'}`} />
                  </div>
                  {isPassCostBeaten && (
                    <Sparkles className="h-5 w-5 text-amber-500" aria-hidden />
                  )}
                </div>
                <p className="text-2xl font-black tracking-tight">
                  {totalSaved > 0 ? (
                    <>
                      <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                        {totalSaved.toLocaleString()}
                      </span>
                      <span className="ml-1 text-sm font-bold text-teal-600/90">VT</span>
                    </>
                  ) : (
                    <>
                      <span className="text-green-700">0</span>
                      <span className="ml-1 text-xs font-semibold text-green-500">VT</span>
                    </>
                  )}
                </p>
                {totalSaved > 0 && (
                  <p className="mt-1 text-sm font-extrabold leading-tight">
                    <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                      ≈ A$
                      {totalSavedAudApprox.toLocaleString('en-AU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="ml-1 text-[9px] font-bold uppercase text-gray-500">
                      {language === 'en' ? 'approx.' : language === 'fr' ? 'env.' : 'rid.'}
                    </span>
                  </p>
                )}
                <p className="text-xs font-semibold text-emerald-800">
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
                      <PassTicketCard partySize={clampPartySize(user.passPeopleCount || 1)}>
                        <div className="mt-3 space-y-3 text-left">
                          {holidayPassUi.isHolidayPass && (
                            <p className="text-xs font-semibold text-teal-800">
                              {holidayPassUi.showFirstWeekOnly
                                ? t('share.dashboard_coverage_pill', passLang)
                                : language === 'fr'
                                  ? `${holidayPassUi.truthSpanDays} jours (bonus inclus)`
                                  : language === 'bi'
                                    ? `${holidayPassUi.truthSpanDays} dei (bonus)`
                                    : `${holidayPassUi.truthSpanDays} days (bonus included)`}
                            </p>
                          )}
                          {(user.passValidFrom || user.passValidUntil) && (
                            <div className="rounded-xl bg-white/80 border border-teal-100 px-3 py-2.5">
                              <p className="text-[10px] font-bold text-[#888888] uppercase tracking-wider mb-1">
                                {language === 'en' ? 'Valid' : language === 'fr' ? 'Valide' : 'Valit'}
                              </p>
                              {holidayPassUi.showFirstWeekOnly && (
                                <p className="text-[10px] font-semibold text-teal-700 mb-1">
                                  {t('share.dashboard_week1_validity', passLang)}
                                </p>
                              )}
                              <p className="text-sm font-semibold text-[#0A0A0A]">
                                {fmtPassDate(user.passValidFrom)}
                                {' → '}
                                {fmtPassDate(
                                  holidayPassUi.showFirstWeekOnly
                                    ? holidayPassUi.displayUntilDateStr
                                    : user.passValidUntil,
                                )}
                              </p>
                            </div>
                          )}
                          {holidayPassUi.isHolidayPass && holidayPassUi.showFirstWeekOnly && (
                            <button
                              type="button"
                              onClick={() => void handleUnlockSecondWeek()}
                              disabled={shareBusy}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0FB5B5] hover:bg-[#0da3a3] text-white text-sm font-bold disabled:opacity-60 transition-colors"
                            >
                              {shareBusy ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  {language === 'fr' ? 'Partage…' : language === 'bi' ? 'Serem…' : 'Sharing…'}
                                </>
                              ) : (
                                <>
                                  <Share2 className="w-4 h-4" />
                                  {t('share.dashboard_unlock_button', passLang)}
                                </>
                              )}
                            </button>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs text-[#555555]">
                              {language === 'en' ? 'Active' : 'Actif'}
                            </span>
                          </div>
                        </div>
                      </PassTicketCard>
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
                    {redemptionsForAnalytics.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('analytics')}
                        className="text-xs text-teal-600 font-semibold hover:text-teal-700 flex items-center gap-1 transition-colors"
                      >
                        {language === 'en' ? 'Insights' : language === 'fr' ? 'Analyses' : 'tingting'}
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {redemptionsForAnalytics.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {redemptionsForAnalytics.slice(0, 5).map((r, i) => {
                        const biz =
                          resolveListingForRedemption(r, allBusinesses) ??
                          allBusinesses.find((b) => profileBusinessIdFor(b) === r.businessId);
                        if (!biz) return null;
                        return (
                          <div key={`${r.businessId}-${r.date}-${i}`} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => { setSelectedBusiness(biz); setCurrentView('business-detail'); navigate(dealPathForBusiness(biz)); }}>
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
                      {redemptionsForAnalytics.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('analytics')}
                          className="w-full p-3 text-center text-sm text-teal-600 font-semibold hover:bg-teal-50 transition-colors"
                        >
                          {language === 'en' ? `More stats (${redemptionsForAnalytics.length} redemptions)` : language === 'fr' ? `Plus de stats (${redemptionsForAnalytics.length})` : `Moa stats (${redemptionsForAnalytics.length})`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      {language === 'en' ? 'No redemptions yet. Start exploring deals!' : language === 'fr' ? 'Pas encore d\'utilisations. Explorez les offres!' : 'No usim yet. Stat eksploarem dils!'}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {user.pass && user.passId && (
                  <QRCodeDisplay />
                )}

                {/* Travel party — profile drives checkout party size */}
                {user.type === 'tourist' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-teal-600" />
                        {language === 'en'
                          ? 'Your travel party'
                          : language === 'fr'
                            ? 'Votre groupe de voyage'
                            : 'Grup blong travel'}
                      </h3>
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-gray-500 mb-4">
                        {language === 'en'
                          ? 'Checkout uses this headcount (ages 6+) from your profile — update it anytime before you buy a pass.'
                          : language === 'fr'
                            ? 'Le paiement utilise ces voyageurs (6 ans et +) depuis votre profil.'
                            : 'Checkout i yusum namba long proaeil blong yu (6+).'}
                      </p>
                      <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4 space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{language === 'en' ? 'Adults' : language === 'fr' ? 'Adultes' : 'Bikman'}</span>
                          <span className="font-bold text-gray-900">{userProfile?.num_adults ?? '—'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {language === 'en' ? 'Children (6+)' : language === 'fr' ? 'Enfants (6+)' : 'Pikinini (6+)'}
                          </span>
                          <span className="font-bold text-gray-900">{userProfile?.num_children ?? '—'}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCurrentView('complete-profile')}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                        {language === 'en' ? 'Edit profile' : language === 'fr' ? 'Modifier le profil' : 'jesem profael'}
                      </button>
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
                        <p className="text-sm font-bold">{language === 'en' ? 'Your savings' : language === 'fr' ? 'Vos économies' : 'Seving blong yu'}</p>
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
                          onClick={() => { setSelectedBusiness(biz); setCurrentView('business-detail'); navigate(dealPathForBusiness(biz)); }}>
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
                      <p className="text-xs text-gray-400">{language === 'en' ? 'Real-time sync active' : language === 'fr' ? 'Synchronisation en temps réel' : 'Ril-taem sink aktiv'}</p>
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
            <div
              className={`rounded-2xl p-6 text-white relative overflow-hidden ${
                isPassCostBeaten
                  ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500 shadow-lg shadow-fuchsia-300/30'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600'
              }`}
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-24 translate-x-24" />
              {isPassCostBeaten && (
                <Sparkles className="absolute top-4 right-20 w-6 h-6 text-yellow-200/90 animate-pulse" aria-hidden />
              )}
              <div className="relative flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    isPassCostBeaten ? 'bg-white/25 ring-2 ring-white/40' : 'bg-white/15'
                  }`}
                >
                  <BarChart3 className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{language === 'en' ? 'Your Travel Analytics' : 'Vos analyses de voyage'}</h2>
                  <p className="text-white/80 text-sm">
                    {isPassCostBeaten
                      ? language === 'en'
                        ? 'Your deal savings are ahead of your pass — keep stacking the wins!'
                        : language === 'fr'
                          ? 'Vos économies dépassent le pass — continuez comme ça !'
                          : 'Sevin i win long pass — go hed!'
                      : language === 'en'
                        ? 'Insights into your StikmNek activity'
                        : language === 'fr'
                          ? 'Aperçu de votre activité StikmNek'
                          : 'luk iko insaet  long StikmNek aktiviti'}
                  </p>
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
              <div
                className={`rounded-xl p-4 shadow-sm border ${
                  analytics.totalDeals > 0
                    ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-teal-50 shadow-md shadow-emerald-100/60'
                    : 'border-gray-100 bg-white'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
                    analytics.totalDeals > 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm' : 'bg-green-50'
                  }`}
                >
                  <TrendingUp className={`w-5 h-5 ${analytics.totalDeals > 0 ? 'text-white' : 'text-green-600'}`} />
                </div>
                <p className="text-2xl font-black tracking-tight">
                  {analytics.totalDeals > 0 ? (
                    <>
                      <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                        {Math.round(analytics.avgSavingsPerDeal).toLocaleString()}
                      </span>
                      <span className="text-sm font-bold text-teal-600/80 ml-1">VT</span>
                    </>
                  ) : (
                    <>
                      <span className="text-gray-900">0</span>
                      <span className="text-xs text-gray-400 ml-1">VT</span>
                    </>
                  )}
                </p>
                <p className={`text-xs font-semibold ${analytics.totalDeals > 0 ? 'text-emerald-800' : 'text-gray-500'}`}>
                  {language === 'en' ? 'Avg. Savings/Deal' : 'Écon. moy./offre'}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{analytics.streak}</p>
                <p className="text-xs text-gray-500">{language === 'en' ? 'Day Streak' : 'Jours consécutifs'}</p>
              </div>
              <div
                className={`rounded-xl p-4 shadow-sm border ${
                  isPassCostBeaten
                    ? 'border-amber-200 bg-gradient-to-br from-amber-50 via-fuchsia-50/40 to-violet-50 shadow-md shadow-amber-100/80'
                    : 'border-gray-100 bg-white'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
                    isPassCostBeaten ? 'bg-gradient-to-br from-amber-400 to-fuchsia-600 text-white' : 'bg-purple-50'
                  }`}
                >
                  <Zap className={`w-5 h-5 ${isPassCostBeaten ? 'text-white' : 'text-purple-600'}`} />
                </div>
                <p
                  className={`text-2xl font-black ${isPassCostBeaten ? 'text-fuchsia-800' : 'text-gray-900'}`}
                >
                  {analytics.totalDeals}
                </p>
                <p className={`text-xs font-semibold ${isPassCostBeaten ? 'text-amber-900/80' : 'text-gray-500'}`}>
                  {language === 'en'
                    ? 'Total Deals Used'
                    : language === 'fr'
                      ? 'Total offres utilisées'
                      : 'Total dils'}
                </p>
              </div>
            </div>

            {(user.passId || (user.passAmountPaidAud ?? 0) > 0 || totalSaved > 0) && (
              <div
                className={`relative rounded-2xl overflow-hidden ${
                  isPassCostBeaten
                    ? 'border-2 border-amber-300/90 shadow-xl shadow-amber-200/50 ring-1 ring-fuchsia-300/30'
                    : 'border border-emerald-100 shadow-sm'
                } bg-white`}
              >
                <div
                  className={`relative border-b p-5 ${
                    isPassCostBeaten
                      ? 'border-white/25 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white'
                      : 'border-emerald-50 bg-emerald-50/50'
                  }`}
                >
                  {isPassCostBeaten && (
                    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-2xl" aria-hidden>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                        <span
                          key={i}
                          className={`absolute top-4 h-2 w-2 rounded-sm opacity-90 animate-confetti-drift ${
                            i % 3 === 0 ? 'bg-amber-200' : i % 3 === 1 ? 'bg-white' : 'bg-fuchsia-200'
                          }`}
                          style={{
                            left: `${6 + ((i * 17) % 88)}%`,
                            animationDelay: `${i * 0.1}s`,
                            animationDuration: `${2.1 + (i % 4) * 0.25}s`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="relative z-[1] flex flex-wrap items-start justify-between gap-3">
                    <h3 className="font-bold flex items-center gap-2 text-lg">
                      {isPassCostBeaten ? (
                        <PartyPopper className="h-6 w-6 shrink-0 text-amber-200" aria-hidden />
                      ) : (
                        <Wallet className={`h-5 w-5 shrink-0 ${isPassCostBeaten ? '' : 'text-emerald-700'}`} />
                      )}
                      <span className={isPassCostBeaten ? 'drop-shadow-sm' : 'text-gray-900'}>
                        {language === 'en'
                          ? isPassCostBeaten
                            ? 'You beat the pass cost!'
                            : 'Pass vs deal savings'
                          : language === 'fr'
                            ? isPassCostBeaten
                              ? 'Le pass est amorti !'
                              : 'Pass et économies'
                            : isPassCostBeaten
                              ? 'Yu win long pem blong pass!'
                              : 'Pass mo sevin long deals'}
                      </span>
                    </h3>
                    {isPassCostBeaten && (
                      <Sparkles className="h-8 w-8 shrink-0 text-yellow-200 animate-pulse" aria-hidden />
                    )}
                  </div>
                  {isPassCostBeaten && (
                    <p className="relative z-[1] mt-2 text-sm font-semibold text-white/95 animate-celebration-rise drop-shadow">
                      {language === 'en'
                        ? 'Every VT here is holiday money back in your pocket — epic work!'
                        : language === 'fr'
                          ? 'Chaque VT compte : bravo pour vos économies !'
                          : 'Ol VT ia i helpem pocket blong yu — gudfala wok!'}
                    </p>
                  )}
                  <p
                    className={`relative z-[1] text-xs leading-relaxed ${
                      isPassCostBeaten ? 'mt-2 text-white/85' : 'mt-1.5 text-gray-600'
                    }`}
                  >
                    {language === 'en'
                      ? `Illustrative only: pass payments are in ${user.passCurrency || 'AUD'}; deal savings are in VT. We use about ${APPROX_VTU_PER_AUD} VT per 1 AUD so you can compare — not a bank rate.`
                      : language === 'fr'
                        ? `À titre indicatif : paiement du pass en ${user.passCurrency || 'AUD'}, économies en VT (~${APPROX_VTU_PER_AUD} VT pour 1 AUD).`
                        : `Ol namba ia i rid guides nomo — pass i pem long ${user.passCurrency || 'AUD'}, deals long VT (~${APPROX_VTU_PER_AUD} VT / 1 AUD).`}
                  </p>
                </div>
                <div className={`space-y-4 p-5 text-sm ${isPassCostBeaten ? 'bg-gradient-to-b from-emerald-50/90 via-white to-amber-50/40' : ''}`}>
                  {(user.passAmountPaidAud ?? 0) > 0 ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <span className="shrink-0 text-gray-600">
                        {language === 'en' ? 'Pass price paid' : language === 'fr' ? 'Prix du pass' : 'Pem pass praes'}
                      </span>
                      <div className="text-right sm:max-w-[60%]">
                        <p className="font-semibold text-gray-900">
                          {(user.passCurrency || 'AUD') === 'AUD'
                            ? `A$${Number(user.passAmountPaidAud).toFixed(2)}`
                            : `${user.passCurrency || 'AUD'} ${Number(user.passAmountPaidAud).toFixed(2)}`}
                        </p>
                        {passVtApprox != null && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {language === 'en' ? '≈' : '≈'} {passVtApprox.toLocaleString()} VT
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {language === 'en'
                        ? 'Pass purchase amount will show here after your next checkout syncs.'
                        : language === 'fr'
                          ? 'Le montant payé pour le pass apparaîtra après le prochain paiement.'
                          : 'Taem u Pem  pass bae i kam afta checkout i sink.'}
                    </p>
                  )}
                  <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-gray-700">
                      {language === 'en' ? 'Deal savings (redemptions)' : language === 'fr' ? 'Économies (offres)' : 'Sevin long dils'}
                    </span>
                    <div className="text-right">
                      <span className="block bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-xl font-black text-transparent">
                        {totalSaved.toLocaleString()} VT
                      </span>
                      {totalSaved > 0 && (
                        <div className="mt-1.5 flex flex-col items-end gap-0.5">
                          <span className="block bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 bg-clip-text text-base font-extrabold tracking-tight text-transparent drop-shadow-sm sm:text-lg">
                            ≈ A$
                            {totalSavedAudApprox.toLocaleString('en-AU', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
                            {language === 'en'
                              ? `Approx. AUD (~${APPROX_VTU_PER_AUD} VT = 1 AUD)`
                              : language === 'fr'
                                ? `AUD indicatif (~${APPROX_VTU_PER_AUD} VT = 1 AUD)`
                                : `Rid AUD (~${APPROX_VTU_PER_AUD} VT = 1 AUD)`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {netSavingsVsPassVtApprox != null && (
                    <div className="flex flex-col gap-2 border-t border-gray-200/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium text-gray-800">
                        {language === 'en'
                          ? 'Approx. balance (savings − pass in VT)'
                          : language === 'fr'
                            ? 'Solde indicatif (économies − pass en VT)'
                            : 'Balans rid (sevin − pass long VT)'}
                      </span>
                      {isPassCostBeaten ? (
                        <div className="animate-savings-glow rounded-xl bg-white/90 px-4 py-3 text-center shadow-inner ring-2 ring-emerald-400/40 sm:text-right">
                          <span className="block bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 bg-clip-text text-2xl font-black text-transparent">
                            +{netSavingsVsPassVtApprox.toLocaleString()} VT
                          </span>
                          {netBalanceAudApprox != null && (
                            <>
                              <span className="mt-1.5 block bg-gradient-to-r from-amber-600 via-orange-500 to-rose-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent sm:text-xl">
                                ≈ A$
                                {Math.abs(netBalanceAudApprox).toLocaleString('en-AU', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                                {language === 'en'
                                  ? `Approximate — same ~${APPROX_VTU_PER_AUD} VT per 1 AUD`
                                  : language === 'fr'
                                    ? `Indicatif — même ~${APPROX_VTU_PER_AUD} VT pour 1 AUD`
                                    : `Rid nomo — semak ~${APPROX_VTU_PER_AUD} VT long 1 AUD`}
                              </span>
                            </>
                          )}
                          <span className="mt-1.5 block text-[10px] font-bold uppercase tracking-wide text-emerald-700/90">
                            {language === 'en' ? 'Ahead of your pass' : language === 'fr' ? 'Au-delà du pass' : 'fastaem long pass'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span
                            className={`block text-lg font-black ${
                              netSavingsVsPassVtApprox >= 0 ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {netSavingsVsPassVtApprox >= 0 ? '+' : ''}
                            {netSavingsVsPassVtApprox.toLocaleString()} VT
                          </span>
                          {netBalanceAudApprox != null && (
                            <div className="mt-1 flex flex-col items-end gap-0.5">
                              <span
                                className={`block text-base font-extrabold ${
                                  netSavingsVsPassVtApprox >= 0
                                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent'
                                    : 'bg-gradient-to-r from-amber-700 to-rose-700 bg-clip-text text-transparent'
                                }`}
                              >
                                ≈ {netSavingsVsPassVtApprox >= 0 ? '' : '−'}A$
                                {Math.abs(netBalanceAudApprox).toLocaleString('en-AU', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
                                {language === 'en'
                                  ? `Approx. AUD (~${APPROX_VTU_PER_AUD} VT/AUD)`
                                  : language === 'fr'
                                    ? `AUD indicatif (~${APPROX_VTU_PER_AUD} VT/AUD)`
                                    : `Rid AUD (~${APPROX_VTU_PER_AUD} VT/AUD)`}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Category Breakdown */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-600" />
                  {language === 'en' ? 'Savings by category' : 'Économies par catégorie'}
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
                            <p className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-base font-extrabold text-transparent">
                              {data.saved.toLocaleString()} VT
                            </p>
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
                        onClick={() => { setSelectedBusiness(item.business!); setCurrentView('business-detail'); navigate(dealPathForBusiness(item.business!)); }}
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

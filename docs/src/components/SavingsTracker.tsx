import React, { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses as localBusinesses } from '@/data/businesses';
import {
  TrendingUp,
  MapPin,
  Receipt,
  Target,
  ArrowUpRight,
  Calendar,
  Sparkles,
  Trophy,
  ChevronRight,
  PiggyBank,
  BadgePercent,
  CircleDollarSign,
  Flame,
  PartyPopper,
  Star,
} from 'lucide-react';

const SavingsTracker: React.FC = () => {
  const {
    language,
    user,
    redemptions,
    dbBusinesses,
    setSelectedBusiness,
    setCurrentView,
  } = useAppContext();

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;

  // Pass prices in AUD
  const passPrices: Record<string, number> = {
    daily: 15,
    weekly: 45,
    monthly: 99,

  };

  const stats = useMemo(() => {
    const totalSaved = redemptions.reduce((sum, r) => sum + r.saved, 0);
    const uniqueBusinessIds = new Set(redemptions.map((r) => r.businessId));
    const businessesVisited = uniqueBusinessIds.size;
    const totalRedemptions = redemptions.length;

    // Pass cost
    const passCost = user?.pass ? passPrices[user.pass] || 0 : 0;

    // ROI percentage (savings relative to pass cost)
    // We need to convert savings (VT) to AUD for comparison, or compare in same currency
    // Since pass is in AUD and savings are in VT, let's show ROI as a multiplier
    // Approximate exchange: 1 AUD ≈ 100 VT
    const exchangeRate = 100;
    const savingsInAUD = totalSaved / exchangeRate;
    const roiPercentage = passCost > 0 ? Math.min((savingsInAUD / passCost) * 100, 999) : 0;
    const roiMultiplier = passCost > 0 ? savingsInAUD / passCost : 0;
    const hasBreakEven = savingsInAUD >= passCost && passCost > 0;


    // Average savings per redemption
    const avgSaved = totalRedemptions > 0 ? totalSaved / totalRedemptions : 0;

    // Best single saving
    const bestSaving = redemptions.length > 0 ? Math.max(...redemptions.map((r) => r.saved)) : 0;

    // Savings by category
    const categoryMap: Record<string, number> = {};
    redemptions.forEach((r) => {
      const biz = allBusinesses.find((b) => b.id === r.businessId);
      if (biz) {
        categoryMap[biz.category] = (categoryMap[biz.category] || 0) + r.saved;
      }
    });

    return {
      totalSaved,
      businessesVisited,
      totalRedemptions,
      passCost,
      savingsInAUD,
      roiPercentage,
      roiMultiplier,
      hasBreakEven,
      avgSaved,
      bestSaving,
      categoryMap,
      exchangeRate,
    };

  }, [redemptions, user, allBusinesses]);

  // Enriched redemption list with business details
  const enrichedRedemptions = useMemo(() => {
    return redemptions.map((r) => {
      const biz = allBusinesses.find((b) => b.id === r.businessId);
      return { ...r, business: biz };
    });
  }, [redemptions, allBusinesses]);

  // Group redemptions by month
  const groupedByMonth = useMemo(() => {
    const groups: Record<string, typeof enrichedRedemptions> = {};
    enrichedRedemptions.forEach((r) => {
      const date = new Date(r.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [enrichedRedemptions]);

  const labels = {
    title: {
      en: 'Savings Tracker',
      fr: 'Suivi des économies',
      bi: 'Sevin Traka',
    },
    subtitle: {
      en: 'See how much value you\'re getting from your StikmNek pass',
      fr: 'Découvrez la valeur de votre pass StikmNek',
      bi: 'Lukim hamas valiu yu kasem long StikmNek pas blong yu',
    },
    totalSaved: {
      en: 'Total Saved',
      fr: 'Total économisé',
      bi: 'Total Sevem',
    },
    businessesVisited: {
      en: 'Businesses Visited',
      fr: 'Entreprises visitées',
      bi: 'Bisnis Visitim',
    },
    dealsRedeemed: {
      en: 'Deals Redeemed',
      fr: 'Offres utilisées',
      bi: 'Dils Yusim',
    },
    passValue: {
      en: 'Pass Value Recovered',
      fr: 'Valeur du pass récupérée',
      bi: 'Valiu blong Pas Rikava',
    },
    roiLabel: {
      en: 'Return on Pass Investment',
      fr: 'Retour sur investissement du pass',
      bi: 'Riten long Pas Investmen',
    },
    breakEven: {
      en: 'You\'ve earned back your pass cost!',
      fr: 'Vous avez récupéré le coût de votre pass!',
      bi: 'Yu kasem bak kos blong pas blong yu!',
    },
    toBreakEven: {
      en: 'to recover pass cost',
      fr: 'pour récupérer le coût du pass',
      bi: 'blong kasem bak kos blong pas',
    },
    redemptionHistory: {
      en: 'Redeemed Deals',
      fr: 'Offres utilisées',
      bi: 'Dils Yusim',
    },
    noRedemptions: {
      en: 'No deals redeemed yet. Start exploring and saving!',
      fr: 'Aucune offre utilisée. Commencez à explorer et économiser!',
      bi: 'No gat dils yusim yet. Stat eksploarem mo sevem!',
    },
    saved: { en: 'saved', fr: 'économisé', bi: 'sevem' },
    avgPerDeal: { en: 'Avg. per deal', fr: 'Moy. par offre', bi: 'Averej per dil' },
    bestDeal: { en: 'Best saving', fr: 'Meilleure économie', bi: 'Beswan sevin' },
    exploreDeal: { en: 'Explore More Deals', fr: 'Explorer plus d\'offres', bi: 'Eksploarem Moa Dils' },
    passROI: { en: 'Pass ROI', fr: 'ROI du pass', bi: 'Pas ROI' },
    timesValue: { en: 'times your pass value', fr: 'fois la valeur de votre pass', bi: 'taem valiu blong pas blong yu' },
  };

  const l = (key: keyof typeof labels) => labels[key][language] || labels[key]['en'];

  // Progress circle SVG
  const progressPercent = Math.min(stats.roiPercentage, 100);
  const circumference = 2 * Math.PI * 54; // radius = 54
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const categoryLabels: Record<string, Record<string, string>> = {
    dining: { en: 'Dining', fr: 'Restauration', bi: 'Kakae' },
    activities: { en: 'Activities', fr: 'Activités', bi: 'Aktiviti' },
    tours: { en: 'Tours', fr: 'Visites', bi: 'Tua' },
    shopping: { en: 'Shopping', fr: 'Shopping', bi: 'Soping' },
    spa: { en: 'Spa & Wellness', fr: 'Spa & Bien-être', bi: 'Spa & Helt' },
    accommodation: { en: 'Accommodation', fr: 'Hébergement', bi: 'Ples blong slip' },
  };

  const categoryColors: Record<string, string> = {
    dining: 'bg-orange-100 text-orange-700',
    activities: 'bg-blue-100 text-blue-700',
    tours: 'bg-emerald-100 text-emerald-700',
    shopping: 'bg-pink-100 text-pink-700',
    spa: 'bg-purple-100 text-purple-700',
    accommodation: 'bg-amber-100 text-amber-700',
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatMonthHeader = (key: string) => {
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-600 via-emerald-600 to-green-700 rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24" />
        <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-white/5 rounded-full" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold">{l('title')}</h2>
              <p className="text-white/70 text-xs sm:text-sm">{l('subtitle')}</p>
            </div>
          </div>

           {/* Big savings number */}
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-8">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wider font-semibold mb-1">{l('totalSaved')}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl sm:text-5xl font-black tracking-tight">
                  {stats.totalSaved.toLocaleString()}
                </span>
                <span className="text-xl sm:text-2xl font-bold text-white/70">VT</span>
              </div>
              <p className="text-white/50 text-xs mt-1">
                ≈ A${stats.savingsInAUD.toFixed(2)} AUD
              </p>
            </div>


            {stats.hasBreakEven && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20">
                <PartyPopper className="w-5 h-5 text-yellow-300" />
                <span className="text-sm font-bold">{l('breakEven')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
            <CircleDollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{stats.totalSaved.toLocaleString()}<span className="text-sm font-bold text-gray-400 ml-1">VT</span></p>
          <p className="text-xs text-gray-500 mt-0.5">{l('totalSaved')}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
            <MapPin className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{stats.businessesVisited}</p>
          <p className="text-xs text-gray-500 mt-0.5">{l('businessesVisited')}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
            <Receipt className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{stats.totalRedemptions}</p>
          <p className="text-xs text-gray-500 mt-0.5">{l('dealsRedeemed')}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
            <BadgePercent className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-gray-900">{stats.avgSaved > 0 ? stats.avgSaved.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}<span className="text-sm font-bold text-gray-400 ml-1">VT</span></p>
          <p className="text-xs text-gray-500 mt-0.5">{l('avgPerDeal')}</p>
        </div>
      </div>

      {/* Pass ROI Progress Section */}
      {user?.pass && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-teal-600" />
              {l('roiLabel')}
            </h3>
          </div>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
              {/* Circular Progress */}
              <div className="relative flex-shrink-0">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
                  {/* Background circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="8"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke={stats.hasBreakEven ? '#10b981' : '#14b8a6'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-1000 ease-out"
                  />
                  {/* Glow effect for completed */}
                  {stats.hasBreakEven && (
                    <circle
                      cx="60"
                      cy="60"
                      r="54"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      opacity="0.3"
                      filter="blur(4px)"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {stats.hasBreakEven ? (
                    <>
                      <Trophy className="w-6 h-6 text-emerald-500 mb-1" />
                      <span className="text-2xl font-black text-emerald-600">
                        {stats.roiMultiplier.toFixed(1)}x
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold">ROI</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-black text-teal-600">
                        {Math.round(progressPercent)}%
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold">{l('passROI')}</span>
                    </>
                  )}
                </div>
              </div>

              {/* ROI Details */}
              <div className="flex-1 w-full">
                <div className="space-y-4">
                  {/* Pass cost */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {language === 'en' ? 'Pass Cost' : language === 'fr' ? 'Coût du pass' : 'Kos blong Pas'}
                    </span>
                    <span className="text-sm font-bold text-gray-900">A${stats.passCost} AUD</span>
                  </div>

                  {/* Savings in AUD */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {language === 'en' ? 'Your Savings (AUD)' : language === 'fr' ? 'Vos économies (AUD)' : 'Sevin blong yu (AUD)'}
                    </span>
                    <span className={`text-sm font-bold ${stats.hasBreakEven ? 'text-emerald-600' : 'text-teal-600'}`}>
                      A${stats.savingsInAUD.toFixed(2)} AUD
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-400 font-medium">{l('passValue')}</span>
                      <span className="text-xs font-bold text-gray-600">{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          stats.hasBreakEven
                            ? 'bg-gradient-to-r from-emerald-400 to-green-500'
                            : 'bg-gradient-to-r from-teal-400 to-teal-500'
                        }`}
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                    </div>
                    {!stats.hasBreakEven && stats.passCost > 0 && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        <span className="font-semibold text-gray-600">
                          A${(stats.passCost - stats.savingsInAUD).toFixed(2)}
                        </span>{' '}
                        {l('toBreakEven')}
                      </p>
                    )}

                    {stats.hasBreakEven && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Flame className="w-3.5 h-3.5 text-orange-500" />
                        <p className="text-xs font-semibold text-emerald-600">
                          {stats.roiMultiplier.toFixed(1)}x {l('timesValue')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Best saving */}
                  {stats.bestSaving > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                      <Star className="w-4 h-4 text-amber-500" />
                      <span className="text-xs text-amber-700">
                        <span className="font-bold">{l('bestDeal')}:</span> {stats.bestSaving.toLocaleString()} VT
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {Object.keys(stats.categoryMap).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              {language === 'en' ? 'Savings by Category' : language === 'fr' ? 'Économies par catégorie' : 'Sevin per Kategori'}
            </h3>
          </div>
          <div className="p-5">
            <div className="space-y-3">
              {Object.entries(stats.categoryMap)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amount]) => {
                  const maxAmount = Math.max(...Object.values(stats.categoryMap));
                  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                  return (
                    <div key={cat} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${categoryColors[cat] || 'bg-gray-100 text-gray-700'}`}>
                            {categoryLabels[cat]?.[language] || cat}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-gray-700">{amount.toLocaleString()} VT</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Redemption History */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-purple-600" />
            {l('redemptionHistory')}
          </h3>
          {redemptions.length > 0 && (
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {redemptions.length} {language === 'en' ? 'deals' : language === 'fr' ? 'offres' : 'dils'}
            </span>
          )}
        </div>

        {enrichedRedemptions.length > 0 ? (
          <div>
            {groupedByMonth.map(([monthKey, monthRedemptions]) => (
              <div key={monthKey}>
                {/* Month header */}
                <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {formatMonthHeader(monthKey)}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-green-600">
                      {monthRedemptions.reduce((s, r) => s + r.saved, 0).toLocaleString()} VT {l('saved')}
                    </span>
                  </div>
                </div>

                {/* Redemptions in this month */}
                <div className="divide-y divide-gray-50">
                  {monthRedemptions.map((r, i) => (
                    <div
                      key={`${r.businessId}-${r.date}-${i}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/80 transition-colors cursor-pointer group"
                      onClick={() => {
                        if (r.business) {
                          setSelectedBusiness(r.business);
                          setCurrentView('business-detail');
                        }
                      }}
                    >
                      {/* Business image */}
                      {r.business ? (
                        <img
                          src={r.business.image}
                          alt={r.business.name}
                          className="w-12 h-12 rounded-xl object-cover shadow-sm ring-1 ring-gray-100 group-hover:ring-teal-200 transition-all"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                          <Receipt className="w-5 h-5 text-gray-300" />
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate group-hover:text-teal-700 transition-colors">
                          {r.business?.name || (language === 'en' ? 'Unknown Business' : 'Bisnis')}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{formatDate(r.date)}</span>
                          {r.business && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${categoryColors[r.business.category] || 'bg-gray-100 text-gray-600'}`}>
                              {categoryLabels[r.business.category]?.[language] || r.business.category}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Savings amount */}
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <ArrowUpRight className="w-3.5 h-3.5 text-green-500" />
                          <p className="text-sm font-bold text-green-600">{r.saved.toLocaleString()} VT</p>
                        </div>
                        <p className="text-[10px] text-gray-400">{l('saved')}</p>
                      </div>

                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-400 transition-colors flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-400 text-sm mb-4">{l('noRedemptions')}</p>
            <button
              onClick={() => setCurrentView('deals')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {l('exploreDeal')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SavingsTracker;

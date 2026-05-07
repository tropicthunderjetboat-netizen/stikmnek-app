import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppContext, defaultPassCartFromProfile } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { shouldOpenCheckoutInsteadOfPassesPage } from '@/utils/passNavigation';
import { Lock, ShieldCheck, Users, Share2, Calendar, Info, CreditCard } from 'lucide-react';

import DealsPricingCard from '@/components/DealsPricingCard';
import { getPassTripGuidance } from '@/lib/passRecommendation';

export interface PassCardsProps {
  /** Home layout: short CTA for signed-in buyers instead of the full marketing funnel. */
  embeddedOnHome?: boolean;
}

const KNOW_BEFORE_KEYS = ['pass.know_bullet_1', 'pass.know_bullet_2', 'pass.know_bullet_3', 'pass.know_bullet_4'] as const;
const KNOW_BEFORE_ICONS = [Share2, Users, Share2, Calendar] as const;

const PassCards: React.FC<PassCardsProps> = ({ embeddedOnHome = false }) => {
  const navigate = useNavigate();
  const { language, purchasePass, user, userProfile, refreshUserProfile } = useAppContext();

  useEffect(() => {
    if (user?.id && !userProfile) {
      refreshUserProfile();
    }
  }, [user?.id, userProfile, refreshUserProfile]);

  const tripGuidance = useMemo(() => {
    if (!userProfile) return null;
    return getPassTripGuidance(userProfile);
  }, [userProfile]);

  const cartHint = useMemo(() => {
    if (!user?.id || !userProfile) return null;
    return defaultPassCartFromProfile(userProfile, null);
  }, [user?.id, userProfile]);

  if (embeddedOnHome && shouldOpenCheckoutInsteadOfPassesPage(user)) {
    return (
      <section className="py-14 bg-gradient-to-b from-white to-teal-50/40" id="passes">
        <div className="max-w-lg mx-auto px-4 text-center">
          <h2 className="text-2xl font-black text-gray-900 mb-2">{t('passFlow.home_skip_title', language)}</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{t('passFlow.home_skip_desc', language)}</p>
          <button
            type="button"
            onClick={() => void purchasePass()}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200"
          >
            {t('passFlow.home_skip_cta', language)}
          </button>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => navigate('/passes?info=1')}
              className="text-sm text-teal-700 font-semibold hover:underline"
            >
              {t('passFlow.home_passes_info_link', language)}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10 sm:py-20 bg-gradient-to-b from-white to-teal-50/30" id="passes">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-6 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-xs sm:text-sm font-semibold mb-3 sm:mb-4">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {language === 'en' ? 'Tourist Pass' : language === 'fr' ? 'Pass touriste' : 'Turis Pas'}
          </div>
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 leading-tight">
              {t('passPricing.page_title', language)}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1.5 sm:mt-2 max-w-lg mx-auto leading-snug sm:leading-relaxed">
              {t('passPricing.page_subtitle', language)}
            </p>
          </div>
        </div>

        {tripGuidance && (
          <div className="max-w-5xl mx-auto mb-10">
            <div className="rounded-2xl border border-teal-100 bg-white shadow-sm ring-1 ring-teal-50 p-5 sm:p-6">
              <h3 className="text-sm font-bold text-teal-800 tracking-wide uppercase mb-3">
                {t('pass.know_before_title', language)}
              </h3>
              <p className="text-sm text-gray-600 mb-4 leading-snug">
                {t('pass.know_trip_line', language)
                  .replace('{days}', String(tripGuidance.tripDays))
                  .replace('{party}', String(tripGuidance.partyCountExInfants))}
              </p>
              <ul className="space-y-3">
                {KNOW_BEFORE_KEYS.map((key, i) => {
                  const Icon = KNOW_BEFORE_ICONS[i] ?? Info;
                  return (
                    <li key={key} className="flex gap-3 text-sm text-gray-800 leading-snug">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                        <Icon className="w-4 h-4" aria-hidden />
                      </span>
                      <span className="pt-1">{t(key, language)}</span>
                    </li>
                  );
                })}
              </ul>
              {tripGuidance.showSupportHint && (
                <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50/80 px-3.5 py-2.5 text-sm text-amber-950 leading-snug">
                  {t('pass.know_support', language)}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="max-w-xl mx-auto mb-6 sm:mb-10">
          <DealsPricingCard
            initialPartySize={cartHint?.partySize}
            initialExtended={cartHint?.isExtended}
            onPurchase={(opts) => void purchasePass(opts)}
            purchaseDisabled={Boolean(user?.passId)}
          />
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-gray-400 mb-4">
            {language === 'en' ? 'Secure payment powered by' : language === 'fr' ? 'Paiement sécurisé par' : 'Sekua pemen blong'}
          </p>
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#003087]" fill="currentColor">
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.603c-.564 0-1.04.408-1.13.964L7.076 21.337z" />
              </svg>
              <span className="text-sm font-bold text-[#003087]">PayPal</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <CreditCard className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-bold text-gray-600">Credit Card</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">VISA</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">Mastercard</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">AMEX</div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
              <div className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">Apple Pay</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mt-4">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Lock className="w-3 h-3" />
              <span>256-bit SSL</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <ShieldCheck className="w-3 h-3" />
              <span>PCI DSS Compliant</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PassCards;

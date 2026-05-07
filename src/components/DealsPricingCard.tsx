import React from 'react';
import { Gift, Users, Clock, CalendarRange, CreditCard } from 'lucide-react';
import {
  BASE_PRICE_AUD,
  EXTEND_FEE_AUD,
  GUEST_FEE_AUD,
  MAX_PARTY_SIZE,
  calculatePassPrice,
} from '@/data/pricing';

export type DealsPricingLanguage = 'en' | 'fr' | 'bi';

type Props = {
  language: DealsPricingLanguage;
  onPurchase24h: () => void;
  onPurchase7Day: () => void;
  /** When user already has an active pass — CTAs disabled. */
  purchaseDisabled?: boolean;
};

/**
 * Transparent breakdown of StikmNek Pass pricing (dynamic model).
 * Amounts stay in sync with `src/data/pricing.ts` / Edge `pricingDynamic.ts`.
 */
const DealsPricingCard: React.FC<Props> = ({
  language,
  onPurchase24h,
  onPurchase7Day,
  purchaseDisabled = false,
}) => {
  const examplePartySize = 3;
  const exampleTotal = calculatePassPrice(examplePartySize, false);
  const exampleHolidayTotal = calculatePassPrice(examplePartySize, true);
  const exampleExtraGuests = examplePartySize - 1;

  const copy =
    language === 'fr'
      ? {
          title: 'Tarifs du pass StikmNek',
          subtitle: 'Une tarification simple et transparente pour votre séjour',
          checkoutBlurb: `Jusqu'à ${MAX_PARTY_SIZE} personnes (6 ans et +). Choisissez une couverture 24 h ou 7 jours au paiement.`,
          baseTitle: 'Pass de base',
          baseSub: 'Première personne incluse',
          extraTitle: 'Invités supplémentaires',
          extraSub: 'À partir de 6 ans',
          extendTitle: 'Pass vacances 7 jours',
          extendSub: 'Passez de 24 h à 7 jours',
          kidsTitle: 'Enfants de moins de 6 ans',
          kidsSub: 'Toujours gratuits !',
          scenarioTitle: 'Deux exemples rapides',
          scenario24Label: 'Pass 24 h',
          scenario24Sub: `${examplePartySize} personnes (6 ans et +)`,
          scenario7Label: 'Pass vacances 7 jours',
          scenario7Sub: `Même groupe + prolongation ; bonus partage → jusqu’à 14 j.`,
          scenarioMath24: `Base ${BASE_PRICE_AUD} $ + ${exampleExtraGuests} × ${GUEST_FEE_AUD} $`,
          scenarioMath7: `Base + invités + ${EXTEND_FEE_AUD} $ (7 j.) ; 2e semaine après partage`,
          purchaseCta: 'Acheter ce pass',
          purchaseLocked: 'Pass actif',
        }
      : language === 'bi'
        ? {
            title: 'Prais blong StikmNek Pas',
            subtitle: 'Prais we i stret mo klia blong adventja blong yu',
            checkoutBlurb: `Antap long ${MAX_PARTY_SIZE} man (6+). Jusum 24 owa o 7 dei long checkout.`,
            baseTitle: 'Pas blong stat',
            baseSub: 'Fes man i stap insaed',
            extraTitle: 'Narafala man',
            extraSub: 'Fram 6 ia antap',
            extendTitle: 'Holiday Pas 7 Dei',
            extendSub: 'Longem long 24 owa go 7 dei',
            kidsTitle: 'Pikinini under 6',
            kidsSub: 'Oltaim fri!',
            scenarioTitle: 'Tu fala eksemple',
            scenario24Label: 'Pas 24 owa',
            scenario24Sub: `${examplePartySize} man (6+)`,
            scenario7Label: 'Holiday pas 7 dei',
            scenario7Sub: `Sem grup + longem; share bonus → antap 14 dei`,
            scenarioMath24: `Bes ${BASE_PRICE_AUD} $ + ${exampleExtraGuests} × ${GUEST_FEE_AUD} $`,
            scenarioMath7: `Bes + narafala + ${EXTEND_FEE_AUD} $ (7 dei); wik 2 afta share`,
            purchaseCta: 'Baem pas ia',
            purchaseLocked: 'Pas i aktiv',
          }
        : {
            title: 'StikmNek Pass Pricing',
            subtitle: 'Simple, transparent pricing for your adventure',
            checkoutBlurb: `Party size is up to ${MAX_PARTY_SIZE} people ages 6+. Pick 24-hour or 7-day coverage at checkout.`,
            baseTitle: 'Base pass',
            baseSub: 'First guest included (ages 6+)',
            extraTitle: 'Additional guests',
            extraSub: 'Ages 6 and up',
            extendTitle: '7-day Holiday Pass',
            extendSub: 'Upgrade from 24-hour to 7 days',
            kidsTitle: 'Kids under 6',
            kidsSub: 'Always free — not counted in party size',
            scenarioTitle: 'Quick examples',
            scenario24Label: '24-hour pass',
            scenario24Sub: `${examplePartySize} people ages 6+`,
            scenario7Label: '7-day Holiday Pass',
            scenario7Sub: 'Same group + upgrade; share bonus → up to 14 days',
            scenarioMath24: `Base A$${BASE_PRICE_AUD} + ${exampleExtraGuests} × A$${GUEST_FEE_AUD}`,
            scenarioMath7: `Same base + guests + A$${EXTEND_FEE_AUD} (7-day); 2nd week after sharing`,
            purchaseCta: 'Purchase this pass',
            purchaseLocked: 'Active pass',
          };

  const aud = (n: number) => (language === 'fr' || language === 'bi' ? `${n} $ AUD` : `A$${n}`);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-sky-100/90 via-white to-emerald-100/80 p-[1px] shadow-xl shadow-teal-900/5 ring-1 ring-teal-100/60">
      <div className="rounded-2xl bg-white/90 backdrop-blur-sm px-5 py-6 sm:px-7 sm:py-7">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-teal-700 via-cyan-700 to-emerald-700 bg-clip-text text-transparent">
            {copy.title}
          </h2>
          <p className="text-sm font-semibold text-slate-600 mt-2">{copy.subtitle}</p>
          <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">{copy.checkoutBlurb}</p>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center gap-3 rounded-xl bg-sky-50/90 p-3.5 ring-1 ring-sky-100/80 shadow-sm shadow-sky-100/40">
            <div className="min-w-0">
              <h3 className="font-bold text-sky-900">{copy.baseTitle}</h3>
              <p className="text-sm text-slate-600">{copy.baseSub}</p>
            </div>
            <span className="text-lg font-black text-sky-700 shrink-0 tabular-nums">{aud(BASE_PRICE_AUD)}</span>
          </div>

          <div className="flex justify-between items-center gap-3 rounded-xl bg-emerald-50/90 p-3.5 ring-1 ring-emerald-100/80 shadow-sm shadow-emerald-100/40">
            <div className="min-w-0">
              <h3 className="font-bold text-emerald-900">{copy.extraTitle}</h3>
              <p className="text-sm text-slate-600">{copy.extraSub}</p>
            </div>
            <span className="text-lg font-black text-emerald-700 shrink-0 text-right">
              +{aud(GUEST_FEE_AUD)}
              <span className="block text-xs font-bold text-emerald-800 normal-case">
                {language === 'en' ? 'per extra guest' : language === 'fr' ? 'par personne supp.' : 'long evri narafala man'}
              </span>
            </span>
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl bg-violet-50/95 p-3.5 ring-1 ring-violet-100/90 shadow-sm shadow-violet-100/50">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-violet-900">{copy.extendTitle}</h3>
                <p className="text-sm text-slate-600">{copy.extendSub}</p>
              </div>
              <span className="text-lg font-black text-violet-700 shrink-0 tabular-nums">+{aud(EXTEND_FEE_AUD)}</span>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl bg-white/70 border border-violet-200/60 px-3 py-2.5 shadow-inner shadow-white/60">
              <Gift className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" aria-hidden />
              <p className="text-[11px] sm:text-xs text-violet-950 leading-snug font-medium">
                {language === 'en' ? (
                  <>
                    Bonus: Share the app with another traveller to unlock a{' '}
                    <span className="font-black text-violet-900 tracking-tight">2nd week FREE</span> (14 days total).
                  </>
                ) : language === 'fr' ? (
                  <>
                    Bonus : partagez l’app avec un autre voyageur pour une{' '}
                    <span className="font-black text-violet-900 tracking-tight">2e semaine gratuite</span> (14 jours au
                    total).
                  </>
                ) : (
                  <>
                    Bonus: share app wetem narafala tourist blong{' '}
                    <span className="font-black text-violet-900 tracking-tight">fri wik 2</span> (14 dei long total).
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center gap-3 rounded-xl bg-amber-50/90 p-3.5 ring-1 ring-amber-100/80 shadow-sm shadow-amber-100/40">
            <div className="min-w-0">
              <h3 className="font-bold text-amber-900">{copy.kidsTitle}</h3>
              <p className="text-sm text-slate-600">{copy.kidsSub}</p>
            </div>
            <span className="text-lg font-black text-amber-700 shrink-0 tabular-nums">{aud(0)}</span>
          </div>
        </div>

        {/* Visual examples — icon-led cards, no grey slab */}
        <div className="mt-7">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-teal-700/90 mb-3">
            {copy.scenarioTitle}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-cyan-100">
                  <Clock className="h-6 w-6 text-cyan-600" aria-hidden />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-black text-cyan-950 leading-tight">{copy.scenario24Label}</p>
                  <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 shrink-0 text-cyan-600" aria-hidden />
                    {copy.scenario24Sub}
                  </p>
                </div>
              </div>
              <p className="text-2xl font-black tabular-nums text-cyan-900">{aud(exampleTotal)}</p>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">{copy.scenarioMath24}</p>
              <button
                type="button"
                disabled={purchaseDisabled}
                onClick={onPurchase24h}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 py-2.5 text-sm font-bold text-white shadow-md shadow-cyan-200/50 transition hover:from-cyan-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
              >
                <CreditCard className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
                {purchaseDisabled ? copy.purchaseLocked : copy.purchaseCta}
              </button>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-violet-100">
                  <CalendarRange className="h-6 w-6 text-violet-600" aria-hidden />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-black text-violet-950 leading-tight">{copy.scenario7Label}</p>
                  <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                    <Gift className="h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
                    {copy.scenario7Sub}
                  </p>
                </div>
              </div>
              <p className="text-2xl font-black tabular-nums text-violet-900">{aud(exampleHolidayTotal)}</p>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">{copy.scenarioMath7}</p>
              <button
                type="button"
                disabled={purchaseDisabled}
                onClick={onPurchase7Day}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-200/50 transition hover:from-violet-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
              >
                <CreditCard className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
                {purchaseDisabled ? copy.purchaseLocked : copy.purchaseCta}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealsPricingCard;

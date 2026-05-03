import React from 'react';
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
};

/**
 * Transparent breakdown of StikmNek Pass pricing (dynamic model).
 * Amounts stay in sync with `src/data/pricing.ts` / Edge `pricingDynamic.ts`.
 */
const DealsPricingCard: React.FC<Props> = ({ language }) => {
  /** Example: 3 people ages 6+ on a 24-hour pass → $15 + 2×$5 = $25 */
  const examplePartySize = 3;
  const exampleTotal = calculatePassPrice(examplePartySize, false);
  const exampleExtraGuests = examplePartySize - 1;

  const copy =
    language === 'fr'
      ? {
          title: 'Tarifs du pass StikmNek',
          subtitle: 'Une tarification simple et transparente pour votre séjour',
          baseTitle: 'Pass de base',
          baseSub: 'Première personne incluse',
          extraTitle: 'Invités supplémentaires',
          extraSub: 'À partir de 6 ans',
          extendTitle: 'Prolongation de durée',
          extendSub: '24 h → 14 jours',
          kidsTitle: 'Enfants de moins de 6 ans',
          kidsSub: 'Toujours gratuits !',
          exampleLead: `Exemple : ${examplePartySize} personnes (6 ans et +), pass 24 h`,
          exampleMath: `(Base ${BASE_PRICE_AUD} $ + ${exampleExtraGuests} × ${GUEST_FEE_AUD} $ par personne supplémentaire)`,
          savings: 'Économisez sur les restaurants et activités ! Ce pass se rentabilise vite.',
        }
      : language === 'bi'
        ? {
            title: 'Prais blong StikmNek Pas',
            subtitle: 'Prais we i stret mo klia blong adventja blong yu',
            baseTitle: 'Pas blong stat',
            baseSub: 'Fes man i stap insaed',
            extraTitle: 'Narafala man',
            extraSub: 'Fram 6 ia antap',
            extendTitle: 'Longem taem',
            extendSub: '24 owa → 14 dei',
            kidsTitle: 'Pikinini under 6',
            kidsSub: 'Oltaim fri!',
            exampleLead: `Eksemple: ${examplePartySize} man (6+), pas 24 owa`,
            exampleMath: `(Bes ${BASE_PRICE_AUD} $ + ${exampleExtraGuests} × ${GUEST_FEE_AUD} $ evri narafala man)`,
            savings: 'Save long lokol experiens! Dis pas i pe blong hemsef.',
          }
        : {
            title: 'StikmNek Pass Pricing',
            subtitle: 'Simple, transparent pricing for your adventure',
            baseTitle: 'Base pass',
            baseSub: 'First guest included (ages 6+)',
            extraTitle: 'Additional guests',
            extraSub: 'Ages 6 and up',
            extendTitle: '14-day option',
            extendSub: 'Upgrade from 24-hour to 14 days',
            kidsTitle: 'Kids under 6',
            kidsSub: 'Always free — not counted in party size',
            exampleLead: `Example: ${examplePartySize} people ages 6+ (24-hour pass)`,
            exampleMath: `(Base A$${BASE_PRICE_AUD} + ${exampleExtraGuests} × A$${GUEST_FEE_AUD} each additional guest)`,
            savings: '💰 Save on meals, tours, and more — this pass pays for itself.',
          };

  const aud = (n: number) => (language === 'fr' || language === 'bi' ? `${n} $ AUD` : `A$${n}`);

  return (
    <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-100">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-black text-gray-900">{copy.title}</h2>
        <p className="text-sm text-gray-600 mt-2">{copy.subtitle}</p>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
          {language === 'en'
            ? `Party size is up to ${MAX_PARTY_SIZE} people ages 6+. Choose 24-hour or 14-day coverage at checkout.`
            : language === 'fr'
              ? `Jusqu'à ${MAX_PARTY_SIZE} personnes (6 ans et +). Choisissez 24 h ou 14 jours au paiement.`
              : `Antap long ${MAX_PARTY_SIZE} man (6+). Jusum 24 owa o 14 dei long checkout.`}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center gap-3 bg-blue-50 p-3 rounded-lg">
          <div className="min-w-0">
            <h3 className="font-bold text-blue-900">{copy.baseTitle}</h3>
            <p className="text-sm text-gray-600">{copy.baseSub}</p>
          </div>
          <span className="text-lg font-black text-blue-700 shrink-0 tabular-nums">{aud(BASE_PRICE_AUD)}</span>
        </div>

        <div className="flex justify-between items-center gap-3 bg-green-50 p-3 rounded-lg">
          <div className="min-w-0">
            <h3 className="font-bold text-green-900">{copy.extraTitle}</h3>
            <p className="text-sm text-gray-600">{copy.extraSub}</p>
          </div>
          <span className="text-lg font-black text-green-700 shrink-0 text-right">
            +{aud(GUEST_FEE_AUD)}
            <span className="block text-xs font-bold text-green-800 normal-case">
              {language === 'en' ? 'per extra guest' : language === 'fr' ? 'par personne supp.' : 'long evri narafala man'}
            </span>
          </span>
        </div>

        <div className="flex justify-between items-center gap-3 bg-purple-50 p-3 rounded-lg">
          <div className="min-w-0">
            <h3 className="font-bold text-purple-900">{copy.extendTitle}</h3>
            <p className="text-sm text-gray-600">{copy.extendSub}</p>
          </div>
          <span className="text-lg font-black text-purple-700 shrink-0 tabular-nums">+{aud(EXTEND_FEE_AUD)}</span>
        </div>

        <div className="flex justify-between items-center gap-3 bg-amber-50 p-3 rounded-lg">
          <div className="min-w-0">
            <h3 className="font-bold text-amber-900">{copy.kidsTitle}</h3>
            <p className="text-sm text-gray-600">{copy.kidsSub}</p>
          </div>
          <span className="text-lg font-black text-amber-700 shrink-0 tabular-nums">{aud(0)}</span>
        </div>
      </div>

      <div className="mt-6 bg-gray-100 p-4 rounded-lg text-center">
        <p className="text-sm font-semibold text-gray-800">{copy.exampleLead}</p>
        <div className="flex flex-col sm:flex-row sm:justify-center sm:items-center mt-2 gap-1 sm:gap-2">
          <span className="text-xl font-black text-gray-900 tabular-nums">{aud(exampleTotal)}</span>
          <span className="text-sm text-gray-600">{copy.exampleMath}</span>
        </div>
      </div>

      <div className="mt-4 bg-green-600 text-white p-3 rounded-lg text-center">
        <p className="text-sm font-bold leading-snug">{copy.savings}</p>
      </div>
    </div>
  );
};

export default DealsPricingCard;

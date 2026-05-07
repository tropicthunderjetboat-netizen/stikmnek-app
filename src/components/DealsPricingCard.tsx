import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Minus, Plus, UtensilsCrossed, Map, QrCode } from 'lucide-react';
import {
  BASE_PRICE_AUD,
  EXTEND_FEE_AUD,
  GUEST_FEE_AUD,
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  calculatePassPrice,
  clampPartySize,
} from '@/data/pricing';
import { t, type Language } from '@/data/translations';

export type DealsPricingLanguage = Language;

type Props = {
  language: DealsPricingLanguage;
  onPurchase: (opts: { partySize: number; isExtended: boolean }) => void;
  purchaseDisabled?: boolean;
  /** When profile loads, seed the counter (e.g. registration party size). */
  initialPartySize?: number;
  initialExtended?: boolean;
};

function langFromProp(language: DealsPricingLanguage): Language {
  return language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';
}

function formatAud(lang: Language, n: number): string {
  if (lang === 'fr' || lang === 'bi') return `${n} $ AUD`;
  return `A$${n}`;
}

const DealsPricingCard: React.FC<Props> = ({
  language,
  onPurchase,
  purchaseDisabled = false,
  initialPartySize,
  initialExtended,
}) => {
  const lang = langFromProp(language);
  const [partySize, setPartySize] = useState(() =>
    clampPartySize(initialPartySize ?? MIN_PARTY_SIZE),
  );
  const [isExtended, setIsExtended] = useState(() => Boolean(initialExtended));

  useEffect(() => {
    if (initialPartySize != null) {
      setPartySize(clampPartySize(initialPartySize));
    }
  }, [initialPartySize]);

  useEffect(() => {
    if (initialExtended !== undefined) {
      setIsExtended(Boolean(initialExtended));
    }
  }, [initialExtended]);

  const total = useMemo(() => calculatePassPrice(partySize, isExtended), [partySize, isExtended]);

  const savingsAnchor = partySize * BASE_PRICE_AUD;

  const headerText = t('passPricing.simple_header', lang)
    .replace('__BASE__', String(BASE_PRICE_AUD))
    .replace('__GUEST__', String(GUEST_FEE_AUD));

  const savingsText = t('passPricing.savings_anchor', lang)
    .replace('__COUNT__', String(partySize))
    .replace('__SAVE__', String(savingsAnchor));

  const bumpParty = (delta: number) => {
    setPartySize((p) => clampPartySize(p + delta));
  };

  return (
    <div className="rounded-2xl border border-slate-100/90 bg-white p-6 sm:p-8 shadow-sm shadow-slate-200/40 ring-1 ring-slate-50">
      <p className="text-center text-[15px] sm:text-base font-semibold leading-relaxed text-slate-800 tracking-tight max-w-xl mx-auto">
        {headerText}
      </p>

      <div className="mt-10 space-y-10">
        {/* People stepper */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {t('passPricing.people_label', lang)}
          </span>
          <div className="inline-flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-2 py-2">
            <button
              type="button"
              aria-label="Decrease party size"
              disabled={partySize <= MIN_PARTY_SIZE}
              onClick={() => bumpParty(-1)}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <span className="min-w-[2.5rem] text-center text-2xl font-black tabular-nums text-slate-900">
              {partySize}
            </span>
            <button
              type="button"
              aria-label="Increase party size"
              disabled={partySize >= MAX_PARTY_SIZE}
              onClick={() => bumpParty(1)}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            {t('passPricing.max_per_pass', lang).replace('__N__', String(MAX_PARTY_SIZE))}
          </p>
        </div>

        {/* Duration toggle */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {t('passPricing.coverage_label', lang)}
          </span>
          <div
            className="inline-flex rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5 shadow-inner"
            role="group"
            aria-label={lang === 'en' ? 'Pass duration' : lang === 'fr' ? 'Durée du pass' : 'Taem blong pas'}
          >
            <button
              type="button"
              onClick={() => setIsExtended(false)}
              className={`rounded-xl px-6 py-2.5 text-sm font-bold transition-all ${
                !isExtended
                  ? 'bg-white text-teal-800 shadow-md ring-1 ring-teal-100'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('passPricing.duration_1d', lang)}
            </button>
            <button
              type="button"
              onClick={() => setIsExtended(true)}
              className={`rounded-xl px-6 py-2.5 text-sm font-bold transition-all ${
                isExtended
                  ? 'bg-white text-violet-900 shadow-md ring-1 ring-violet-100'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('passPricing.duration_7d', lang)}
            </button>
          </div>
        </div>

        {/* Holiday gift callout — only when 7-day selected */}
        {isExtended && (
          <div className="relative overflow-hidden rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 px-5 py-6 sm:px-7 sm:py-7">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-200/30 blur-2xl" aria-hidden />
            <div className="relative flex flex-col items-center text-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-300/50">
                <Gift className="h-7 w-7" strokeWidth={2} aria-hidden />
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-violet-950 leading-tight max-w-sm">
                {t('passPricing.holiday_headline', lang)}
              </p>
              <p className="text-sm text-violet-900/85 leading-relaxed max-w-md">
                {t('passPricing.holiday_sub', lang)}
              </p>
              <p className="text-xs font-semibold text-violet-700/90">
                +{formatAud(lang, EXTEND_FEE_AUD)}{' '}
                {lang === 'en' ? '7-day add-on' : lang === 'fr' ? 'option 7 jours' : 'long 7 dei'}
              </p>
            </div>
          </div>
        )}

        {/* Total + savings */}
        <div className="space-y-3 text-center pt-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('passPricing.total_label', lang)}</p>
          <p className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight text-slate-900">{formatAud(lang, total)}</p>
          <p className="mx-auto max-w-md text-sm font-medium leading-relaxed text-teal-800/95">{savingsText}</p>
        </div>

        {/* What's included */}
        <div className="mx-auto max-w-md space-y-4 pt-2">
          <div className="flex gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <UtensilsCrossed className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-slate-800 leading-snug pt-1.5">{t('passPricing.included_meals', lang)}</p>
          </div>
          <div className="flex gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Map className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-slate-800 leading-snug pt-1.5">{t('passPricing.included_map', lang)}</p>
          </div>
          <div className="flex gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <QrCode className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-slate-800 leading-snug pt-1.5">{t('passPricing.included_qr', lang)}</p>
          </div>
        </div>

        {/* Purchase */}
        <div className="pt-2">
          <button
            type="button"
            disabled={purchaseDisabled}
            onClick={() => onPurchase({ partySize, isExtended })}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-4 text-base font-black text-white shadow-lg shadow-emerald-200/60 transition hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
          >
            {purchaseDisabled ? t('passPricing.purchase_locked', lang) : t('passPricing.purchase', lang)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DealsPricingCard;

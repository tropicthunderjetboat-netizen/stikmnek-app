import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CircleCheck,
  Gift,
  Lock,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Zap,
} from 'lucide-react';
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

      <div className="mt-8 space-y-8">
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
            <div className="relative flex flex-col items-center text-center gap-2.5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-300/50">
                <Gift className="h-7 w-7" strokeWidth={2} aria-hidden />
              </div>
              <p className="text-2xl sm:text-[1.65rem] font-black tracking-tight text-violet-950 leading-[1.15] max-w-sm">
                {t('passPricing.holiday_headline', lang)}
              </p>
              <p className="text-[13px] sm:text-sm text-violet-900/80 leading-relaxed max-w-md font-medium">
                {t('passPricing.holiday_sub', lang)}
              </p>
              <p className="text-[10px] leading-tight text-violet-600/75 font-medium pt-0.5">
                +{formatAud(lang, EXTEND_FEE_AUD)}{' '}
                {lang === 'en' ? '7-day add-on' : lang === 'fr' ? 'option 7 jours' : 'long 7 dei'}
              </p>
            </div>
          </div>
        )}

        {/* Total + savings */}
        <div className="space-y-2.5 text-center pt-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('passPricing.total_label', lang)}</p>
          <p className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight text-slate-900">{formatAud(lang, total)}</p>
          <div className="mx-auto flex max-w-md items-start justify-center gap-1.5 px-1 pt-0.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={2} aria-hidden />
            <p className="text-center text-[13px] sm:text-sm font-bold leading-snug text-emerald-900">
              {savingsText}
            </p>
          </div>
        </div>

        {/* What's included — compact value strip */}
        <div className="mx-auto max-w-lg border-y border-slate-100 py-3.5">
          <div className="flex flex-col gap-2 text-[13px] font-semibold leading-snug text-slate-700 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-1 sm:gap-y-2">
            <span className="inline-flex items-center gap-2 sm:gap-1.5">
              <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} aria-hidden />
              {t('passPricing.included_meals', lang)}
            </span>
            <span className="hidden text-slate-300 sm:inline" aria-hidden>
              ·
            </span>
            <span className="inline-flex items-center gap-2 sm:gap-1.5">
              <MapPin className="h-4 w-4 shrink-0 text-sky-600" strokeWidth={2.5} aria-hidden />
              {t('passPricing.included_map', lang)}
            </span>
            <span className="hidden text-slate-300 sm:inline" aria-hidden>
              ·
            </span>
            <span className="inline-flex items-center gap-2 sm:gap-1.5">
              <Zap className="h-4 w-4 shrink-0 text-teal-600" strokeWidth={2.5} aria-hidden />
              {t('passPricing.included_qr', lang)}
            </span>
          </div>
        </div>

        {/* Purchase */}
        <div className="pt-1">
          <button
            type="button"
            disabled={purchaseDisabled}
            onClick={() => onPurchase({ partySize, isExtended })}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-4 text-base font-black text-white shadow-md shadow-emerald-900/20 ring-1 ring-emerald-500/30 transition hover:from-emerald-700 hover:to-teal-700 hover:shadow-lg hover:shadow-emerald-900/25 disabled:cursor-not-allowed disabled:opacity-55 disabled:ring-0 disabled:hover:shadow-md"
          >
            {purchaseDisabled ? (
              <>
                <Lock className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
                {t('passPricing.purchase_locked', lang)}
              </>
            ) : (
              <>
                {t('passPricing.purchase', lang)}
                <ArrowRight className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DealsPricingCard;

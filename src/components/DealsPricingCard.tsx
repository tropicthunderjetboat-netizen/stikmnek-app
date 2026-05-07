import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleCheck, CreditCard, Gift, Lock, MapPin, Minus, Plus, Zap } from 'lucide-react';

import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { BASE_PRICE_AUD, calculatePassPrice, clampPartySize, MAX_PARTY_SIZE } from '@/data/pricing';
import { cn } from '@/lib/utils';

interface DealsPricingCardProps {
  onPurchase?: (opts?: { isExtended?: boolean; partySize?: number }) => void;
  initialPartySize?: number;
  initialExtended?: boolean;
  purchaseDisabled?: boolean;
}

const estimatedFirstDaySavingsAud = (partySize: number) => partySize * BASE_PRICE_AUD;

function CtaSheen({ roundedClass }: { roundedClass: string }) {
  return (
    <span className={cn('pointer-events-none absolute inset-0 overflow-hidden', roundedClass)} aria-hidden>
      <span className="absolute -inset-y-2 -left-1/2 w-[70%] bg-gradient-to-r from-transparent via-white/35 to-transparent animate-pass-cta-sheen" />
    </span>
  );
}

export default function DealsPricingCard({
  onPurchase,
  initialPartySize = 1,
  initialExtended,
  purchaseDisabled = false,
}: DealsPricingCardProps) {
  const { language } = useAppContext();
  const [partySize, setPartySize] = useState(() => clampPartySize(initialPartySize));
  const [isExtended, setIsExtended] = useState(() =>
    initialExtended === undefined ? true : Boolean(initialExtended)
  );

  useEffect(() => {
    setPartySize(clampPartySize(initialPartySize));
  }, [initialPartySize]);

  useEffect(() => {
    if (initialExtended !== undefined) setIsExtended(Boolean(initialExtended));
  }, [initialExtended]);

  const total = useMemo(() => calculatePassPrice(partySize, isExtended), [partySize, isExtended]);

  const formatAud = (amount: number) =>
    new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    }).format(amount);

  const sub = t('passPricing.holiday_sub', language);
  const saveAud = estimatedFirstDaySavingsAud(partySize);
  const savingsText = t('passPricing.savings_anchor', language)
    .replace('__COUNT__', String(partySize))
    .replace('__SAVE__', String(saveAud));

  const maxPartyNote = t('passPricing.max_per_pass', language).replace('__N__', String(MAX_PARTY_SIZE));

  const handlePurchase = () => {
    if (purchaseDisabled) return;
    onPurchase?.({ isExtended, partySize });
  };

  const btnRound = 'rounded-2xl';

  return (
    <div
      className={cn(
        'flex w-full max-w-xl flex-col rounded-[2.5rem] bg-white text-center shadow-2xl transition-[box-shadow,ring-color] duration-300',
        isExtended
          ? 'ring-2 ring-violet-500/25 shadow-[0_28px_56px_-18px_rgba(15,23,42,0.12),0_0_0_1px_rgba(196,181,253,0.2),0_0_48px_-12px_rgba(234,179,8,0.18)]'
          : 'ring-1 ring-emerald-500/[0.12] shadow-[0_28px_56px_-18px_rgba(15,23,42,0.1)]'
      )}
    >
      <div className="flex flex-col items-center gap-2 px-4 pb-3 pt-4 sm:gap-2.5 sm:px-5 sm:pb-4 sm:pt-5">
        {/* Header */}
        <div className="flex flex-col items-center gap-0.5">
          <p
            className={cn(
              'text-[10px] font-black uppercase tracking-[0.22em] sm:text-[11px]',
              isExtended ? 'text-violet-600/90' : 'text-emerald-700/85'
            )}
          >
            {isExtended ? t('passPricing.card_header_holiday', language) : t('passPricing.hero_1d_title', language)}
          </p>
        </div>

        {/* Price — primary anchor */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
            {t('passPricing.total_label', language)}
          </span>
          <p className="text-[2.35rem] font-black leading-none tracking-tight text-slate-900 tabular-nums sm:text-[2.65rem]">
            {formatAud(total)}
          </p>
        </div>

        {/* Value universe */}
        {isExtended ? (
          <div className="flex w-full max-w-[18rem] flex-col items-center gap-1">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-50 via-white to-amber-50/80 text-violet-600 shadow-sm ring-1 ring-violet-100/80">
              <Gift className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="bg-gradient-to-r from-violet-700 via-violet-600 to-amber-600 bg-clip-text text-xl font-black leading-tight tracking-tight text-transparent sm:text-2xl">
              {t('passPricing.value_2nd_week_headline', language)}
            </p>
            <p className="max-w-[17rem] text-center text-[10px] font-medium leading-snug text-slate-500 sm:text-[11px]">
              {sub}
            </p>
          </div>
        ) : (
          <p className="max-w-[17rem] text-center text-[11px] leading-snug text-slate-500 sm:text-xs">
            {t('passPricing.hero_1d_sub', language)}
          </p>
        )}

        {/* Minimal selectors — slate wash, no box borders */}
        <div className="flex w-full max-w-[19rem] flex-col gap-1.5">
          <div className="rounded-2xl bg-slate-100/90 px-2.5 py-2">
            <p className="mb-1 text-center text-[8px] font-bold uppercase tracking-widest text-slate-400">
              {t('passPricing.coverage_label', language)}
            </p>
            <div
              className="mx-auto flex w-full max-w-[15.5rem] rounded-full bg-slate-200/80 p-0.5"
              role="group"
              aria-label={t('passPricing.coverage_label', language)}
            >
              <button
                type="button"
                onClick={() => setIsExtended(false)}
                className={cn(
                  'flex-1 rounded-full py-1.5 text-[10px] font-black uppercase tracking-wide transition-all',
                  !isExtended ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {t('passPricing.duration_1d', language)}
              </button>
              <button
                type="button"
                onClick={() => setIsExtended(true)}
                className={cn(
                  'flex-1 rounded-full py-1.5 text-[10px] font-black uppercase tracking-wide transition-all',
                  isExtended ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {t('passPricing.duration_7d', language)}
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center rounded-2xl bg-slate-100/90 px-2.5 py-2">
            <span className="mb-1 text-center text-[8px] font-bold uppercase tracking-widest text-slate-400">
              {t('passPricing.people_label', language)}
            </span>
            <div className="inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1 py-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setPartySize((p) => clampPartySize(p - 1))}
                disabled={partySize <= 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:opacity-25"
                aria-label={t('passPricing.aria_decrease_party', language)}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[1.35rem] text-center text-base font-black tabular-nums text-slate-900">
                {partySize}
              </span>
              <button
                type="button"
                onClick={() => setPartySize((p) => clampPartySize(p + 1))}
                disabled={partySize >= MAX_PARTY_SIZE}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:opacity-25"
                aria-label={t('passPricing.aria_increase_party', language)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="mt-0.5 text-center text-[8px] text-slate-400">{maxPartyNote}</span>
          </div>
        </div>

        {/* Features — single calm row */}
        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[9px] font-semibold text-slate-500 sm:text-[10px]">
          <span className="inline-flex items-center gap-0.5">
            <CircleCheck className="h-3 w-3 shrink-0 text-emerald-600" strokeWidth={2.25} />
            {t('passPricing.chip_row_35', language)}
          </span>
          <span className="text-slate-300" aria-hidden>
            •
          </span>
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="h-3 w-3 shrink-0 text-sky-600" />
            {t('passPricing.chip_row_map', language)}
          </span>
          <span className="text-slate-300" aria-hidden>
            •
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Zap className="h-3 w-3 shrink-0 text-teal-600" />
            {t('passPricing.chip_row_qr', language)}
          </span>
        </div>

        {/* Savings speech bubble */}
        <div className="flex w-full max-w-[20rem] flex-col items-center">
          <div className="relative w-full rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-3 py-2 text-center shadow-[0_4px_14px_rgba(5,150,105,0.25),0_12px_28px_-6px_rgba(16,185,129,0.35)] ring-1 ring-emerald-400/50">
            <p className="text-[10px] font-semibold leading-snug text-white sm:text-[11px]">{savingsText}</p>
          </div>
          <div className="-mt-px flex justify-center" aria-hidden>
            <div className="h-0 w-0 border-x-[9px] border-x-transparent border-t-[10px] border-t-emerald-600" />
          </div>
        </div>

        {/* Final yes — full width */}
        <button
          type="button"
          onClick={handlePurchase}
          disabled={purchaseDisabled}
          className={cn(
            'relative flex w-full flex-col items-center justify-center gap-0.5 overflow-hidden px-4 py-3.5 text-[15px] font-black tracking-tight transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
            btnRound,
            purchaseDisabled && 'bg-slate-200 text-slate-500',
            !purchaseDisabled &&
              isExtended &&
              'border border-violet-400/30 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 text-white shadow-[0_12px_32px_-8px_rgba(109,40,217,0.45)] hover:brightness-[1.03]',
            !purchaseDisabled &&
              !isExtended &&
              'border border-emerald-500/25 bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-[0_12px_32px_-8px_rgba(5,150,105,0.4)] hover:from-teal-700 hover:to-emerald-700'
          )}
        >
          {!purchaseDisabled && <CtaSheen roundedClass={btnRound} />}
          <span className="relative z-[1] flex items-center justify-center gap-2">
            {purchaseDisabled ? t('passPricing.purchase_locked', language) : t('passPricing.purchase', language)}
            {!purchaseDisabled && <ArrowRight className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2.5} />}
          </span>
          {!purchaseDisabled && (
            <span className="relative z-[1] flex items-center justify-center gap-1 text-[10px] font-semibold text-white/90">
              <Lock className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
              {t('passPricing.cta_secure_line', language)}
            </span>
          )}
        </button>
      </div>

      {/* Receipt-style trust strip */}
      <div className="flex flex-col items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[8px] font-medium text-slate-400">
          <span className="inline-flex items-center gap-1 opacity-90">
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-[#003087]" fill="currentColor" aria-hidden>
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.603c-.564 0-1.04.408-1.13.964L7.076 21.337z" />
            </svg>
            PayPal
          </span>
          <span className="inline-flex items-center gap-1 opacity-90">
            <CreditCard className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
            {language === 'en' ? 'Card' : language === 'fr' ? 'Carte' : 'Kaed'}
          </span>
          <span className="inline-flex items-center gap-0.5 opacity-90">
            <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden />
            SSL
          </span>
        </div>
      </div>
    </div>
  );
}

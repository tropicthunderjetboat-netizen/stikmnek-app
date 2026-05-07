import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleCheck, Gift, MapPin, Minus, Plus, Zap } from 'lucide-react';

import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import {
  BASE_PRICE_AUD,
  calculatePassPrice,
  clampPartySize,
  GUEST_FEE_AUD,
  MAX_PARTY_SIZE,
} from '@/data/pricing';
import { cn } from '@/lib/utils';

interface DealsPricingCardProps {
  onPurchase?: (opts?: { isExtended?: boolean; partySize?: number }) => void;
  initialPartySize?: number;
  initialExtended?: boolean;
  purchaseDisabled?: boolean;
}

/** Marketing estimate shown in savings bubble (aligned with typical “first day” upside). */
const estimatedFirstDaySavingsAud = (partySize: number) => partySize * BASE_PRICE_AUD;

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
  const dayOnlyTotal = useMemo(() => calculatePassPrice(partySize, false), [partySize]);
  const weekTotal = useMemo(() => calculatePassPrice(partySize, true), [partySize]);

  const formatAud = (amount: number) =>
    new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    }).format(amount);

  const microPricing = t('passPricing.pricing_micro', language)
    .replace('__BASE__', String(BASE_PRICE_AUD))
    .replace('__GUEST__', String(GUEST_FEE_AUD))
    .replace('__MAX__', String(MAX_PARTY_SIZE));

  const headline = t('passPricing.holiday_headline', language);
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

  return (
    <div
      className={cn(
        'rounded-2xl p-[1px] transition-all duration-300',
        isExtended
          ? 'bg-gradient-to-br from-violet-400/80 via-fuchsia-400/55 to-violet-500/80 shadow-lg shadow-violet-300/45'
          : 'bg-slate-200/90 shadow-sm'
      )}
    >
      <div className="rounded-[15px] bg-white px-3 pt-2 pb-3 sm:px-5 sm:py-4 space-y-2 sm:space-y-3">
        <p className="text-[10px] leading-tight text-center text-slate-500 px-0.5">{microPricing}</p>

        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500 shrink-0">
            {t('passPricing.people_label', language)}
          </span>
          <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1 py-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setPartySize((p) => clampPartySize(p - 1))}
              disabled={partySize <= 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              aria-label={t('passPricing.aria_decrease_party', language)}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[1.25rem] text-center text-base font-black tabular-nums text-slate-900">
              {partySize}
            </span>
            <button
              type="button"
              onClick={() => setPartySize((p) => clampPartySize(p + 1))}
              disabled={partySize >= MAX_PARTY_SIZE}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              aria-label={t('passPricing.aria_increase_party', language)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="text-[9px] text-slate-400 shrink-0 w-full text-center sm:w-auto sm:text-left">
            {maxPartyNote}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 items-stretch">
          <button
            type="button"
            onClick={() => setIsExtended(false)}
            className={cn(
              'rounded-xl border-2 px-2 py-2 text-center transition-all h-full flex flex-col',
              !isExtended
                ? 'border-slate-900 bg-white shadow-md ring-1 ring-slate-900/10'
                : 'border-slate-100 bg-slate-50/80 hover:border-slate-200'
            )}
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-900">
              {t('passPricing.card_1d_title', language)}
            </p>
            <p className="text-[9px] text-slate-500 mt-0.5">{t('passPricing.card_1d_hint', language)}</p>
            <p className="text-sm font-black text-slate-900 mt-auto pt-2 tabular-nums">{formatAud(dayOnlyTotal)}</p>
          </button>

          <button
            type="button"
            onClick={() => setIsExtended(true)}
            className={cn(
              'relative rounded-xl border-2 px-2 pt-3 pb-2 text-center transition-all h-full flex flex-col',
              isExtended
                ? 'border-violet-500 bg-gradient-to-b from-violet-50 via-white to-white shadow-md'
                : 'border-slate-100 bg-slate-50/80 hover:border-violet-200'
            )}
          >
            <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-white shadow-md">
              {t('passPricing.badge_best_value', language)}
            </span>
            <div
              className={cn(
                'mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md',
                isExtended && 'animate-pulse'
              )}
            >
              <Gift className="h-4 w-4" />
            </div>
            <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-violet-600">
              {t('passPricing.card_7d_title', language)}
            </p>
            <p className="text-[10px] font-black leading-tight text-violet-950 mt-0.5 line-clamp-3">
              {headline}
            </p>
            <p className="text-[8px] leading-snug text-violet-800/85 mt-0.5 line-clamp-2 sm:line-clamp-3 flex-1">
              {sub}
            </p>
            <div className="mt-auto pt-1">
              <p className="text-[8px] font-semibold text-violet-600/90">
                {t('passPricing.holiday_addon_micro', language)}
              </p>
              <p className="text-xs font-black text-violet-950 mt-0.5 tabular-nums">{formatAud(weekTotal)}</p>
              <p className="text-[8px] text-slate-500">{t('passPricing.card_7d_hint', language)}</p>
            </div>
          </button>
        </div>

        <div className="text-center pt-0.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            {t('passPricing.total_label', language)}
          </p>
          <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 tabular-nums">
            {formatAud(total)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-y border-slate-100 py-1.5 text-[10px] sm:text-xs font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1">
            <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>{t('passPricing.chip_35', language)}</span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-600" />
            <span>{t('passPricing.chip_map', language)}</span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 shrink-0 text-teal-600" />
            <span>{t('passPricing.chip_qr', language)}</span>
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          <div className="relative max-w-[98%] rounded-xl bg-emerald-900 px-2.5 py-1.5 text-center shadow-md">
            <p className="text-[10px] font-bold leading-snug text-white">{savingsText}</p>
            <div
              className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-emerald-900"
              aria-hidden
            />
          </div>
          <button
            type="button"
            onClick={handlePurchase}
            disabled={purchaseDisabled}
            className={cn(
              'w-full rounded-xl py-2.5 sm:py-3 text-sm font-black text-white shadow-lg transition flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
              purchaseDisabled
                ? 'bg-gradient-to-r from-slate-400 to-slate-500'
                : isExtended
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 shadow-violet-400/35'
                  : 'bg-gradient-to-r from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900'
            )}
          >
            {purchaseDisabled ? t('passPricing.purchase_locked', language) : t('passPricing.purchase', language)}
            {!purchaseDisabled && <ArrowRight className="h-4 w-4 shrink-0 opacity-95" />}
          </button>
        </div>
      </div>
    </div>
  );
}

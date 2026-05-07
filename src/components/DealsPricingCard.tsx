import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleCheck, Gift, MapPin, Minus, Plus, Zap } from 'lucide-react';

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
        'flex flex-col rounded-3xl shadow-2xl transition-[background,box-shadow] duration-300 overflow-hidden',
        isExtended
          ? 'bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 ring-1 ring-white/20'
          : 'bg-slate-50 ring-1 ring-slate-200/80 shadow-slate-200/60'
      )}
    >
      <div className="flex flex-col gap-1.5 px-2.5 pt-2 pb-2.5 sm:gap-2 sm:px-4 sm:pt-3 sm:pb-4">
        {/* Duration pill toggle */}
        <div
          className={cn(
            'mx-auto flex w-full max-w-[17.5rem] rounded-full p-0.5',
            isExtended ? 'bg-black/20 shadow-inner' : 'bg-slate-200/90'
          )}
          role="group"
          aria-label={t('passPricing.coverage_label', language)}
        >
          <button
            type="button"
            onClick={() => setIsExtended(false)}
            className={cn(
              'flex-1 rounded-full py-1.5 text-[11px] font-black uppercase tracking-wide transition-all',
              !isExtended ? 'bg-white text-slate-900 shadow-md' : 'text-white/85 hover:text-white'
            )}
          >
            {t('passPricing.duration_1d', language)}
          </button>
          <button
            type="button"
            onClick={() => setIsExtended(true)}
            className={cn(
              'flex-1 rounded-full py-1.5 text-[11px] font-black uppercase tracking-wide transition-all',
              isExtended
                ? 'bg-white text-blue-700 shadow-md'
                : 'text-slate-600 hover:text-slate-800'
            )}
          >
            {t('passPricing.duration_7d', language)}
          </button>
        </div>

        {isExtended ? (
          <div className="flex flex-col items-center gap-1 pt-0.5">
            <div
              className={cn(
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg ring-2 ring-white/40',
                'animate-pulse'
              )}
              aria-hidden
            >
              <Gift className="h-8 w-8 stroke-[1.75]" />
            </div>
            <h3 className="text-center text-[1.35rem] leading-[1.05] font-black uppercase tracking-tight text-white sm:text-3xl">
              {t('passPricing.hero_holiday_title', language)}
            </h3>
            <div className="w-full max-w-sm rounded-xl border-2 border-amber-200/90 bg-gradient-to-b from-amber-50 to-white px-2 py-1.5 shadow-md">
              <p className="text-center text-[11px] font-black leading-tight text-amber-950 sm:text-xs">
                {headline}
              </p>
            </div>
            <p className="max-w-sm px-1 text-center text-[9px] font-semibold leading-snug text-white/90 sm:text-[10px]">
              {sub}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5 pt-0.5 pb-0.5">
            <h3 className="text-center text-lg font-black uppercase tracking-tight text-slate-900 sm:text-xl">
              {t('passPricing.hero_1d_title', language)}
            </h3>
            <p className="max-w-sm px-2 text-center text-[10px] text-slate-600 sm:text-xs">
              {t('passPricing.hero_1d_sub', language)}
            </p>
          </div>
        )}

        {/* People */}
        <div className="flex flex-col items-center gap-0.5">
          <span
            className={cn(
              'text-[9px] font-bold uppercase tracking-wide',
              isExtended ? 'text-white/70' : 'text-slate-500'
            )}
          >
            {t('passPricing.people_label', language)}
          </span>
          <div
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full border px-1 py-0.5 shadow-sm',
              isExtended
                ? 'border-white/30 bg-white/20 backdrop-blur-md'
                : 'border-slate-200 bg-white'
            )}
          >
            <button
              type="button"
              onClick={() => setPartySize((p) => clampPartySize(p - 1))}
              disabled={partySize <= 1}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full transition disabled:opacity-35',
                isExtended ? 'text-white hover:bg-white/15' : 'text-slate-700 hover:bg-slate-100'
              )}
              aria-label={t('passPricing.aria_decrease_party', language)}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span
              className={cn(
                'min-w-[1.25rem] text-center text-base font-black tabular-nums',
                isExtended ? 'text-white' : 'text-slate-900'
              )}
            >
              {partySize}
            </span>
            <button
              type="button"
              onClick={() => setPartySize((p) => clampPartySize(p + 1))}
              disabled={partySize >= MAX_PARTY_SIZE}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full transition disabled:opacity-35',
                isExtended ? 'text-white hover:bg-white/15' : 'text-slate-700 hover:bg-slate-100'
              )}
              aria-label={t('passPricing.aria_increase_party', language)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className={cn('text-[8px]', isExtended ? 'text-white/55' : 'text-slate-400')}>{maxPartyNote}</span>
        </div>

        {/* Total */}
        <div className="flex flex-col items-center py-0.5">
          <span
            className={cn(
              'text-[9px] font-bold uppercase tracking-widest',
              isExtended ? 'text-white/60' : 'text-slate-500'
            )}
          >
            {t('passPricing.total_label', language)}
          </span>
          <p
            className={cn(
              'text-[2.1rem] font-black leading-none tracking-tight tabular-nums sm:text-4xl',
              isExtended ? 'text-white drop-shadow-sm' : 'text-slate-900'
            )}
          >
            {formatAud(total)}
          </p>
        </div>

        {/* Value strip — no boxes */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-1 text-[10px] font-bold sm:text-[11px]',
            isExtended ? 'text-white/95' : 'text-slate-600'
          )}
        >
          <span className="inline-flex items-center gap-0.5">
            <CircleCheck className={cn('h-3 w-3 shrink-0', isExtended ? 'text-emerald-200' : 'text-emerald-600')} />
            {t('passPricing.chip_35', language)}
          </span>
          <span className={isExtended ? 'text-white/35' : 'text-slate-300'}>·</span>
          <span className="inline-flex items-center gap-0.5">
            <MapPin className={cn('h-3 w-3 shrink-0', isExtended ? 'text-sky-100' : 'text-sky-600')} />
            {t('passPricing.chip_map', language)}
          </span>
          <span className={isExtended ? 'text-white/35' : 'text-slate-300'}>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Zap className={cn('h-3 w-3 shrink-0', isExtended ? 'text-amber-100' : 'text-teal-600')} />
            {t('passPricing.chip_qr', language)}
          </span>
        </div>

        {/* Savings bubble + CTA */}
        <div className="mt-0.5 flex flex-col items-stretch">
          <div className="relative z-10 rounded-t-2xl rounded-b-sm bg-emerald-600 px-2 py-1.5 text-center shadow-md ring-1 ring-emerald-500/80">
            <p className="text-[10px] font-bold leading-snug text-white sm:text-[11px]">{savingsText}</p>
          </div>
          <div className="relative z-[11] -mt-px flex justify-center" aria-hidden>
            <div className="h-0 w-0 border-x-[8px] border-x-transparent border-t-[9px] border-t-emerald-600 drop-shadow-sm" />
          </div>
          <button
            type="button"
            onClick={handlePurchase}
            disabled={purchaseDisabled}
            className={cn(
              'relative z-20 -mt-px w-full rounded-2xl border px-3 py-3 text-sm font-black tracking-wide transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
              'flex items-center justify-center gap-2',
              purchaseDisabled
                ? 'border-white/20 bg-white/10 text-white/70'
                : isExtended
                  ? cn(
                      'border-white/50 bg-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_24px_rgba(0,0,0,0.2)]',
                      'backdrop-blur-md hover:bg-white/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_28px_rgba(0,0,0,0.22)]'
                    )
                  : cn(
                      'border-slate-300/80 bg-gradient-to-b from-white via-white to-slate-50/95 text-slate-900 shadow-md backdrop-blur-sm',
                      'ring-1 ring-white/80 hover:from-slate-50 hover:to-slate-100'
                    )
            )}
          >
            {purchaseDisabled ? t('passPricing.purchase_locked', language) : t('passPricing.purchase', language)}
            {!purchaseDisabled && (
              <ArrowRight className={cn('h-4 w-4 shrink-0', isExtended ? 'text-white' : 'text-slate-800')} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

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

const estimatedFirstDaySavingsAud = (partySize: number) => partySize * BASE_PRICE_AUD;

function CtaSheen() {
  return (
    <span
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      aria-hidden
    >
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

  const simpleLine = t('passPricing.simple_header', language)
    .replace('__BASE__', String(BASE_PRICE_AUD))
    .replace('__GUEST__', String(GUEST_FEE_AUD));

  const ribbonPrefix = t('passPricing.holiday_ribbon_prefix', language);
  const ribbonEmphasis = t('passPricing.holiday_ribbon_emphasis', language);
  const ribbonTitle = t('passPricing.holiday_ribbon_title', language);
  const sub = t('passPricing.holiday_sub', language);
  const saveAud = estimatedFirstDaySavingsAud(partySize);
  const savingsText = t('passPricing.savings_anchor', language)
    .replace('__COUNT__', String(partySize))
    .replace('__SAVE__', String(saveAud));

  const maxPartyNote = t('passPricing.max_per_pass', language).replace('__N__', String(MAX_PARTY_SIZE));

  const glassWell = isExtended
    ? 'rounded-2xl border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md'
    : 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)]';

  const handlePurchase = () => {
    if (purchaseDisabled) return;
    onPurchase?.({ isExtended, partySize });
  };

  return (
    <div
      className={cn(
        'flex flex-col rounded-[2rem] text-center shadow-2xl transition-[background,box-shadow] duration-300',
        isExtended
          ? 'bg-gradient-to-b from-[#0081C9] to-[#005B96] shadow-[0_20px_50px_-12px_rgba(0,91,150,0.45)]'
          : 'bg-slate-50 shadow-[0_18px_40px_-14px_rgba(15,23,42,0.12)]'
      )}
    >
      <div className="flex flex-col gap-1 px-2.5 pb-2 pt-1.5 sm:gap-1.5 sm:px-3 sm:pb-2.5 sm:pt-2">
        {/* Subtle pricing context — does not compete with controls */}
        <p
          className={cn(
            'mx-auto max-w-[20rem] text-[8px] font-medium leading-snug sm:text-[9px]',
            isExtended ? 'text-white/40' : 'text-slate-400'
          )}
        >
          {simpleLine}
        </p>

        {/* Coverage — glass well */}
        <div className={cn('px-2 py-1.5', glassWell)}>
          <p
            className={cn(
              'mb-1 text-[8px] font-bold uppercase tracking-widest',
              isExtended ? 'text-white/55' : 'text-slate-400'
            )}
          >
            {t('passPricing.coverage_label', language)}
          </p>
          <div
            className={cn(
              'mx-auto flex w-full max-w-[16.5rem] rounded-full p-0.5',
              isExtended ? 'bg-black/15' : 'bg-slate-100'
            )}
            role="group"
            aria-label={t('passPricing.coverage_label', language)}
          >
            <button
              type="button"
              onClick={() => setIsExtended(false)}
              className={cn(
                'flex-1 rounded-full py-1.5 text-[10px] font-black uppercase tracking-wide transition-all',
                !isExtended ? 'bg-white text-slate-900 shadow-md' : 'text-white/80 hover:text-white'
              )}
            >
              {t('passPricing.duration_1d', language)}
            </button>
            <button
              type="button"
              onClick={() => setIsExtended(true)}
              className={cn(
                'flex-1 rounded-full py-1.5 text-[10px] font-black uppercase tracking-wide transition-all',
                isExtended ? 'bg-white text-[#005B96] shadow-md' : 'text-slate-600 hover:text-slate-800'
              )}
            >
              {t('passPricing.duration_7d', language)}
            </button>
          </div>
        </div>

        {/* People — glass well */}
        <div className={cn('flex flex-col items-center px-2 py-1.5', glassWell)}>
          <span
            className={cn(
              'mb-0.5 text-[8px] font-bold uppercase tracking-widest',
              isExtended ? 'text-white/55' : 'text-slate-400'
            )}
          >
            {t('passPricing.people_label', language)}
          </span>
          <div
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full border px-0.5 py-0.5',
              isExtended ? 'border-white/25 bg-white/5' : 'border-slate-100 bg-slate-50'
            )}
          >
            <button
              type="button"
              onClick={() => setPartySize((p) => clampPartySize(p - 1))}
              disabled={partySize <= 1}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full transition disabled:opacity-30',
                isExtended ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'
              )}
              aria-label={t('passPricing.aria_decrease_party', language)}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span
              className={cn(
                'min-w-[1.25rem] text-center text-sm font-black tabular-nums',
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
                'inline-flex h-7 w-7 items-center justify-center rounded-full transition disabled:opacity-30',
                isExtended ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'
              )}
              aria-label={t('passPricing.aria_increase_party', language)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className={cn('mt-0.5 text-[7px]', isExtended ? 'text-white/45' : 'text-slate-400')}>
            {maxPartyNote}
          </span>
        </div>

        {/* Holiday luxury ribbon (7-day) */}
        {isExtended ? (
          <div className="relative mx-auto w-full max-w-[19.5rem] overflow-visible rounded-2xl bg-white px-2.5 pb-2 pt-2 shadow-[0_10px_28px_rgba(0,0,0,0.14),inset_0_0_48px_rgba(139,92,246,0.1)] ring-1 ring-violet-200/50">
            <span className="absolute -right-0.5 -top-0.5 z-10 rounded-md bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 px-1.5 py-0.5 text-[6.5px] font-black uppercase leading-none tracking-wide text-amber-950 shadow-md ring-1 ring-amber-200/80 sm:text-[7px]">
              {t('passPricing.badge_best_value', language)}
            </span>
            <p className="text-center text-[9px] font-black uppercase tracking-[0.2em] text-violet-950/90">
              {ribbonTitle}
            </p>
            <div className="mx-auto mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-50 to-white text-violet-600 shadow-inner ring-1 ring-violet-100">
              <Gift className="h-7 w-7" strokeWidth={1.65} aria-hidden />
            </div>
            <p className="mt-1.5 text-center text-[10px] font-semibold leading-snug text-slate-700 sm:text-[11px]">
              <span className="text-slate-600">{ribbonPrefix}</span>
              <span className="text-[12px] font-black tracking-tight text-violet-700 sm:text-sm">{ribbonEmphasis}</span>
            </p>
            <p className="mx-auto mt-1 max-w-[17rem] text-center text-[8px] font-medium leading-snug text-slate-500 sm:text-[9px]">
              {sub}
            </p>
          </div>
        ) : (
          <div className={cn('mx-auto w-full max-w-[19.5rem] rounded-2xl px-2 py-1.5', glassWell)}>
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">{t('passPricing.hero_1d_title', language)}</h3>
            <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{t('passPricing.hero_1d_sub', language)}</p>
          </div>
        )}

        {/* Total */}
        <div className="flex flex-col items-center py-0.5">
          <span
            className={cn(
              'text-[8px] font-bold uppercase tracking-[0.2em]',
              isExtended ? 'text-white/50' : 'text-slate-400'
            )}
          >
            {t('passPricing.total_label', language)}
          </span>
          <p
            className={cn(
              'text-[1.85rem] font-black leading-none tracking-tight tabular-nums sm:text-[2.15rem]',
              isExtended ? 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.2)]' : 'text-slate-900'
            )}
          >
            {formatAud(total)}
          </p>
        </div>

        {/* Feature row — single line, punchy */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 py-0.5 text-[9px] font-bold sm:text-[10px]',
            isExtended ? 'text-white' : 'text-slate-600'
          )}
        >
          <span className="inline-flex items-center gap-0.5">
            <CircleCheck
              className={cn('h-3 w-3 shrink-0 stroke-[2.5]', isExtended ? 'text-white' : 'text-emerald-600')}
            />
            {t('passPricing.chip_row_35', language)}
          </span>
          <span className={isExtended ? 'text-white/35' : 'text-slate-300'} aria-hidden>
            •
          </span>
          <span className="inline-flex items-center gap-0.5">
            <MapPin className={cn('h-3 w-3 shrink-0', isExtended ? 'text-white' : 'text-sky-600')} />
            {t('passPricing.chip_row_map', language)}
          </span>
          <span className={isExtended ? 'text-white/35' : 'text-slate-300'} aria-hidden>
            •
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Zap className={cn('h-3 w-3 shrink-0', isExtended ? 'text-white' : 'text-teal-600')} />
            {t('passPricing.chip_row_qr', language)}
          </span>
        </div>

        {/* Savings bubble + CTA */}
        <div className="mt-0.5 flex flex-col items-stretch">
          <div
            className={cn(
              'relative z-10 rounded-t-2xl rounded-b-sm bg-emerald-600 px-2 py-1.5 text-center',
              'ring-1 ring-emerald-400/60',
              'shadow-[0_0_0_1px_rgba(6,95,70,0.35),0_6px_18px_-2px_rgba(16,185,129,0.55),0_14px_40px_-6px_rgba(52,211,153,0.5)]'
            )}
          >
            <p className="text-center text-[10px] font-bold leading-snug text-white sm:text-[11px]">{savingsText}</p>
          </div>
          <div className="relative z-[11] -mt-px flex justify-center" aria-hidden>
            <div className="h-0 w-0 border-x-[8px] border-x-transparent border-t-[9px] border-t-emerald-600 drop-shadow-sm" />
          </div>
          <div
            className="pointer-events-none relative z-[12] -mt-1.5 mx-auto h-2 w-[80%] rounded-full bg-emerald-400/30 blur-md"
            aria-hidden
          />
          <button
            type="button"
            onClick={handlePurchase}
            disabled={purchaseDisabled}
            className={cn(
              'relative z-20 -mt-1 w-full overflow-hidden rounded-2xl border px-3 py-3.5 text-sm font-black tracking-wide transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
              'flex items-center justify-center gap-2',
              purchaseDisabled && 'border-white/15 bg-white/10 text-white/70',
              !purchaseDisabled &&
                isExtended &&
                'border-violet-400/40 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 text-white shadow-[0_10px_28px_-4px_rgba(91,33,182,0.55)] hover:brightness-110',
              !purchaseDisabled &&
                !isExtended &&
                'border-emerald-500/30 bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-[0_10px_26px_-4px_rgba(5,150,105,0.45)] hover:from-teal-700 hover:to-emerald-700'
            )}
          >
            {!purchaseDisabled && <CtaSheen />}
            <span className="relative z-[1]">
              {purchaseDisabled ? t('passPricing.purchase_locked', language) : t('passPricing.purchase', language)}
            </span>
            {!purchaseDisabled && (
              <ArrowRight className="relative z-[1] h-4 w-4 shrink-0 opacity-95" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

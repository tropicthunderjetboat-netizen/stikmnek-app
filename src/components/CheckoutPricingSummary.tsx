import React from 'react';
import {
  BASE_PRICE_AUD,
  EXTEND_FEE_AUD,
  GUEST_FEE_AUD,
  calculatePassPrice,
  clampPartySize,
} from '@/data/pricing';
import { t } from '@/data/translations';
import type { Language } from '@/data/translations';

export type CheckoutPricingSummaryProps = {
  partySize: number;
  isExtended: boolean;
  language: Language;
  /** Sidebar column uses slightly tighter spacing. */
  variant?: 'default' | 'sidebar';
  /** When false, hides the green savings strip (e.g. payment step uses the larger savings anchor). */
  showSavingsCallout?: boolean;
};

/**
 * Line-item pass price breakdown for checkout — matches `calculatePassPrice` / Edge pricing.
 */
const CheckoutPricingSummary: React.FC<CheckoutPricingSummaryProps> = ({
  partySize,
  isExtended,
  language,
  variant = 'default',
  showSavingsCallout = true,
}) => {
  const p = clampPartySize(partySize);
  const totalPrice = calculatePassPrice(p, isExtended);
  const extraGuestCount = Math.max(0, p - 1);
  const extraGuestTotal = extraGuestCount * GUEST_FEE_AUD;
  const potentialSavings = p * 10;

  const pad = variant === 'sidebar' ? 'p-3' : 'p-4';
  const textMain = variant === 'sidebar' ? 'text-xs' : 'text-sm';
  const textTotal = variant === 'sidebar' ? 'text-base' : 'text-lg';

  const extraRowLabel = t('checkout.extra_guests_row', language)
    .replace('__COUNT__', String(extraGuestCount))
    .replace('__FEE__', String(GUEST_FEE_AUD));

  const savingsLine = t('checkout.potential_savings', language).replace('__AMOUNT__', String(potentialSavings));

  return (
    <div className={`bg-gray-50 rounded-lg ${pad} space-y-3 border border-gray-100`}>
      <p className={`${textMain} font-semibold text-gray-800`}>{t('checkout.breakdown_title', language)}</p>

      <div className={`space-y-2 ${textMain}`}>
        <div className="flex justify-between gap-3 text-gray-900">
          <span>{t('checkout.base_pass_row', language)}</span>
          <span className="font-semibold tabular-nums shrink-0">A${BASE_PRICE_AUD}</span>
        </div>

        {extraGuestCount > 0 && (
          <div className="flex justify-between gap-3 text-gray-700">
            <span>{extraRowLabel}</span>
            <span className="font-semibold tabular-nums shrink-0">+A${extraGuestTotal}</span>
          </div>
        )}

        {isExtended && (
          <div className="flex justify-between gap-3 text-gray-700">
            <span>{t('checkout.extension_row', language)}</span>
            <span className="font-semibold tabular-nums shrink-0">+A${EXTEND_FEE_AUD}</span>
          </div>
        )}
      </div>

      <div className={`border-t border-gray-200 pt-3 flex justify-between items-baseline gap-3 ${textMain}`}>
        <span className="font-bold text-gray-900">{t('checkout.total_row', language)}</span>
        <span className={`${textTotal} font-black text-gray-900 tabular-nums`}>
          A${totalPrice.toFixed(2)}
          <span className="text-xs font-semibold text-gray-500 ml-1">AUD</span>
        </span>
      </div>

      {showSavingsCallout && (
        <div className="bg-green-100 rounded-lg p-2.5 text-center border border-green-200/80">
          <p className="text-xs sm:text-sm text-green-800 font-semibold leading-snug">{savingsLine}</p>
        </div>
      )}
    </div>
  );
};

export default CheckoutPricingSummary;

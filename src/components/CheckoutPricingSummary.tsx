import React from 'react';
import {
  BASE_PRICE_AUD,
  EXTEND_FEE_AUD,
  GUEST_FEE_AUD,
  calculatePassPrice,
  clampPartySize,
  extraGuestsFeeFromSeventhAud,
  extraGuestsFeeThroughSixthAud,
} from '@/data/pricing';
import { t } from '@/data/translations';
import type { Language } from '@/data/translations';

export type CheckoutPricingSummaryProps = {
  partySize: number;
  isExtended: boolean;
  language: Language;
  /** Sidebar column uses slightly tighter spacing. */
  variant?: 'default' | 'sidebar';
};

/**
 * Line-item pass price breakdown for checkout — matches `calculatePassPrice` / Edge pricing.
 */
const CheckoutPricingSummary: React.FC<CheckoutPricingSummaryProps> = ({
  partySize,
  isExtended,
  language,
  variant = 'default',
}) => {
  const p = clampPartySize(partySize);
  const totalPrice = calculatePassPrice(p, isExtended);
  const extraThroughSixth = extraGuestsFeeThroughSixthAud(p);
  const extraFromSeventh = extraGuestsFeeFromSeventhAud(p);
  const extraGuestsCountThroughSixth = p <= 1 ? 0 : Math.min(p - 1, 5);
  const extraGuestsCountFromSeventh = p < 7 ? 0 : 1 + (p - 7);

  const pad = variant === 'sidebar' ? 'p-3' : 'p-4';
  const textMain = variant === 'sidebar' ? 'text-xs' : 'text-sm';
  const textTotal = variant === 'sidebar' ? 'text-base' : 'text-lg';

  const extraGuestsLabelThroughSixth = t('checkout.extra_guests_row', language)
    .replace('__COUNT__', String(extraGuestsCountThroughSixth))
    .replace('__FEE__', String(GUEST_FEE_AUD));
  const extraGuestsLabelFromSeventh = t('checkout.extra_guests_row', language)
    .replace('__COUNT__', String(extraGuestsCountFromSeventh))
    .replace('__FEE__', String(GUEST_FEE_AUD));

  return (
    <div className={`bg-gray-50 rounded-lg ${pad} space-y-3 border border-gray-100`}>
      <p className={`${textMain} font-semibold text-gray-800`}>{t('checkout.breakdown_title', language)}</p>

      <div className={`space-y-2 ${textMain}`}>
        <div className="flex justify-between gap-3 text-gray-900">
          <span>{t('checkout.base_pass_row', language)}</span>
          <span className="font-semibold tabular-nums shrink-0">A${BASE_PRICE_AUD}</span>
        </div>

        {extraThroughSixth > 0 && (
          <div className="flex justify-between gap-3 text-gray-700">
            <span>{extraGuestsLabelThroughSixth}</span>
            <span className="font-semibold tabular-nums shrink-0">+A${extraThroughSixth.toFixed(0)}</span>
          </div>
        )}

        {extraFromSeventh > 0 && (
          <div className="flex justify-between gap-3 text-gray-700">
            <span>{extraGuestsLabelFromSeventh}</span>
            <span className="font-semibold tabular-nums shrink-0">+A${extraFromSeventh.toFixed(0)}</span>
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
    </div>
  );
};

export default CheckoutPricingSummary;

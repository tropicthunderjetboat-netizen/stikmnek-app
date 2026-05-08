import React, { useMemo, useEffect } from 'react';
import { Tag, Percent, ArrowRight, Calendar, Globe } from 'lucide-react';
import LocationMapPicker from '@/components/LocationMapPicker';
import WebsiteUrlInput from '@/components/WebsiteUrlInput';
import { formatVT } from '@/lib/utils';

const DURATION_OPTIONS = [
  { value: '1_day', label: '1 Day', labelFr: '1 Jour', days: 1 },
  { value: '1_week', label: '1 Week', labelFr: '1 Semaine', days: 7 },
  { value: '2_weeks', label: '2 Weeks', labelFr: '2 Semaines', days: 14 },
  { value: '1_month', label: '1 Month', labelFr: '1 Mois', days: 30 },
  { value: '3_months', label: '3 Months', labelFr: '3 Mois', days: 90 },
  { value: '6_months', label: '6 Months', labelFr: '6 Mois', days: 180 },
  { value: '1_year', label: '1 Year', labelFr: '1 An', days: 365 },
];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

interface PricingDiscountFieldsProps {
  /** When tiered pricing is used (tours/activities), prices come from tiers; keep only discount + validity + extras. */
  mode?: 'flat' | 'tiered';
  originalPrice: string;
  discountPercent: string;
  onOriginalPriceChange: (val: string) => void;
  onDiscountPercentChange: (val: string) => void;
  onCalculatedValues: (dealPrice: string, discountLabel: string) => void;
  // Optional: discount validity period
  showValidity?: boolean;
  discountValidFrom?: string;
  listingDuration?: string;
  onDiscountValidFromChange?: (val: string) => void;
  onListingDurationChange?: (val: string) => void;
  // Optional: map location and website
  showExtras?: boolean;
  mapUrl?: string;
  website?: string;
  onMapUrlChange?: (val: string) => void;
  onWebsiteChange?: (val: string) => void;
  // Language
  language?: string;
}

const PricingDiscountFields: React.FC<PricingDiscountFieldsProps> = ({
  mode = 'flat',
  originalPrice,
  discountPercent,
  onOriginalPriceChange,
  onDiscountPercentChange,
  onCalculatedValues,
  showValidity = false,
  discountValidFrom = todayStr(),
  listingDuration = '1_month',
  onDiscountValidFromChange,
  onListingDurationChange,
  showExtras = false,
  mapUrl = '',
  website = '',
  onMapUrlChange,
  onWebsiteChange,
  language = 'en',
}) => {
  // Auto-calculate deal price
  const calculatedDealPrice = useMemo(() => {
    if (mode === 'tiered') return '';
    const orig = parseFloat(originalPrice);
    const pct = parseFloat(discountPercent);
    if (!isNaN(orig) && orig > 0 && !isNaN(pct) && pct > 0 && pct < 100) {
      return (orig * (1 - pct / 100)).toFixed(2);
    }
    return '';
  }, [originalPrice, discountPercent]);

  const calculatedDiscountLabel = useMemo(() => {
    const pct = parseFloat(discountPercent);
    if (!isNaN(pct) && pct > 0 && pct < 100) {
      return `${Math.round(pct)}% OFF`;
    }
    return '';
  }, [discountPercent]);

  // Sync calculated values to parent
  useEffect(() => {
    onCalculatedValues(calculatedDealPrice, calculatedDiscountLabel);
  }, [calculatedDealPrice, calculatedDiscountLabel]);

  // Discount validity
  const selectedDuration = DURATION_OPTIONS.find(d => d.value === listingDuration);
  const discountValidUntil = selectedDuration
    ? addDays(discountValidFrom, selectedDuration.days)
    : addDays(discountValidFrom, 30);

  return (
    <div className="space-y-5">
      {/* ─── Pricing & Discount Section ─── */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100">
        <div className="flex items-center gap-2 mb-1">
          <Tag className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-teal-800">
            {language === 'en' ? 'Pricing & Discount (VT)' : language === 'fr' ? 'Prix et remise (VT)' : 'Praes mo Diskaon (VT)'}
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-medium">
            {language === 'en' ? 'Discount Optional' : language === 'fr' ? 'Remise optionnelle' : 'Diskaon Opsonal'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {mode === 'tiered'
            ? language === 'en'
              ? 'For tours & activities, prices come from your tier table below. Use this section to set an optional % discount badge and validity dates.'
              : language === 'fr'
                ? 'Pour les visites et activités, les prix viennent du tableau des paliers ci-dessous. Utilisez cette section pour définir une remise (%) et des dates.'
                : 'Long tua mo aktiviti, praes i kam long tier tebol daon. Yusum ples ia blong setem diskaon (%) mo det.'
            : language === 'en'
              ? 'Enter your price in Vatu (VT). Discount is optional — businesses offering discounts get featured priority.'
              : language === 'fr'
                ? 'Entrez votre prix en Vatu (VT). La remise est optionnelle — les entreprises offrant des remises sont prioritaires.'
                : 'Putum praes long Vatu (VT). Diskaon i opsonal — bisnis we i gat diskaon i go fas.'}
        </p>


        {/* Price + Discount + New Price row */}
        <div className={mode === 'tiered' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 items-end' : 'grid grid-cols-1 sm:grid-cols-3 gap-3 items-end'}>
          {mode !== 'tiered' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {language === 'en' ? 'Your Price (VT)' : language === 'fr' ? 'Votre prix (VT)' : 'Praes blong yu (VT)'}
              </label>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">VT</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={originalPrice}
                  onChange={(e) => onOriginalPriceChange(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  placeholder="5000"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {language === 'en' ? 'Regular price per person in Vatu' : 'Prix normal par personne en Vatu'}
              </p>
            </div>
          )}

          {/* Discount Percentage */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {language === 'en' ? 'Discount (%)' : language === 'fr' ? 'Remise (%)' : 'Diskaon (%)'}
            </label>

            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="number"
                min="1"
                max="99"
                step="1"
                value={discountPercent}
                onChange={(e) => onDiscountPercentChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                placeholder="20"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {language === 'en' ? 'Percentage off for pass holders' : 'Pourcentage de réduction'}
            </p>
          </div>

          {mode !== 'tiered' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {language === 'en' ? 'New Price (auto)' : language === 'fr' ? 'Nouveau prix (auto)' : 'Niu Praes (oto)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">VT</span>
                <input
                  type="text"
                  value={calculatedDealPrice ? formatVT(parseFloat(calculatedDealPrice)).replace('VT ', '') : '—'}
                  readOnly
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm cursor-not-allowed ${
                    calculatedDealPrice
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {language === 'en' ? 'Calculated from price & discount' : 'Calculé automatiquement'}
              </p>
            </div>
          )}
        </div>

        {/* ─── Live Price Breakdown Preview ─── */}
        {mode !== 'tiered' && calculatedDealPrice && originalPrice && (
          <div className="mt-4 p-4 rounded-xl bg-white border border-teal-200 shadow-sm">
            <div className="flex items-center gap-1.5 mb-3">
              <Tag className="w-3.5 h-3.5 text-teal-600" />
              <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                {language === 'en' ? 'Customer will see' : language === 'fr' ? 'Le client verra' : 'Kastoma bae luk'}
              </span>
            </div>

            {/* Visual price flow: Original → Discount → New Price */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-gray-400 mb-0.5">
                  {language === 'en' ? 'Was' : 'Était'}
                </span>
                <span className="text-lg text-gray-400 line-through font-medium">
                  {formatVT(parseFloat(originalPrice))}
                </span>
              </div>

              <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />

              <div className="flex flex-col items-center">
                <span className="text-[10px] text-gray-400 mb-0.5">
                  {language === 'en' ? 'Discount' : 'Remise'}
                </span>
                <span className="px-3 py-1 rounded-lg bg-orange-100 text-orange-700 text-sm font-bold">
                  {calculatedDiscountLabel}
                </span>
              </div>

              <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />

              <div className="flex flex-col items-center">
                <span className="text-[10px] text-emerald-500 mb-0.5 font-medium">
                  {language === 'en' ? 'Now' : 'Maintenant'}
                </span>
                <span className="text-2xl font-extrabold text-emerald-600">
                  {formatVT(parseFloat(calculatedDealPrice))}
                </span>
              </div>
            </div>

            {/* Savings summary */}
            <div className="flex items-center justify-between pt-3 border-t border-teal-100">
              <span className="text-xs text-gray-500">
                {language === 'en' ? 'Customer saves' : language === 'fr' ? 'Le client économise' : 'Kastoma i sevem'}
              </span>
              <span className="text-sm font-bold text-emerald-600">
                {formatVT(parseFloat(originalPrice) - parseFloat(calculatedDealPrice))}{' '}
                <span className="text-xs font-normal text-gray-400">
                  {language === 'en' ? 'per person' : 'par personne'}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Discount Validity Period ─── */}
      {showValidity && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-blue-800">
              {language === 'en' ? 'Discount Validity Period' : language === 'fr' ? 'Période de validité de la remise' : 'Taem blong Diskaon'}
            </h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            {language === 'en'
              ? 'Select when your discount starts and choose a listing duration. The end date is automatically calculated.'
              : 'Sélectionnez la date de début et choisissez une durée. La date de fin est calculée automatiquement.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {language === 'en' ? 'Discount Valid From *' : 'Stat Dei *'}
              </label>
              <input
                type="date"
                value={discountValidFrom}
                min={todayStr()}
                onChange={(e) => onDiscountValidFromChange?.(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {language === 'en' ? 'Listing Duration' : 'Hamas Taem'}
              </label>
              <select
                value={listingDuration}
                onChange={(e) => onListingDurationChange?.(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {DURATION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {language === 'fr' ? opt.labelFr : opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {language === 'en' ? 'End date auto-calculated from option' : 'Date de fin calculée automatiquement'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {language === 'en' ? 'Discount Valid Until' : 'En Dei'}
              </label>
              <input
                type="date"
                value={discountValidUntil}
                readOnly
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 text-gray-600 cursor-not-allowed"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">
                {language === 'en' ? 'Auto-set from duration' : 'Défini automatiquement'}
              </p>
            </div>
          </div>

          {/* Date Range Preview */}
          {discountValidFrom && (
            <div className="mt-3 p-3 rounded-lg bg-white border border-blue-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-gray-700">
                  {new Date(discountValidFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="text-xs text-gray-400">to</span>
                <span className="text-xs font-semibold text-gray-700">
                  {new Date(discountValidUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-xs font-bold">
                {selectedDuration?.days} {language === 'en' ? 'days' : 'jours'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── Map Location & Website ─── */}
      {showExtras && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-purple-800">
              {language === 'en' ? 'Online Presence & Map' : language === 'fr' ? 'Présence en ligne et carte' : 'Onlaen mo Map'}
            </h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            {language === 'en'
              ? 'Set your location on the map and add your website so tourists can find you easily.'
              : 'Indiquez votre emplacement sur la carte et votre site web.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LocationMapPicker
              mapUrl={mapUrl}
              onMapUrlChange={(v) => onMapUrlChange?.(v)}
              language={language}
            />
            <WebsiteUrlInput
              website={website}
              onWebsiteChange={(v) => onWebsiteChange?.(v)}
              language={language}
              id="pricing-discount-website"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export { DURATION_OPTIONS, addDays, todayStr };
export default PricingDiscountFields;

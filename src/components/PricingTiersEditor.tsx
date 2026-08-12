import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Users, Anchor, Settings2, ChevronDown } from 'lucide-react';
import { formatVT } from '@/lib/utils';
import type { Language } from '@/data/translations';
import type { PricingTierInput } from '@/lib/pricingTiers';
import {
  emptyPricingTier,
  tierPresetLabel,
  TIER_PRESET_SLOTS,
} from '@/lib/pricingTiers';

export interface PricingTiersEditorProps {
  tiers: PricingTierInput[];
  onChange: (next: PricingTierInput[]) => void;
  language: Language;
  /** When set (0–100), StikmNek VT per tier follows standard VT × (1 − pct/100). */
  discountPercent?: number | null;
  /** Use fixed Adults / Children cards instead of generic "Tier 1" labels. */
  usePresetSlots?: boolean;
}

/** Charter rows carry the whole-boat flat price; identified by label prefix. */
function isCharterTier(tier: PricingTierInput): boolean {
  return /^charter/i.test((tier.label || '').trim());
}

/** Stable list key — must not depend on editable fields like `label` or prices. */
function tierStableKey(tier: PricingTierInput, index: number): string {
  if (isCharterTier(tier)) return `charter-${index}`;
  const preset = TIER_PRESET_SLOTS[index];
  if (preset) return preset.key;
  return `row-${index}`;
}

function dealFromOriginal(original: number, pct: number): number {
  return Math.max(0, Math.round(original * (1 - pct / 100)));
}

const PricingTiersEditor: React.FC<PricingTiersEditorProps> = ({
  tiers,
  onChange,
  language,
  discountPercent = null,
  usePresetSlots = true,
}) => {
  const lang = language === 'fr' ? 'fr' : 'en';
  const [showAdvanced, setShowAdvanced] = useState(false);
  const autoMode =
    discountPercent != null && Number.isFinite(discountPercent) && discountPercent > 0;

  const t = {
    title:
      language === 'en'
        ? 'Price for each guest (VT)'
        : language === 'fr'
          ? 'Prix par visiteur (VT)'
          : 'Putum nomol praes, then diskaon pas praes blong wanwan man.',
    hint: autoMode
      ? language === 'en'
        ? 'Type your normal price for each guest. We work out the discounted pass price for you. Children under 6 are usually free.'
        : language === 'fr'
          ? 'Saisissez votre prix normal pour chaque visiteur. Nous calculons le prix réduit du pass. Les enfants de moins de 6 ans sont gratuits.'
          : 'Nem'
      : language === 'en'
        ? 'Type your normal price, then the lower pass price for each guest. Children under 6 are usually free.'
        : language === 'fr'
          ? 'Saisissez votre prix normal puis le prix réduit du pass pour chaque visiteur.'
          : 'exsampol. Adult (13+)',
    labelField:
      language === 'en' ? 'Guest name' : language === 'fr' ? 'Libellé' : 'Adult',
    labelPlaceholder:
      language === 'en' ? 'e.g. Adults (13+)' : language === 'fr' ? 'ex. Adultes (13+)' : 'Pikinini',
    adults:
      language === 'en' ? 'Adults' : language === 'fr' ? 'Adultes' : 'Bebi',
    children:
      language === 'en' ? 'Children' : language === 'fr' ? 'Enfants' : 'opsonal',
    infants:
      language === 'en' ? 'Infants' : language === 'fr' ? 'Bébés' : 'Nomol praes (VT)',
    optionalTag:
      language === 'en' ? 'optional' : language === 'fr' ? 'optionnel' : 'Pas praes (VT)',
    orig:
      language === 'en' ? 'Normal price (VT)' : language === 'fr' ? 'Prix normal (VT)' : 'Nomol praes — olgeta grup (VT)',
    deal:
      language === 'en' ? 'Pass price (VT)' : language === 'fr' ? 'Prix du pass (VT)' : 'Pas praes — olgeta grup (VT)',
    origFlat:
      language === 'en' ? 'Normal price — whole group (VT)' : language === 'fr' ? 'Prix normal — groupe entier (VT)' : 'Pas praes',
    dealFlat:
      language === 'en' ? 'Pass price — whole group (VT)' : language === 'fr' ? 'Prix du pass — groupe entier (VT)' : 'Nem blong jata',
    passPriceLabel:
      language === 'en' ? 'Pass price' : language === 'fr' ? 'Prix du pass' : 'exsampol. Private jata (5 pipol)',
    charterName:
      language === 'en' ? 'Charter name' : language === 'fr' ? 'Nom du charter' : 'Min man',
    charterNamePlaceholder:
      language === 'en' ? 'e.g. Private Charter (up to 5)' : language === 'fr' ? 'ex. Charter privé (jusqu\'à 5)' : 'Max man (opsonal)',
    minPax:
      language === 'en' ? 'Min people' : language === 'fr' ? 'Min pers.' : 'Addem bebi praes',
    maxPax:
      language === 'en' ? 'Max people (optional)' : language === 'fr' ? 'Max pers. (optionnel)' : 'Addem praevet jata',
    addInfant:
      language === 'en' ? 'Add infant price' : language === 'fr' ? 'Ajouter tarif bébé' : 'Kivim',
    addCharter:
      language === 'en' ? 'Add private charter' : language === 'fr' ? 'Ajouter charter privé' : 'Sam moa opsen',
    remove:
      language === 'en' ? 'Remove' : language === 'fr' ? 'Supprimer' : 'Addem wan laen',
    advanced:
      language === 'en' ? 'More options' : language === 'fr' ? 'Plus d’options' : 'Olgeta grup (flat praes)',
    freeformAdd:
      language === 'en' ? 'Add price row' : language === 'fr' ? 'Ajouter une ligne' : 'Private jata',
    charterTag:
      language === 'en' ? 'Whole group (flat rate)' : language === 'fr' ? 'Groupe entier (tarif fixe)' : 'Serem',
  };

  useEffect(() => {
    if (discountPercent == null || !Number.isFinite(discountPercent) || discountPercent < 0) return;
    if (tiers.length === 0) return;
    const pct = discountPercent;
    onChange(
      tiers.map((row) => ({
        ...row,
        deal_price_vt: dealFromOriginal(row.original_price_vt, pct),
      })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only discount % should trigger recalculation
  }, [discountPercent]);

  const updateTier = (index: number, patch: Partial<PricingTierInput>) => {
    const row = tiers[index];
    if (!row) return;
    const merged: PricingTierInput = { ...row, ...patch };
    // Auto-calculate deal price when standard price changes and discount is set
    if (
      discountPercent != null &&
      Number.isFinite(discountPercent) &&
      discountPercent >= 0 &&
      Object.prototype.hasOwnProperty.call(patch, 'original_price_vt')
    ) {
      merged.deal_price_vt = dealFromOriginal(merged.original_price_vt, discountPercent);
    }
    onChange(tiers.map((r, i) => (i === index ? merged : r)));
  };

  const removeTier = (index: number) => {
    if (usePresetSlots && index < 2) return;
    onChange(tiers.filter((_, i) => i !== index));
  };

  const addInfantTier = () => {
    if (tiers.some((t) => /^infant|^b[eé]b[eé]/i.test(t.label))) return;
    onChange([...tiers, emptyPricingTier(2)]);
  };

  const addCharterTier = () => {
    const charterRow: PricingTierInput = {
      label: language === 'en' ? 'Private Charter' : language === 'fr' ? 'Charter privé' : 'Plis jusum wan sta reting',
      min_pax: 1,
      max_pax: 5,
      original_price_vt: 0,
      deal_price_vt: 0,
    };
    onChange([...tiers, charterRow]);
  };

  const addFreeformTier = () => {
    onChange([...tiers, emptyPricingTier(tiers.length)]);
  };

  const defaultLabelForSlot = (index: number) =>
    index === 0 ? t.adults : index === 1 ? t.children : t.infants;

  const hasCharter = tiers.some(isCharterTier);
  const hasInfants = tiers.some((t) => /^infant|^b[eé]b[eé]|^bebi/i.test(t.label));

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5 text-white" aria-hidden />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-violet-950">{t.title}</h3>
          <p className="text-sm text-violet-900 mt-0.5 leading-snug">{t.hint}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {tiers.map((tier, index) => {
          const charter = isCharterTier(tier);
          const editableName = charter || !usePresetSlots;
          const removable = index >= 2 || !usePresetSlots || charter;
          const passPrice = autoMode
            ? dealFromOriginal(tier.original_price_vt, discountPercent as number)
            : tier.deal_price_vt;
          // The 2nd preset slot (Children) is optional — flag it so owners know they can skip it.
          const optional = usePresetSlots && !charter && index >= 1;
          return (
            <div
              key={tierStableKey(tier, index)}
              className={`rounded-xl border p-3.5 shadow-sm ${
                charter ? 'border-amber-300 bg-amber-50/70' : 'border-violet-200 bg-white'
              }`}
            >
              {/* Row header */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-1.5">
                  {charter && <Anchor className="w-4 h-4 text-amber-700 shrink-0" aria-hidden />}
                  <span className="text-sm font-extrabold text-gray-900">
                    {charter ? t.charterTag : defaultLabelForSlot(index)}
                  </span>
                  {optional && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      ({t.optionalTag})
                    </span>
                  )}
                </div>
                {removable && (
                  <button
                    type="button"
                    onClick={() => removeTier(index)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t.remove}
                  </button>
                )}
              </div>

              {/* Editable name (charter / freeform, or under More options for presets) */}
              {(editableName || showAdvanced) && (
                <div className="mb-2.5">
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    {charter ? t.charterName : t.labelField}
                  </label>
                  <input
                    type="text"
                    value={tier.label}
                    onChange={(e) => updateTier(index, { label: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-base"
                    placeholder={charter ? t.charterNamePlaceholder : t.labelPlaceholder}
                    maxLength={60}
                  />
                </div>
              )}

              {/* Normal price */}
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {charter ? t.origFlat : t.orig}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">VT</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={tier.original_price_vt || ''}
                  onChange={(e) =>
                    updateTier(index, { original_price_vt: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="0"
                />
              </div>

              {/* Pass price — auto-computed from the discount %, or entered manually */}
              {autoMode ? (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <span className="text-xs font-bold text-emerald-800">{t.passPriceLabel}</span>
                  <span className="text-base font-extrabold text-emerald-700">
                    {tier.original_price_vt > 0 ? formatVT(passPrice) : '—'}
                  </span>
                </div>
              ) : (
                <div className="mt-2.5">
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    {charter ? t.dealFlat : t.deal}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">VT</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={tier.deal_price_vt || ''}
                      onChange={(e) =>
                        updateTier(index, { deal_price_vt: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {/* Advanced: how many people this price covers */}
              {showAdvanced && (
                <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 max-w-[18rem]">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">{t.minPax}</label>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      step={1}
                      value={Number.isFinite(tier.min_pax) ? tier.min_pax : 0}
                      onChange={(e) =>
                        updateTier(index, { min_pax: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                      }
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">{t.maxPax}</label>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      step={1}
                      value={tier.max_pax ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          updateTier(index, { max_pax: null });
                          return;
                        }
                        updateTier(index, { max_pax: Math.max(0, Math.floor(Number(raw) || 0)) });
                      }}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* More options toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-violet-700 hover:text-violet-900"
      >
        <Settings2 className="w-4 h-4" />
        {t.advanced}
        <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
      </button>

      {showAdvanced && (
        <div className="flex flex-wrap gap-2">
          {usePresetSlots && !hasInfants && (
            <button
              type="button"
              onClick={addInfantTier}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-violet-300 text-violet-800 text-sm font-bold hover:bg-violet-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t.addInfant}
            </button>
          )}

          {!hasCharter && (
            <button
              type="button"
              onClick={addCharterTier}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-amber-300 text-amber-800 text-sm font-bold hover:bg-amber-50 transition-colors"
            >
              <Anchor className="w-4 h-4" />
              {t.addCharter}
            </button>
          )}

          {!usePresetSlots && (
            <button
              type="button"
              onClick={addFreeformTier}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-violet-300 text-violet-800 text-sm font-bold hover:bg-violet-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t.freeformAdd}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PricingTiersEditor;

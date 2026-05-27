import React, { useEffect } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
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
  /** Use fixed Adults / Children cards instead of generic “Tier 1” labels. */
  usePresetSlots?: boolean;
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
  const lang = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';

  const t = {
    title:
      language === 'en'
        ? 'Per-person pricing (VT)'
        : language === 'fr'
          ? 'Tarifs par personne (VT)'
          : 'Praes long wanwan man (VT)',
    hint:
      language === 'en'
        ? 'Set the standard price and StikmNek price for adults and children. The headline discount % above applies to both rows when you change standard VT.'
        : language === 'fr'
          ? 'Indiquez le prix standard et le prix StikmNek pour adultes et enfants.'
          : 'Putum stanad mo StikmNek praes blong adult mo pikinini.',
    adults:
      language === 'en' ? 'Adults' : language === 'fr' ? 'Adultes' : 'Adult',
    children:
      language === 'en' ? 'Children' : language === 'fr' ? 'Enfants' : 'Pikinini',
    infants:
      language === 'en' ? 'Infants (optional)' : language === 'fr' ? 'Bébés (optionnel)' : 'Bebi (opsional)',
    orig:
      language === 'en' ? 'Standard VT (per person)' : language === 'fr' ? 'Prix standard VT' : 'Stanad VT',
    deal:
      language === 'en' ? 'StikmNek VT (per person)' : language === 'fr' ? 'Prix StikmNek VT' : 'StikmNek VT',
    addInfant:
      language === 'en' ? 'Add infant pricing' : language === 'fr' ? 'Ajouter tarif bébé' : 'Addem bebi praes',
    remove:
      language === 'en' ? 'Remove' : language === 'fr' ? 'Supprimer' : 'Kivim',
    autoHint:
      language === 'en'
        ? 'StikmNek VT updates from your discount % and standard VT.'
        : language === 'fr'
          ? 'Le prix StikmNek suit votre remise % et le prix standard.'
          : 'StikmNek VT i folem diskaon % mo stanad VT.',
    freeformAdd:
      language === 'en' ? 'Add price row' : language === 'fr' ? 'Ajouter une ligne' : 'Addem wan lain',
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
    let merged: PricingTierInput = { ...row, ...patch };
    if (usePresetSlots && !Object.prototype.hasOwnProperty.call(patch, 'label')) {
      merged = { ...merged, label: tierPresetLabel(index, lang) };
    }
    if (
      discountPercent != null &&
      Number.isFinite(discountPercent) &&
      discountPercent >= 0 &&
      Object.prototype.hasOwnProperty.call(patch, 'original_price_vt')
    ) {
      merged = {
        ...merged,
        deal_price_vt: dealFromOriginal(merged.original_price_vt, discountPercent),
      };
    }
    const next = tiers.map((r, i) => (i === index ? merged : r));
    onChange(next);
  };

  const removeTier = (index: number) => {
    if (usePresetSlots && index < 2) return;
    onChange(tiers.filter((_, i) => i !== index));
  };

  const addInfantTier = () => {
    if (tiers.length >= TIER_PRESET_SLOTS.length) return;
    onChange([...tiers, emptyPricingTier(2)]);
  };

  const addFreeformTier = () => {
    onChange([...tiers, emptyPricingTier(tiers.length)]);
  };

  const slotTitle = (index: number) => {
    if (!usePresetSlots) return `${language === 'en' ? 'Price row' : 'Ligne'} ${index + 1}`;
    if (index === 0) return t.adults;
    if (index === 1) return t.children;
    return t.infants;
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-violet-700" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-violet-900">{t.title}</h3>
          <p className="text-xs text-violet-700/80 mt-0.5">{t.hint}</p>
          {discountPercent != null && Number.isFinite(discountPercent) && discountPercent >= 0 && (
            <p className="text-[11px] text-violet-600/90 mt-1">{t.autoHint}</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {tiers.map((tier, index) => (
          <div
            key={`${index}-${tier.label}`}
            className="rounded-lg border border-violet-100 bg-white p-3 space-y-2 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-violet-950">{slotTitle(index)}</p>
              {usePresetSlots && index >= 2 && (
                <button
                  type="button"
                  onClick={() => removeTier(index)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t.remove}
                </button>
              )}
            </div>
            {!usePresetSlots && (
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                  {language === 'en' ? 'Label' : language === 'fr' ? 'Libellé' : 'Nem'}
                </label>
                <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => updateTier(index, { label: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                  placeholder={language === 'en' ? 'e.g. Adult (13+)' : ''}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">{t.orig}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={tier.original_price_vt || ''}
                  onChange={(e) =>
                    updateTier(index, { original_price_vt: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">{t.deal}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={tier.deal_price_vt || ''}
                  onChange={(e) =>
                    updateTier(index, { deal_price_vt: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {usePresetSlots && tiers.length < 3 && (
        <button
          type="button"
          onClick={addInfantTier}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-violet-300 text-violet-800 text-sm font-semibold hover:bg-violet-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.addInfant}
        </button>
      )}

      {!usePresetSlots && (
        <button
          type="button"
          onClick={addFreeformTier}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-violet-300 text-violet-800 text-sm font-semibold hover:bg-violet-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.freeformAdd}
        </button>
      )}
    </div>
  );
};

export default PricingTiersEditor;

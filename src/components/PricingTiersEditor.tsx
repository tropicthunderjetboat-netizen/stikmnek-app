import React from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
import type { Language } from '@/data/translations';
import type { PricingTierInput } from '@/lib/pricingTiers';
import { emptyPricingTier } from '@/lib/pricingTiers';

export interface PricingTiersEditorProps {
  tiers: PricingTierInput[];
  onChange: (next: PricingTierInput[]) => void;
  language: Language;
}

const PricingTiersEditor: React.FC<PricingTiersEditorProps> = ({ tiers, onChange, language }) => {
  const t = {
    title:
      language === 'en'
        ? 'Tiered pricing (per person, VT)'
        : language === 'fr'
          ? 'Tarification par paliers (par personne, VT)'
          : 'Praes long ol ta (long wanwan man, VT)',
    hint:
      language === 'en'
        ? 'Add one row per price band (e.g. Adult, Child). Leave max empty for “3+” style open-ended tiers. Flat prices above still apply if you add no tiers.'
        : language === 'fr'
          ? 'Ajoutez une ligne par tranche de prix. Laissez le max vide pour un palier ouvert (ex. 3+).'
          : 'Addem wan lain long wan praes. Livim max emti sapos yu laik “3+”.',
    label:
      language === 'en' ? 'Label' : language === 'fr' ? 'Libellé' : 'Nem',
    minPax:
      language === 'en' ? 'Min pax' : language === 'fr' ? 'Min. pers.' : 'Min man',
    maxPax:
      language === 'en' ? 'Max pax (optional)' : language === 'fr' ? 'Max (optionnel)' : 'Max (opsional)',
    orig:
      language === 'en' ? 'Standard VT' : language === 'fr' ? 'Prix standard VT' : 'Stanad VT',
    deal:
      language === 'en' ? 'StikmNek VT' : language === 'fr' ? 'Prix StikmNek VT' : 'StikmNek VT',
    add:
      language === 'en' ? 'Add tier' : language === 'fr' ? 'Ajouter un palier' : 'Addem wan ta',
    remove:
      language === 'en' ? 'Remove' : language === 'fr' ? 'Supprimer' : 'Kivim',
  };

  const updateTier = (index: number, patch: Partial<PricingTierInput>) => {
    const next = tiers.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const removeTier = (index: number) => {
    onChange(tiers.filter((_, i) => i !== index));
  };

  const addTier = () => {
    onChange([...tiers, emptyPricingTier()]);
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <Layers className="w-4 h-4 text-violet-700" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-violet-900">{t.title}</h3>
          <p className="text-xs text-violet-700/80 mt-0.5">{t.hint}</p>
        </div>
      </div>

      {tiers.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          {language === 'en'
            ? 'No tiers yet — click “Add tier” or rely on the single flat price above.'
            : 'Pas encore de paliers — utilisez « Ajouter un palier » ou le prix unique ci-dessus.'}
        </p>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier, index) => (
            <div
              key={index}
              className="rounded-lg border border-violet-100 bg-white p-3 space-y-2 shadow-sm"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">{t.label}</label>
                  <input
                    type="text"
                    value={tier.label}
                    onChange={(e) => updateTier(index, { label: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                    placeholder={language === 'en' ? 'e.g. Adult (13+)' : ''}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">{t.minPax}</label>
                    <input
                      type="number"
                      min={0}
                      value={tier.min_pax}
                      onChange={(e) =>
                        updateTier(index, { min_pax: Math.max(0, parseInt(e.target.value, 10) || 0) })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">{t.maxPax}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tier.max_pax === null ? '' : String(tier.max_pax)}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (v === '') updateTier(index, { max_pax: null });
                        else {
                          const n = parseInt(v, 10);
                          if (!Number.isNaN(n)) updateTier(index, { max_pax: Math.max(0, n) });
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                      placeholder="∞"
                    />
                  </div>
                </div>
              </div>
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
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeTier(index)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t.remove}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addTier}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-violet-300 text-violet-800 text-sm font-semibold hover:bg-violet-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t.add}
      </button>
    </div>
  );
};

export default PricingTiersEditor;

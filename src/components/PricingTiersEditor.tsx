import React, { useEffect } from 'react';
import { Plus, Trash2, Users, Anchor } from 'lucide-react';
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
        ? 'Set the standard price and StikmNek price for each guest type. You can rename the labels (e.g. Adults 13+, Children 3–12). The headline discount % above applies automatically when you enter a standard VT.'
        : language === 'fr'
          ? 'Indiquez le prix standard et le prix StikmNek pour chaque type de visiteur. Renommez les libellés si besoin.'
          : 'Putum stanad mo StikmNek praes. Yu save senisim nem blong evri rol.',
    labelField:
      language === 'en' ? 'Guest label' : language === 'fr' ? 'Libellé' : 'Nem',
    labelPlaceholder:
      language === 'en' ? 'e.g. Adults (13+)' : language === 'fr' ? 'ex. Adultes (13+)' : 'ex. Adult (13+)',
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
    origFlat:
      language === 'en' ? 'Standard VT (whole group)' : language === 'fr' ? 'Prix standard (groupe entier)' : 'Stanad VT (olgeta grup)',
    dealFlat:
      language === 'en' ? 'StikmNek VT (whole group)' : language === 'fr' ? 'Prix StikmNek (groupe entier)' : 'StikmNek VT (olgeta grup)',
    charterName:
      language === 'en' ? 'Charter name' : language === 'fr' ? 'Nom du charter' : 'Nem blong charter',
    charterNamePlaceholder:
      language === 'en' ? 'e.g. Private Charter (up to 5)' : language === 'fr' ? 'ex. Charter privé (jusqu\'à 5)' : 'ex. Private Charter (5 pipol)',
    minPax:
      language === 'en' ? 'Min pax' : language === 'fr' ? 'Min pers.' : 'Min man',
    maxPax:
      language === 'en' ? 'Max pax (optional)' : language === 'fr' ? 'Max pers. (optionnel)' : 'Mak man (opsional)',
    paxHint:
      language === 'en'
        ? 'Leave max blank for open-ended (e.g. 5+).'
        : language === 'fr'
          ? 'Laissez max vide pour illimité (ex. 5+).'
          : 'Livi mak i stap nating blong 5+.',
    addInfant:
      language === 'en' ? 'Add infant pricing' : language === 'fr' ? 'Ajouter tarif bébé' : 'Addem bebi praes',
    addCharter:
      language === 'en' ? 'Add private charter' : language === 'fr' ? 'Ajouter charter privé' : 'Addem praevet charter',
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
    charterTag:
      language === 'en' ? 'Flat rate — whole group' : language === 'fr' ? 'Tarif fixe — groupe entier' : 'Flat praes — olgeta grup',
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
      label: language === 'en' ? 'Private Charter' : language === 'fr' ? 'Charter privé' : 'Private Charter',
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
        {tiers.map((tier, index) => {
          const charter = isCharterTier(tier);
          return (
            <div
              key={`${index}-${tier.label}`}
              className={`rounded-lg border p-3 space-y-2.5 shadow-sm ${
                charter
                  ? 'border-amber-200 bg-amber-50/60'
                  : 'border-violet-100 bg-white'
              }`}
            >
              {/* Row header */}
              <div className="flex items-center justify-between gap-2">
                {charter ? (
                  <div className="flex items-center gap-1.5">
                    <Anchor className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                      {t.charterTag}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wide">
                    {defaultLabelForSlot(index)}
                  </span>
                )}
                {(index >= 2 || !usePresetSlots || charter) && (
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

              {/* Editable label — always shown so owners can add age ranges etc. */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                  {charter ? t.charterName : t.labelField}
                </label>
                <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => updateTier(index, { label: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                  placeholder={charter ? t.charterNamePlaceholder : t.labelPlaceholder}
                  maxLength={60}
                />
              </div>

              {/* Price fields */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                    {charter ? t.origFlat : t.orig}
                  </label>
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
                  <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                    {charter ? t.dealFlat : t.deal}
                  </label>
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

              {/* Pax range (optional max) */}
              <div className="grid grid-cols-2 gap-2 max-w-[18rem]">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">{t.minPax}</label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    step={1}
                    value={Number.isFinite(tier.min_pax) ? tier.min_pax : 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      updateTier(index, { min_pax: v });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                    placeholder={charter ? '1' : index === 0 ? '1' : '0'}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">{t.maxPax}</label>
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
                      const v = Math.max(0, Math.floor(Number(raw) || 0));
                      updateTier(index, { max_pax: v });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                    placeholder={charter ? '5' : ''}
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500 -mt-1">{t.paxHint}</p>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {usePresetSlots && !hasInfants && (
          <button
            type="button"
            onClick={addInfantTier}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-violet-300 text-violet-800 text-sm font-semibold hover:bg-violet-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t.addInfant}
          </button>
        )}

        {!hasCharter && (
          <button
            type="button"
            onClick={addCharterTier}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-amber-300 text-amber-800 text-sm font-semibold hover:bg-amber-50 transition-colors"
          >
            <Anchor className="w-4 h-4" />
            {t.addCharter}
          </button>
        )}

        {!usePresetSlots && (
          <button
            type="button"
            onClick={addFreeformTier}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-violet-300 text-violet-800 text-sm font-semibold hover:bg-violet-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t.freeformAdd}
          </button>
        )}
      </div>
    </div>
  );
};

export default PricingTiersEditor;

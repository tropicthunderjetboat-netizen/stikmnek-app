import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Layers, Loader2, Save, FileText } from 'lucide-react';
import type { Language } from '@/data/translations';
import { CATEGORY_SELECT_KEYS, categoryLabelForKey } from '@/data/businesses';
import {
  hasMeaningfulDescriptionContent,
  plainTextFromHtml,
  sanitizeBusinessDescriptionHtml,
  looksLikeRichDescriptionHtml,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT,
} from '@/lib/businessDescriptionHtml';
import { PROSE_CLASSES } from '@/lib/prose';
import { formatVT } from '@/lib/utils';
import {
  categoryUsesTieredPricing,
  pricingTiersFromDb,
  representativePerPersonPricesFromTiers,
  validatePricingTiersForSubmit,
  type PricingTierInput,
} from '@/lib/pricingTiers';
import { normalizeWebsiteForStorage } from '@/lib/urlHelpers';
import LazyBusinessDescriptionEditor from './LazyBusinessDescriptionEditor';
import PricingDiscountFields from './PricingDiscountFields';
import PricingTiersEditor from './PricingTiersEditor';

export type AdminPendingBusiness = {
  id: string;
  name: string;
  category: string;
  description: string;
  discount: string;
  original_price: number;
  deal_price: number;
  location: string;
  phone: string;
  email?: string;
  hours: string;
  image?: string;
  status: string;
  map_url?: string | null;
  website?: string | null;
  whatsapp_number?: string | null;
  pricing_tiers?: unknown;
  discount_valid_from?: string;
  discount_valid_until?: string;
};

type Draft = {
  name: string;
  category: string;
  description: string;
  discount: string;
  originalPrice: string;
  discountPercent: string;
  dealPrice: string;
  location: string;
  phone: string;
  email: string;
  hours: string;
  mapUrl: string;
  website: string;
  pricingTiers: PricingTierInput[];
};

function discountPercentFromPrices(original: number, deal: number): string {
  if (original > 0 && deal > 0 && deal < original) {
    return String(Math.round((1 - deal / original) * 100));
  }
  return '';
}

function draftFromPending(biz: AdminPendingBusiness): Draft {
  const orig = Number(biz.original_price) || 0;
  const deal = Number(biz.deal_price) || 0;
  const tiers = pricingTiersFromDb(biz.pricing_tiers);
  return {
    name: biz.name || '',
    category: biz.category || 'dining',
    description: biz.description || '',
    discount: biz.discount || '',
    originalPrice: orig > 0 ? String(orig) : '',
    discountPercent: discountPercentFromPrices(orig, deal),
    dealPrice: deal > 0 ? String(deal) : '',
    location: biz.location || '',
    phone: biz.phone || '',
    email: biz.email || '',
    hours: biz.hours || '',
    mapUrl: biz.map_url || '',
    website: biz.website || '',
    pricingTiers: tiers.length > 0 ? tiers.map((t) => ({ ...t })) : [],
  };
}

function TierPricingTable({ tiers }: { tiers: PricingTierInput[] }) {
  if (tiers.length === 0) {
    return (
      <p className="text-sm text-violet-800/80 italic py-2">
        No per-person tiers submitted. Use “Correct before approve” to add tiers if this is a tour or activity.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-violet-100 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-violet-100 text-left text-[10px] uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-semibold">Label</th>
            <th className="px-3 py-2 font-semibold">Pax</th>
            <th className="px-3 py-2 font-semibold">Standard VT</th>
            <th className="px-3 py-2 font-semibold">StikmNek VT</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              <td className="px-3 py-2 font-medium text-gray-900">{row.label || '—'}</td>
              <td className="px-3 py-2 text-gray-700">
                {row.min_pax}
                {row.max_pax != null ? `–${row.max_pax}` : '+'}
              </td>
              <td className="px-3 py-2 text-gray-800">{formatVT(row.original_price_vt)}</td>
              <td className="px-3 py-2 font-semibold text-teal-700">{formatVT(row.deal_price_vt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Props = {
  biz: AdminPendingBusiness;
  language: Language;
  onSaved: (updated: AdminPendingBusiness) => void;
};

const AdminPendingSubmissionReview: React.FC<Props> = ({ biz, language, onSaved }) => {
  const [draft, setDraft] = useState<Draft>(() => draftFromPending(biz));
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(draftFromPending(biz));
    setEditOpen(false);
  }, [biz.id, biz.updated_at, biz.status]);

  const tiers = useMemo(() => pricingTiersFromDb(biz.pricing_tiers), [biz.pricing_tiers]);
  const tierHeadline = useMemo(() => representativePerPersonPricesFromTiers(biz.pricing_tiers), [biz.pricing_tiers]);
  const plainLen = plainTextFromHtml(biz.description || '').length;
  const showTierSection = categoryUsesTieredPricing(biz.category) || tiers.length > 0;
  const canEdit = biz.status === 'pending';

  const saveCorrections = useCallback(async () => {
    if (!draft.name.trim()) {
      toast.error('Listing title is required.');
      return;
    }
    if (!hasMeaningfulDescriptionContent(draft.description)) {
      toast.error('Description is required.');
      return;
    }
    if (plainTextFromHtml(draft.description).length > BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX) {
      toast.error(`Description must be ${BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} characters or fewer (plain text).`);
      return;
    }

    let tiersPayload: unknown[] | null = null;
    if (categoryUsesTieredPricing(draft.category)) {
      const { data, error: tierErr } = validatePricingTiersForSubmit(draft.pricingTiers);
      if (tierErr) {
        toast.error(tierErr);
        return;
      }
      tiersPayload = data;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('pending_businesses')
        .update({
          name: draft.name.trim(),
          category: draft.category,
          description: sanitizeBusinessDescriptionHtml(draft.description),
          discount: draft.discount,
          original_price: Number(draft.originalPrice) || 0,
          deal_price: Number(draft.dealPrice) || 0,
          location: draft.location,
          phone: draft.phone,
          email: draft.email,
          hours: draft.hours,
          map_url: draft.mapUrl || null,
          website: normalizeWebsiteForStorage(draft.website) ?? null,
          pricing_tiers: tiersPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', biz.id)
        .select('*')
        .single();

      if (error) throw error;
      toast.success('Submission updated — approve when ready.');
      onSaved(data as AdminPendingBusiness);
      setEditOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save corrections';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [biz.id, draft, onSaved]);

  return (
    <div className="space-y-4 mb-4">
      {/* Full description */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/80 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 bg-white">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            Full description
          </p>
          <span className="text-[11px] text-gray-500 font-medium">
            {plainLen} chars plain text
            {plainLen > BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT ? (
              <span className="text-orange-600 ml-1">(long)</span>
            ) : null}
          </span>
        </div>
        <div className="max-h-[min(28rem,50vh)] overflow-y-auto px-4 py-3 bg-white">
          {hasMeaningfulDescriptionContent(biz.description) ? (
            looksLikeRichDescriptionHtml(biz.description) ? (
              <div
                className={`${PROSE_CLASSES} text-sm text-gray-800`}
                dangerouslySetInnerHTML={{ __html: sanitizeBusinessDescriptionHtml(biz.description) }}
              />
            ) : (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{plainTextFromHtml(biz.description)}</p>
            )
          ) : (
            <p className="text-sm text-gray-400 italic">No description provided.</p>
          )}
        </div>
      </div>

      {/* Pricing: flat + tiers */}
      <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
        <p className="text-sm font-bold text-teal-900 mb-3">Pricing (VT)</p>
        <div className="flex flex-wrap gap-3 mb-3">
          {(Number(biz.original_price) > 0 || Number(biz.deal_price) > 0) && (
            <div className="px-3 py-2 rounded-lg bg-white border border-teal-100">
              <p className="text-[10px] uppercase text-gray-500 font-medium">Flat listing price</p>
              <p className="text-sm font-bold text-teal-800 mt-0.5">
                StikmNek {formatVT(biz.deal_price)}
                {Number(biz.original_price) > 0 ? (
                  <span className="text-gray-400 font-normal line-through ml-2">
                    {formatVT(biz.original_price)}
                  </span>
                ) : null}
              </p>
              {biz.discount ? (
                <p className="text-xs text-orange-600 font-semibold mt-0.5">{biz.discount}</p>
              ) : null}
            </div>
          )}
          {tierHeadline && (
            <div className="px-3 py-2 rounded-lg bg-white border border-violet-100">
              <p className="text-[10px] uppercase text-violet-600 font-medium">From tiers (lowest deal)</p>
              <p className="text-sm font-bold text-violet-900 mt-0.5">
                {formatVT(tierHeadline.deal_price_vt)}
                <span className="text-gray-400 font-normal line-through ml-2">
                  {formatVT(tierHeadline.original_price_vt)}
                </span>
              </p>
            </div>
          )}
          {Number(biz.original_price) <= 0 &&
            Number(biz.deal_price) <= 0 &&
            !tierHeadline &&
            !showTierSection && (
              <p className="text-sm text-gray-600 italic">No flat or tier prices on file.</p>
            )}
        </div>
        {showTierSection && (
          <div className="p-3 rounded-xl border border-violet-200 bg-violet-50/60">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-violet-700" />
              <p className="text-sm font-bold text-violet-900">Per-person tiers</p>
            </div>
            <TierPricingTable tiers={tiers} />
          </div>
        )}
      </div>

      {canEdit && (
        <div className="rounded-xl border border-indigo-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setEditOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-indigo-50 hover:bg-indigo-100/80 transition-colors text-left"
          >
            <span className="text-sm font-bold text-indigo-900">Correct before approve</span>
            {editOpen ? (
              <ChevronUp className="w-5 h-5 text-indigo-600 shrink-0" />
            ) : (
              <ChevronDown className="w-5 h-5 text-indigo-600 shrink-0" />
            )}
          </button>
          {editOpen && (
            <div className="p-4 space-y-4 bg-white border-t border-indigo-100">
              <p className="text-xs text-indigo-800/90">
                Changes save to this pending submission and apply when you click Approve.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Listing title *</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 capitalize"
                  >
                    {CATEGORY_SELECT_KEYS.map((c) => (
                      <option key={c} value={c}>
                        {categoryLabelForKey(
                          c,
                          language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en',
                        )}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <LazyBusinessDescriptionEditor
                  value={draft.description}
                  onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
                  className="focus-within:ring-indigo-500"
                  placeholder="Full listing description…"
                />
                <p className="text-[11px] text-gray-400 text-right mt-1">
                  {plainTextFromHtml(draft.description).length}/{BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} plain text
                </p>
              </div>
              <PricingDiscountFields
                originalPrice={draft.originalPrice}
                discountPercent={draft.discountPercent}
                onOriginalPriceChange={(v) => setDraft((d) => ({ ...d, originalPrice: v }))}
                onDiscountPercentChange={(v) => setDraft((d) => ({ ...d, discountPercent: v }))}
                onCalculatedValues={(dp, dl) => setDraft((d) => ({ ...d, dealPrice: dp, discount: dl }))}
                showExtras={true}
                mapUrl={draft.mapUrl}
                website={draft.website}
                onMapUrlChange={(v) => setDraft((d) => ({ ...d, mapUrl: v }))}
                onWebsiteChange={(v) => setDraft((d) => ({ ...d, website: v }))}
                language={language}
              />
              {categoryUsesTieredPricing(draft.category) && (
                <PricingTiersEditor
                  tiers={draft.pricingTiers}
                  onChange={(next) => setDraft((d) => ({ ...d, pricingTiers: next }))}
                  language={language}
                  discountPercent={
                    draft.discountPercent.trim() !== '' ? Number(draft.discountPercent) : null
                  }
                />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
                  <input
                    type="text"
                    value={draft.location}
                    onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                  <input
                    type="text"
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Hours</label>
                  <input
                    type="text"
                    value={draft.hours}
                    onChange={(e) => setDraft((d) => ({ ...d, hours: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void saveCorrections()}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save corrections to submission
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPendingSubmissionReview;

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { FunctionsHttpError, FunctionsFetchError, PostgrestError } from '@supabase/supabase-js';
import { getEdgeAuthHeaders, supabase, SUPABASE_URL } from '@/lib/supabase';
import { invokeEdgeFunctionWithRetry, RPC_INSERT_PENDING_TIMEOUT_MS } from '@/lib/edgeInvoke';
import { Store, Check, Loader2, Tag, Calendar, Percent, ArrowRight, AlertTriangle, Globe, Info } from 'lucide-react';

import { formatVT } from '@/lib/utils';
import { toast } from 'sonner';
import PhotoUploader, { UploadedPhoto } from './PhotoUploader';
import PricingTiersEditor from './PricingTiersEditor';
import LocationMapPicker from './LocationMapPicker';
import WebsiteUrlInput from './WebsiteUrlInput';
import {
  displayWebsiteForInput,
  effectiveBusinessCoords,
  googleMapsUrlFromLatLng,
  normalizeWebsiteForStorage,
} from '@/lib/urlHelpers';
import {
  categoryUsesTieredPricing,
  validatePricingTiersForSubmit,
  pricingTiersFromDb,
  pricingTiersForEditor,
  defaultPricingTiersForNewListing,
  type PricingTierInput,
} from '@/lib/pricingTiers';
import { categoryUsesPerUnitPricing, perUnitPriceHint, unitLabelForCategory } from '@/lib/categoryPricing';
import { CATEGORY_SELECT_KEYS, categoryLabelForKey } from '@/data/businesses';
import { businessHoursFromProfileRow, normalizeListingCategoryKey } from '@/lib/businessOfferingMap';
import { listingHoursFieldCopy } from '@/lib/listingHoursLabels';
import { fetchListingEditorBusiness } from '@/lib/listingEditorState';
import { fetchApprovedPhotosForOffering, photoRowsToUploadedPhotos } from '@/lib/fetchApprovedPhotosForOffering';
import {
  buildGalleryPayloadFromPhotos,
  galleryPhotosChanged,
  isPersistedPhotoUrl,
  verifyGallerySavedCount,
} from '@/lib/listingGallerySave';
import { categories, type Business, type Category } from '@/data/businesses';
import {
  hasMeaningfulDescriptionContent,
  plainTextFromHtml,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT,
  trimBusinessDescriptionHtmlForStorage,
} from '@/lib/businessDescriptionHtml';
import {
  validateListingSubmissionOnboarding,
  localizedListingSubmitValidationFeedback,
} from '@/lib/businessOnboardingValidation';
import LazyBusinessDescriptionEditor from './LazyBusinessDescriptionEditor';
import BusinessCredentialsSettings from './BusinessCredentialsSettings';

/** Whole submit (RPC + edge + attach) — allow RPC + edge cold starts without false “slow connection” */
const LISTING_SUBMIT_DEADLINE_MS = 150_000;

const DURATION_OPTIONS = [
  { value: '1_day', label: '1 Day', labelFr: '1 Jour', days: 1 },

  { value: '1_week', label: '1 Week', labelFr: '1 Semaine', days: 7 },
  { value: '2_weeks', label: '2 Weeks', labelFr: '2 Semaines', days: 14 },
  { value: '1_month', label: '1 Month', labelFr: '1 Mois', days: 30 },
  { value: '3_months', label: '3 Months', labelFr: '3 Mois', days: 90 },
  { value: '6_months', label: '6 Months', labelFr: '6 Mois', days: 180 },
  { value: '1_year', label: '1 Year', labelFr: '1 An', days: 365 },
];

/** Match saved discount window to a listing-duration option when possible. */
function inferListingDuration(validFrom: string, validUntil: string): string {
  const from = new Date(`${validFrom.replace(/T.*/, '')}T12:00:00`).getTime();
  const until = new Date(`${validUntil.replace(/T.*/, '')}T12:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until) || until < from) return '1_month';
  const days = Math.round((until - from) / 86400000);
  const exact = DURATION_OPTIONS.find((d) => d.days === days);
  if (exact) return exact.value;
  /** Inclusive calendar windows often land on 364/366 vs nominal 365 — pick closest preset within ±3 days. */
  let best: { value: string; diff: number } | null = null;
  for (const d of DURATION_OPTIONS) {
    const diff = Math.abs(days - d.days);
    if (diff <= 3 && (!best || diff < best.diff)) best = { value: d.value, diff };
  }
  return best?.value ?? '1_month';
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function truncateForSubmissionLog(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  return `${s.slice(0, max)}… (${s.length} chars)`;
}

/** Safe JSON for console (avoids multi‑MB data URLs / HTML in logs). */
function submissionPayloadForLog(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  if (typeof next.description === 'string') {
    next.description = truncateForSubmissionLog(next.description, 500);
  }
  if (typeof next.image === 'string') {
    next.image = truncateForSubmissionLog(next.image, 160);
  }
  if (Array.isArray(next.photos)) {
    next.photos = (next.photos as Record<string, unknown>[]).map((ph) => ({
      ...ph,
      url: typeof ph.url === 'string' ? truncateForSubmissionLog(ph.url, 120) : ph.url,
    }));
  }
  return next;
}

async function formatEdgeInvokeFailure(
  rpcError: { message?: string } | null,
  data: { error?: string } | null | undefined,
  error: unknown,
): Promise<string> {
  if (data?.error && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  if (rpcError?.message?.trim()) return rpcError.message.trim();
  if (error instanceof FunctionsHttpError) {
    const res = error.context;
    let raw = '';
    try {
      raw = await res.clone().text();
    } catch {
      /* ignore */
    }
    try {
      const j = JSON.parse(raw) as { error?: string; message?: string };
      if (typeof j?.error === 'string' && j.error.trim()) return j.error.trim();
      if (typeof j?.message === 'string' && j.message.trim()) return j.message.trim();
    } catch {
      /* use raw */
    }
    if (raw.trim()) return raw.trim();
    return `Server error (${res.status})`;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Failed to submit listing.';
}

async function formatListingSubmitCatchError(
  err: unknown,
  language: string,
): Promise<string> {
  const fallback =
    language === 'en' ? 'Submission failed. Please try again.' : 'Échec de la soumission. Réessayez.';

  if (err instanceof FunctionsHttpError) {
    const res = err.context;
    let rawBody = '';
    try {
      rawBody = await res.clone().text();
    } catch {
      /* ignore */
    }
    let parsed: unknown = rawBody;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : rawBody;
    } catch {
      /* keep text */
    }
    console.error('[BusinessForm] FunctionsHttpError (Edge non-2xx)', {
      status: res.status,
      statusText: res.statusText,
      body: parsed,
    });
    if (parsed && typeof parsed === 'object' && parsed !== null) {
      const o = parsed as Record<string, unknown>;
      if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
      if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    }
    return rawBody?.trim() || `Server error (${res.status})`;
  }

  if (err instanceof FunctionsFetchError) {
    const ctx = err.context as { name?: string; message?: string } | undefined;
    console.error('[BusinessForm] FunctionsFetchError', {
      message: err.message,
      causeName: ctx?.name,
      causeMessage: ctx?.message,
    });
    return ctx?.message || err.message || fallback;
  }

  if (err instanceof PostgrestError) {
    console.error('[BusinessForm] PostgrestError', {
      code: err.code,
      message: err.message,
      details: err.details,
      hint: err.hint,
    });
    return err.message || fallback;
  }

  const o = err as Record<string, unknown> | null;
  if (o && typeof o === 'object' && typeof o.message === 'string' && typeof o.code === 'string') {
    console.error('[BusinessForm] Postgres/REST-shaped error', {
      code: o.code,
      message: o.message,
      details: o.details,
      hint: o.hint,
    });
    return String(o.message);
  }

  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export type EmbeddedListingEdit = {
  profileBusinessId: string;
  /** `business_offerings.id` for the deal being edited (empty for profile-only sidebar rows). */
  offeringId: string;
  /** Deal title from the dashboard row (source of truth vs `dbBusinesses` prefetch). */
  listingTitle: string;
  listingCategory: string;
  business: Business;
  onEditSubmitted?: () => void;
};

type EmbeddedListingResolved = { business: Business; galleryPhotos: UploadedPhoto[] };

type BusinessListingFormProps = {
  embeddedEdit?: EmbeddedListingEdit | null;
};

function asCategoryKey(raw: string): Category {
  return normalizeListingCategoryKey(raw) ?? 'dining';
}

function deriveDiscountPercentFromBusiness(b: Business): string {
  const disc = (b.discount || '').trim();
  const m = disc.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) {
    const p = parseFloat(m[1]);
    if (Number.isFinite(p) && p > 0 && p < 100) return String(Math.round(p));
  }
  const orig = b.originalPrice;
  const deal = b.dealPrice;
  if (orig > 0 && deal >= 0 && deal < orig) {
    return String(Math.round((1 - deal / orig) * 100));
  }
  return '';
}

type EditBaseline = {
  description: string;
  hours: string;
  phone: string;
  email: string;
  discount: string;
  original_price: number;
  deal_price: number;
  location: string;
  whatsapp_number: string | null;
  map_url: string;
  website: string;
  image: string;
  pricing_tiers: unknown[] | null;
  /** Deal title (`business_offerings.title`). */
  listing_title: string;
  /** Canonical category key (also drives offering `tags` when changed). */
  category: string;
  discount_valid_from: string;
  discount_valid_until: string;
};

/** Prefer `hours`, then DB `opening_hours` when the profile row split them across columns. */
function hoursPrefillFromBusiness(b: Business): string {
  return businessHoursFromProfileRow({
    hours: b.hours ?? '',
    opening_hours: (b as unknown as { opening_hours?: unknown }).opening_hours,
  });
}

function buildEditBaseline(b: Business): EditBaseline {
  const rawTiers = b.pricingTiers ?? null;
  const tiered = categoryUsesTieredPricing(asCategoryKey(b.category));
  let pricing_tiers: unknown[] | null = null;
  if (tiered) {
    const { data, error } = validatePricingTiersForSubmit(pricingTiersFromDb(rawTiers));
    pricing_tiers = error ? null : data ?? null;
  }
  const wa = (b.whatsappNumber || b.whatsapp_number || '').trim();
  const cat = asCategoryKey(String(b.category || 'dining'));
  const savedFrom =
    (b.discountValidFrom && String(b.discountValidFrom).trim().split('T')[0]) || '';
  const savedUntil =
    (b.discountValidUntil && String(b.discountValidUntil).trim().split('T')[0]) || '';
  return {
    description: b.description || '',
    hours: hoursPrefillFromBusiness(b),
    phone: b.phone || '',
    email: ((b.contactEmail as string) || '').trim(),
    discount: (b.discount || '').trim(),
    original_price: Number(b.originalPrice) || 0,
    deal_price: Number(b.dealPrice) || 0,
    location: (b.location || '').trim(),
    whatsapp_number: wa === '' ? null : wa,
    map_url: ((b.mapUrl ?? b.map_url) as string | undefined | null)?.trim() || '',
    website: normalizeWebsiteForStorage(typeof b.website === 'string' ? b.website : '') || '',
    image: (b.image || '').trim(),
    pricing_tiers,
    listing_title: (b.name || '').trim(),
    category: cat,
    discount_valid_from: savedFrom,
    discount_valid_until: savedUntil,
  };
}

function discountUntilFromForm(discountValidFrom: string, listingDuration: string): string {
  const selectedDuration = DURATION_OPTIONS.find((d) => d.value === listingDuration);
  return selectedDuration
    ? addDays(discountValidFrom, selectedDuration.days)
    : addDays(discountValidFrom, 30);
}

function baselineSnapshotFromFormState(args: {
  form: {
    name: string;
    description: string;
    hours: string;
    phone: string;
    email: string;
    discount: string;
    originalPrice: string;
    dealPrice: string;
    address: string;
    whatsappNumber: string;
    mapUrl: string;
    website: string;
    category: string;
    discountValidFrom: string;
    listingDuration: string;
  };
  photos: { url: string }[];
  pricingTiers: PricingTierInput[];
}): EditBaseline {
  const descriptionForStorage = trimBusinessDescriptionHtmlForStorage(args.form.description);
  const tiered = categoryUsesTieredPricing(asCategoryKey(args.form.category));
  let pricing_tiers: unknown[] | null = null;
  if (tiered) {
    const { data } = validatePricingTiersForSubmit(args.pricingTiers);
    pricing_tiers = data ?? null;
  }
  const wa = args.form.whatsappNumber.trim();
  const cat = asCategoryKey(args.form.category);
  return {
    description: descriptionForStorage,
    hours: args.form.hours,
    phone: args.form.phone,
    email: (args.form.email || '').trim(),
    discount: (args.form.discount || '').trim(),
    original_price: Number(args.form.originalPrice) || 0,
    deal_price: Number(args.form.dealPrice) || 0,
    location: (args.form.address || '').trim(),
    whatsapp_number: wa === '' ? null : wa,
    map_url: (args.form.mapUrl || '').trim(),
    website: normalizeWebsiteForStorage(args.form.website) || '',
    image: (args.photos[0]?.url || '').trim(),
    pricing_tiers,
    listing_title: (args.form.name || '').trim(),
    category: cat,
    discount_valid_from: (args.form.discountValidFrom || '').trim(),
    discount_valid_until: discountUntilFromForm(args.form.discountValidFrom, args.form.listingDuration),
  };
}

function editBaselinesEqual(a: EditBaseline, b: EditBaseline): boolean {
  return (
    a.description === b.description &&
    a.hours === b.hours &&
    a.phone === b.phone &&
    a.email === b.email &&
    a.discount === b.discount &&
    a.original_price === b.original_price &&
    a.deal_price === b.deal_price &&
    a.location === b.location &&
    a.whatsapp_number === b.whatsapp_number &&
    a.map_url === b.map_url &&
    (a.website || '') === (b.website || '') &&
    a.image === b.image &&
    JSON.stringify(a.pricing_tiers) === JSON.stringify(b.pricing_tiers) &&
    a.listing_title === b.listing_title &&
    a.category === b.category &&
    a.discount_valid_from === b.discount_valid_from &&
    a.discount_valid_until === b.discount_valid_until
  );
}

const BusinessListingForm: React.FC<BusinessListingFormProps> = ({ embeddedEdit = null }) => {
  const {
    language,
    user,
    userProfile,
    currentView,
    setCurrentView,
    setShowAuth,
    setAuthMode,
  } = useAppContext();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [pricingTiers, setPricingTiers] = useState<PricingTierInput[]>([]);
  /** Inline validation for submit (images, description, pricing). */
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    description?: string;
    photos?: string;
    pricing?: string;
  }>({});
  /** Bumps after successful submit so contact prefill runs again on an empty form. */
  const [prefillNonce, setPrefillNonce] = useState(0);
  const [agreedPartnerTerms, setAgreedPartnerTerms] = useState(false);
  const [form, setForm] = useState({
    name: '', category: 'dining', description: '', discount: '',
    originalPrice: '', discountPercent: '', dealPrice: '',
    address: '', phone: '', email: '', hours: '',
    whatsappNumber: '',
    mapUrl: '', website: '',
    discountValidFrom: todayStr(),
    listingDuration: '1_month',
  });

  /** When the owner has exactly one profile, link new pending rows to it (multi-offer workflow). */
  const [ownerProfileBusinessId, setOwnerProfileBusinessId] = useState<string | null>(null);

  const hoursFieldCopy = listingHoursFieldCopy(form.category, language, {
    isPerListing: Boolean(embeddedEdit?.offeringId) || Boolean(ownerProfileBusinessId),
  });

  const editBaselineRef = useRef<EditBaseline | null>(null);
  /** Original discount start date when editing — allows unchanged past dates to pass HTML5 validation. */
  const savedDiscountValidFromRef = useRef<string | null>(null);
  /** Fresh `business_offerings` + gallery from DB (avoids stale `dbBusinesses` / unified row). */
  const [embeddedResolved, setEmbeddedResolved] = useState<EmbeddedListingResolved | null>(null);
  /** Bumps to re-run the embedded listing fetch (e.g. after syncing new gallery rows). */
  const [embeddedFetchNonce, setEmbeddedFetchNonce] = useState(0);
  /** Approved photo URLs when the editor last loaded — used to detect gallery changes on save. */
  const embeddedApprovedPhotoUrlKeysRef = useRef<Set<string>>(new Set());
  /** Prevents async listing reload from wiping in-progress photo uploads. */
  const photosDirtyRef = useRef(false);

  useEffect(() => {
    if (!embeddedEdit) {
      setEmbeddedResolved(null);
      return;
    }
    const oid = embeddedEdit.offeringId?.trim();
    const pid = embeddedEdit.profileBusinessId?.trim();
    if (!pid) {
      setEmbeddedResolved(null);
      return;
    }
    setEmbeddedResolved(null);
    let cancelled = false;
    void (async () => {
      let effectiveOid = oid;
      if (!effectiveOid) {
        const { data: pick, error: pickErr } = await supabase
          .from('business_offerings')
          .select('id')
          .eq('business_id', pid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (pickErr || !pick?.id) {
          return;
        }
        effectiveOid = String(pick.id);
      }
      const b = await fetchListingEditorBusiness(supabase, pid, effectiveOid, SUPABASE_URL);
      if (cancelled) return;
      if (!b || String(b.id) !== effectiveOid) {
        if (!b) console.warn('[BusinessListingForm] embedded listing snapshot failed');
        return;
      }
      const galleryRows = await fetchApprovedPhotosForOffering(supabase, pid, effectiveOid, SUPABASE_URL);
      if (cancelled) return;
      const galleryPhotos = photoRowsToUploadedPhotos(galleryRows, SUPABASE_URL);
      setEmbeddedResolved({ business: b, galleryPhotos });
    })();
    return () => {
      cancelled = true;
    };
  }, [embeddedEdit?.offeringId, embeddedEdit?.profileBusinessId, embeddedFetchNonce]);

  useEffect(() => {
    if (!embeddedEdit) {
      editBaselineRef.current = null;
      savedDiscountValidFromRef.current = null;
      return;
    }
    const oid = embeddedEdit.offeringId?.trim();
    const pid = embeddedEdit.profileBusinessId?.trim();
    const useResolved = Boolean(
      embeddedResolved &&
        pid &&
        String(embeddedResolved.business.profileBusinessId || '') === pid &&
        (!oid || embeddedResolved.business.id === oid),
    );
    const b = useResolved ? embeddedResolved!.business : embeddedEdit.business;
    const galleryPhotos = useResolved ? embeddedResolved!.galleryPhotos : [];

    const lockedTitle =
      embeddedEdit.listingTitle?.trim() || b.name?.trim() || 'Offer';
    const lockedCategoryRaw =
      embeddedEdit.listingCategory?.trim() || String(b.category || '');
    const cat = asCategoryKey(lockedCategoryRaw);
    setPricingTiers(pricingTiersForEditor(b.pricingTiers ?? null));
    const img = (b.image || '').trim();
    if (!photosDirtyRef.current) {
      setPhotos(
        galleryPhotos.length > 0
          ? galleryPhotos.map((p) => ({ ...p }))
          : img
            ? [
                {
                  id: `existing-${b.id}`,
                  url: img,
                  filePath: '',
                  name: 'cover',
                  size: 0,
                  preview: img,
                },
              ]
            : [],
      );
      const galleryUrlKeys = new Set<string>();
      for (const ph of galleryPhotos) {
        const u = String(ph.url || '').trim();
        if (u) galleryUrlKeys.add(u);
      }
      if (galleryUrlKeys.size === 0 && img) galleryUrlKeys.add(img);
      embeddedApprovedPhotoUrlKeysRef.current = galleryUrlKeys;
    }
    const tiered = categoryUsesTieredPricing(cat);
    const pct = deriveDiscountPercentFromBusiness(b);
    const origStr = !tiered && b.originalPrice > 0 ? String(b.originalPrice) : '';
    const dealStr = tiered
      ? ''
      : pct && b.originalPrice > 0
        ? String(Math.round(b.originalPrice * (1 - Number(pct) / 100)))
        : b.dealPrice > 0
          ? String(b.dealPrice)
          : origStr;
    const savedFrom =
      (b.discountValidFrom && String(b.discountValidFrom).trim().split('T')[0]) || '';
    const savedUntil =
      (b.discountValidUntil && String(b.discountValidUntil).trim().split('T')[0]) || '';
    const discountValidFrom = savedFrom || todayStr();
    const listingDuration =
      savedFrom && savedUntil ? inferListingDuration(savedFrom, savedUntil) : '1_month';

    const rawMap = ((b.mapUrl ?? b.map_url) as string | undefined)?.trim() || '';
    const coords = effectiveBusinessCoords({
      lat: b.lat,
      lng: b.lng,
      mapUrl: b.mapUrl ?? undefined,
      map_url: b.map_url ?? undefined,
    });
    const mapUrlPrefill =
      rawMap || (coords ? googleMapsUrlFromLatLng(coords.lat, coords.lng) : '');

    setForm({
      name: lockedTitle,
      category: cat,
      description: b.description || '',
      discount: (b.discount || '').trim(),
      originalPrice: origStr,
      discountPercent: pct,
      dealPrice: dealStr,
      address: b.location || '',
      phone: b.phone || '',
      email: (b.contactEmail || '').trim() || user?.email || '',
      hours: hoursPrefillFromBusiness(b),
      whatsappNumber: (b.whatsappNumber || b.whatsapp_number || '').trim(),
      mapUrl: mapUrlPrefill,
      website: displayWebsiteForInput(b.website ?? null),
      discountValidFrom,
      listingDuration,
    });
    setAgreedPartnerTerms(true);
    setSubmitted(false);
    setFieldErrors({});
    savedDiscountValidFromRef.current = savedFrom || null;
    editBaselineRef.current = buildEditBaseline({ ...b, name: lockedTitle, category: cat });
  }, [
    embeddedResolved,
    embeddedEdit?.profileBusinessId,
    embeddedEdit?.offeringId,
    /** Entire row: new object when `dbBusinesses` / merge refreshes, not only when `id` changes. */
    embeddedEdit?.business,
    embeddedEdit?.listingTitle,
    embeddedEdit?.listingCategory,
    user?.email,
  ]);

  useEffect(() => {
    if (!user?.id) {
      setOwnerProfileBusinessId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled || error) return;
      if (data?.id) setOwnerProfileBusinessId(String(data.id));
      else setOwnerProfileBusinessId(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);


  // Auto-calculate deal price and discount label when original price or discount % changes
  const tierDiscountPercent = useMemo(() => {
    const p = parseFloat(form.discountPercent);
    return Number.isFinite(p) && p >= 0 ? p : null;
  }, [form.discountPercent]);

  const calculatedDealPrice = useMemo(() => {
    const orig = parseFloat(form.originalPrice);
    const pct = parseFloat(form.discountPercent);
    if (!isNaN(orig) && orig > 0 && !isNaN(pct) && pct > 0 && pct < 100) {
      return (orig * (1 - pct / 100)).toFixed(2);
    }
    return '';
  }, [form.originalPrice, form.discountPercent]);

  const calculatedDiscountLabel = useMemo(() => {
    const pct = parseFloat(form.discountPercent);
    if (!isNaN(pct) && pct > 0 && pct < 100) {
      return `${Math.round(pct)}% OFF`;
    }
    return '';
  }, [form.discountPercent]);

  /** Shown in “New price (auto)” — derived from VT + % (and DB deal as fallback). */
  const displayAutoDealPrice = useMemo(() => {
    const orig = parseFloat(String(form.originalPrice).replace(/,/g, ''));
    const pct = parseFloat(String(form.discountPercent).replace(/,/g, ''));
    if (Number.isFinite(orig) && orig > 0 && Number.isFinite(pct) && pct > 0 && pct < 100) {
      return (orig * (1 - pct / 100)).toFixed(2);
    }
    const fd = parseFloat(String(form.dealPrice).replace(/,/g, ''));
    if (Number.isFinite(fd) && fd > 0) return String(fd);
    return '';
  }, [form.originalPrice, form.discountPercent, form.dealPrice]);

  // Sync calculated values into form state for submission (also for tours/activities so cards get deal + badge text).
  useEffect(() => {
    if (calculatedDealPrice && calculatedDiscountLabel) {
      setForm(prev => ({
        ...prev,
        dealPrice: calculatedDealPrice,
        discount: calculatedDiscountLabel,
      }));
    } else if (!embeddedEdit && !categoryUsesTieredPricing(form.category)) {
      setForm(prev => ({
        ...prev,
        dealPrice: '',
        discount: '',
      }));
    }
  }, [calculatedDealPrice, calculatedDiscountLabel, form.category, embeddedEdit]);

  useEffect(() => {
    if (embeddedEdit) return;
    if (!categoryUsesTieredPricing(form.category)) {
      setPricingTiers([]);
    } else if (pricingTiers.length === 0) {
      setPricingTiers(defaultPricingTiersForNewListing());
    }
  }, [form.category, embeddedEdit]);

  // Pre-fill contact & location from the owner's primary business profile (not the deal title).
  useEffect(() => {
    if (embeddedEdit) return;
    if (!user?.id || user.type !== 'business') return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('email, phone, whatsapp_number, location, map_url, website, hours, opening_hours')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const hoursVal =
        (typeof data.opening_hours === 'string' && data.opening_hours.trim()
          ? data.opening_hours
          : typeof data.hours === 'string'
            ? data.hours
            : '') || '';
      const mapUrl = typeof data.map_url === 'string' ? data.map_url.trim() : '';
      const website = typeof data.website === 'string' ? data.website.trim() : '';
      setForm((prev) => ({
        ...prev,
        email: prev.email.trim() ? prev.email : String(data.email || '').trim() || prev.email,
        phone: prev.phone.trim() ? prev.phone : String(data.phone || '').trim() || prev.phone,
        whatsappNumber: prev.whatsappNumber.trim()
          ? prev.whatsappNumber
          : String(data.whatsapp_number || '').trim() || prev.whatsappNumber,
        address: prev.address.trim() ? prev.address : String(data.location || '').trim() || prev.address,
        mapUrl: prev.mapUrl.trim() ? prev.mapUrl : mapUrl || prev.mapUrl,
        website: prev.website.trim() ? prev.website : website || prev.website,
        hours: prev.hours.trim() ? prev.hours : hoursVal || prev.hours,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.type, prefillNonce, embeddedEdit]);

  // Auto-calculate end date
  const selectedDuration = DURATION_OPTIONS.find(d => d.value === form.listingDuration);
  const discountValidUntil = selectedDuration
    ? addDays(form.discountValidFrom, selectedDuration.days)
    : addDays(form.discountValidFrom, 30);

  const resetFormAfterSuccess = useCallback(() => {
    setForm({
      name: '', category: 'dining', description: '', discount: '',
      originalPrice: '', discountPercent: '', dealPrice: '',
      address: '', phone: '', email: '', hours: '',
      whatsappNumber: '',
      mapUrl: '', website: '',
      discountValidFrom: todayStr(),
      listingDuration: '1_month',
    });
    setPhotos([]);
    setPricingTiers([]);
    setPrefillNonce((n) => n + 1);
  }, []);

  /** From home or /business/new, send owners to My Submissions so the new Pending row is visible. */
  const afterListingSubmitSuccess = useCallback(() => {
    toast.success(
      language === 'en'
        ? 'Business listing submitted for review!'
        : 'Inscription soumise pour examen!',
    );
    resetFormAfterSuccess();
    const role = userProfile?.role ?? user?.type;
    if (role === 'business' && (currentView === 'home' || currentView === 'business-new')) {
      setCurrentView('business-dashboard');
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('switch-dashboard-tab', { detail: { tab: 'submissions' } }),
        );
      }, 150);
      return;
    }
    setSubmitted(true);
  }, [
    language,
    user?.type,
    userProfile?.role,
    currentView,
    setCurrentView,
    resetFormAfterSuccess,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    // Require authentication
    if (!user) {
      toast.error(
        language === 'en'
          ? 'Please sign in to submit a business listing'
          : 'Veuillez vous connecter pour soumettre une inscription'
      );
      setAuthMode('signin');
      setShowAuth(true);
      return;
    }

    if (!embeddedEdit && !agreedPartnerTerms) {
      toast.error(
        language === 'en'
          ? 'Please read and accept the Business partner & listing terms to continue.'
          : language === 'fr'
            ? 'Veuillez lire et accepter les conditions Partenaires commerciaux pour continuer.'
            : 'Plis ridim mo agri long Business partner & listing terms bifo yu submit.',
      );
      return;
    }

    const titleForSubmit = embeddedEdit
      ? (form.name?.trim() || embeddedEdit.listingTitle?.trim())
      : form.name?.trim();

    // ─── New + embedded listing: shared rules in `@/lib/businessOnboardingValidation` ───
    // (description, photo URL, flat vs tiered pricing). i18n for toasts / `fieldErrors` below.
    const mainImageUrl = photos.length > 0 ? String(photos[0].url || '').trim() : '';
    const listingValidation = validateListingSubmissionOnboarding({
      title: titleForSubmit ?? '',
      descriptionHtml: form.description,
      category: form.category,
      mainImageUrl,
      flatPricing: categoryUsesTieredPricing(form.category)
        ? null
        : {
            originalPrice: form.originalPrice,
            dealPrice: form.dealPrice,
            discountPercent: form.discountPercent,
          },
      pricingTiers: categoryUsesTieredPricing(form.category) ? pricingTiers : null,
    });

    if (!listingValidation.valid) {
      const { fieldErrors: nextErrors, toastMessage } = localizedListingSubmitValidationFeedback(
        listingValidation.errors,
        form.description,
        language,
      );
      setFieldErrors(nextErrors);
      toast.error(toastMessage);
      return;
    }

    let tiersPayload: unknown[] | null = null;
    if (categoryUsesTieredPricing(form.category)) {
      const { data } = validatePricingTiersForSubmit(pricingTiers);
      tiersPayload = data ?? null;
    }

    if (embeddedEdit) {
      const base = editBaselineRef.current;
      if (!base) {
        toast.error(language === 'en' ? 'Still loading this listing — try again in a moment.' : 'Chargement…');
        return;
      }
      const next = baselineSnapshotFromFormState({ form, photos, pricingTiers });
      const changes: Record<string, unknown> = {};
      if (next.description !== base.description) changes.description = next.description;
      if (next.hours !== base.hours) changes.hours = next.hours;
      if (next.phone !== base.phone) changes.phone = next.phone;
      if (next.discount !== base.discount) changes.discount = next.discount;
      if (next.original_price !== base.original_price) changes.original_price = next.original_price;
      if (next.deal_price !== base.deal_price) changes.deal_price = next.deal_price;
      if (next.location !== base.location) changes.location = next.location;
      const nw = next.whatsapp_number ?? null;
      const bw = base.whatsapp_number ?? null;
      if (nw !== bw) changes.whatsapp_number = nw;
      if (next.map_url !== base.map_url) changes.map_url = next.map_url.trim() === '' ? null : next.map_url.trim();
      const nWeb = (next.website || '').trim();
      const bWeb = (base.website || '').trim();
      if (nWeb !== bWeb) changes.website = nWeb === '' ? null : nWeb;
      if (next.email !== base.email) changes.contact_email = next.email.trim() === '' ? null : next.email.trim();
      if (next.listing_title !== base.listing_title) changes.title = next.listing_title;
      if (next.category !== base.category) changes.tags = [next.category];
      if (next.image !== base.image) changes.image = next.image;
      if (JSON.stringify(next.pricing_tiers) !== JSON.stringify(base.pricing_tiers)) {
        changes.pricing_tiers = next.pricing_tiers;
      }
      if (next.discount_valid_from !== base.discount_valid_from) {
        changes.discount_valid_from = next.discount_valid_from || null;
      }
      if (next.discount_valid_until !== base.discount_valid_until) {
        changes.discount_valid_until = next.discount_valid_until || null;
      }

      const currentPhotoUrls = photos.map((p) => String(p.url || '').trim()).filter(Boolean);
      const photosChanged = galleryPhotosChanged(
        currentPhotoUrls,
        embeddedApprovedPhotoUrlKeysRef.current,
      );

      if (Object.keys(changes).length === 0 && !photosChanged) {
        toast.info(language === 'en' ? 'No changes to submit.' : 'Aucune modification.');
        return;
      }

      const offeringIdForPhotos = String(
        embeddedResolved?.business?.id || embeddedEdit.offeringId || '',
      ).trim();
      const galleryPayload = buildGalleryPayloadFromPhotos(photos);
      const pendingUploadCount = photos.filter((p) => !isPersistedPhotoUrl(String(p.url || ''))).length;
      if (photosChanged && galleryPayload.length === 0) {
        toast.error(
          language === 'en'
            ? 'Photos are still uploading. Wait until each one shows as complete, then save again.'
            : 'Les photos sont en cours de téléchargement. Attendez la fin, puis enregistrez.',
        );
        return;
      }
      if (photosChanged && pendingUploadCount > 0) {
        toast.error(
          language === 'en'
            ? `${pendingUploadCount} photo(s) still uploading. Wait for all uploads to finish before saving.`
            : `${pendingUploadCount} photo(s) en cours. Attendez la fin du téléchargement.`,
        );
        return;
      }

      setSubmitting(true);
      try {
        let editApplied = false;
        if (Object.keys(changes).length > 0) {
          const { data: editData, error: editError } = await supabase.functions.invoke(
            'manage-business',
            {
              headers: await getEdgeAuthHeaders(),
              body: {
                action: 'submit_edit',
                userId: user.id,
                businessId: embeddedEdit.profileBusinessId,
                offeringId: offeringIdForPhotos || undefined,
                changes,
              },
            },
          );
          if (editError) throw editError;
          if (editData?.error) throw new Error(String(editData.error));
          editApplied = Boolean(editData?.appliedLive);
        }

        if (photosChanged && offeringIdForPhotos) {
          const { data: syncData, error: syncError } = await supabase.functions.invoke(
            'manage-business',
            {
              headers: await getEdgeAuthHeaders(),
              body: {
                action: 'sync_listing_gallery',
                userId: user.id,
                businessId: embeddedEdit.profileBusinessId,
                offeringId: offeringIdForPhotos,
                galleryPhotos: galleryPayload,
              },
            },
          );
          if (syncError) throw syncError;
          if (syncData?.error || syncData?.photosSyncFailed) {
            throw new Error(
              String(syncData?.error || 'Photos could not be saved. Please try again.'),
            );
          }
          const totalApproved = Number(syncData?.photosSynced?.totalApproved ?? 0);
          if (totalApproved < galleryPayload.length) {
            throw new Error(
              language === 'en'
                ? `Only ${totalApproved} of ${galleryPayload.length} photos were saved. Deploy the latest manage-business function, then save again.`
                : `Seulement ${totalApproved} sur ${galleryPayload.length} photos enregistrées.`,
            );
          }
          const verified = await verifyGallerySavedCount({
            client: supabase,
            profileBusinessId: embeddedEdit.profileBusinessId,
            offeringId: offeringIdForPhotos,
            supabaseUrl: SUPABASE_URL,
            expectedCount: galleryPayload.length,
          });
          if (verified.savedCount < galleryPayload.length) {
            throw new Error(
              language === 'en'
                ? `Gallery sync incomplete (${verified.savedCount}/${galleryPayload.length} in database). Try saving again.`
                : `Synchronisation incomplète (${verified.savedCount}/${galleryPayload.length}). Réessayez.`,
            );
          }
          embeddedApprovedPhotoUrlKeysRef.current = new Set(verified.savedUrls);
          photosDirtyRef.current = false;
          setEmbeddedFetchNonce((n) => n + 1);
        }
        toast.success(
          language === 'en'
            ? photosChanged && !editApplied
              ? 'Photos updated — your gallery is live on the deal page.'
              : 'Listing updated — changes are live on your deal page.'
            : photosChanged && !editApplied
              ? 'Photos mises à jour — visibles sur votre page.'
              : 'Annonce mise à jour — visible sur votre page.',
        );
        editBaselineRef.current = next;
        embeddedEdit.onEditSubmitted?.();
      } catch (err: unknown) {
        void formatListingSubmitCatchError(err, language).then((msg) => toast.error(msg));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const submitTimedOutMsg =
      language === 'en'
        ? 'The connection is slow. Please check your internet and try again.'
        : 'La connexion est lente. Vérifiez votre réseau et réessayez.';

    setSubmitting(true);
    try {
      await Promise.race([
        (async () => {
      // Prepare photo data to send to edge function (server-side insert bypasses RLS)
      const photoData = photos.map((photo, index) => ({
        url: photo.url,
        filePath: photo.filePath,
        isMain: index === 0,
      }));

      // Headline prices: derive deal from % if needed (tiered categories used to skip this and saved equal orig/deal).
      const finalOriginalPrice = form.originalPrice ? Number(form.originalPrice) : 0;
      let finalDealNumeric = form.dealPrice ? Number(form.dealPrice) : 0;
      const pctSubmit = parseFloat(String(form.discountPercent).replace(/,/g, ''));
      if (
        (!Number.isFinite(finalDealNumeric) || finalDealNumeric <= 0) &&
        finalOriginalPrice > 0 &&
        Number.isFinite(pctSubmit) &&
        pctSubmit > 0 &&
        pctSubmit < 100
      ) {
        finalDealNumeric = finalOriginalPrice * (1 - pctSubmit / 100);
      }
      const finalDealPrice =
        Number.isFinite(finalDealNumeric) && finalDealNumeric > 0 ? finalDealNumeric : finalOriginalPrice;
      let discountStr = String(form.discount || '').trim();
      if (!discountStr && Number.isFinite(pctSubmit) && pctSubmit > 0 && pctSubmit < 100) {
        discountStr = `${Math.round(pctSubmit)}% OFF`;
      }
      const normalizedWebsite = normalizeWebsiteForStorage(form.website) ?? null;
      const descriptionForStorage = trimBusinessDescriptionHtmlForStorage(form.description);

      const submissionPayload = {
        action: 'submit_business',
        userId: user.id,
        name: form.name,
        category: form.category,
        description: descriptionForStorage,
        discount: discountStr,
        originalPrice: finalOriginalPrice,
        dealPrice: finalDealPrice,
        location: form.address || 'Port Vila, Vanuatu',
        phone: form.phone,

        email: form.email || user.email,
        hours: form.hours,
        whatsappNumber: form.whatsappNumber || null,
        image: mainImageUrl,
        photos: photoData,
        mapUrl: form.mapUrl,
        website: normalizedWebsite,
        discountValidFrom: form.discountValidFrom,
        discountValidUntil: discountValidUntil,
        pricingTiers: tiersPayload,
        /** Links pending row to existing profile (same as RPC `p_business_id`); Edge path must mirror RPC. */
        businessId: ownerProfileBusinessId,
      };

      console.log(
        'SUBMISSION_PAYLOAD:',
        JSON.stringify(submissionPayloadForLog(submissionPayload as Record<string, unknown>), null, 2),
      );

      console.log('[BusinessForm] Submitting business listing...', {
        name: form.name,
        category: form.category,
        photosCount: photoData.length,
        userId: user.id,
        businessId: ownerProfileBusinessId,
      });

      // Strategy 1: RPC insert (SECURITY DEFINER, bypasses RLS — most reliable)
      const rpcAborter = new AbortController();
      const rpcTimer = setTimeout(() => rpcAborter.abort(), RPC_INSERT_PENDING_TIMEOUT_MS);
      let rpcId: string | null = null;
      let rpcError: { message?: string; name?: string; code?: string; details?: string; hint?: string } | null = null;
      try {
        const rpcPayload = {
          p_owner_id: user.id,
          p_name: form.name,
          p_category: form.category,
          p_description: descriptionForStorage,
          p_discount: discountStr,
          p_original_price: finalOriginalPrice,
          p_deal_price: finalDealPrice,
          p_location: form.address || 'Port Vila, Vanuatu',
          p_phone: form.phone,
          p_email: form.email || user.email,
          p_hours: form.hours,
          p_image: mainImageUrl,
          p_map_url: form.mapUrl || null,
          p_website: normalizedWebsite,
          p_discount_valid_from: form.discountValidFrom || null,
          p_discount_valid_until: discountValidUntil || null,
          p_whatsapp_number: form.whatsappNumber || null,
          p_pricing_tiers: tiersPayload,
          p_business_id: ownerProfileBusinessId,
        };
        console.log(
          'RPC_INSERT_PENDING_BUSINESS_PAYLOAD:',
          JSON.stringify(
            {
              ...rpcPayload,
              p_description: truncateForSubmissionLog(String(rpcPayload.p_description || ''), 400),
              p_image: truncateForSubmissionLog(String(rpcPayload.p_image || ''), 120),
            },
            null,
            2,
          ),
        );
        const rpcRes = await supabase
          .rpc('insert_pending_business', rpcPayload)
          .abortSignal(rpcAborter.signal);
        rpcId = rpcRes.data != null ? String(rpcRes.data) : null;
        rpcError = rpcRes.error as typeof rpcError;
        if (rpcError?.message || rpcError?.code) {
          console.error('[BusinessForm] RPC insert_pending_business error:', {
            code: rpcError.code,
            message: rpcError.message,
            details: rpcError.details,
            hint: rpcError.hint,
          });
        }
      } catch (rpcEx: any) {
        const aborted =
          rpcEx?.name === 'AbortError' || String(rpcEx?.message || '').toLowerCase().includes('abort');
        rpcError = {
          message: aborted
            ? `Saving your listing timed out after ${Math.round(RPC_INSERT_PENDING_TIMEOUT_MS / 1000)}s. Check your connection and try again.`
            : rpcEx?.message || String(rpcEx),
          name: rpcEx?.name,
        };
      } finally {
        clearTimeout(rpcTimer);
      }

      if (!rpcError && rpcId) {
        console.log('[BusinessForm] RPC insert SUCCESS:', rpcId);
        const directData = { id: rpcId };
        if (directData.id && photos.length > 0) {
          try {
            const photoData = photos.map((p, i) => ({
              url: p.url,
              filePath: p.filePath,
              isMain: i === 0,
            }));
            const { data: attachData, error: attachErr } = await invokeEdgeFunctionWithRetry(
              'manage-business',
              {
                action: 'attach_pending_photos',
                userId: user.id,
                pendingId: String(directData.id),
                photos: photoData,
              },
              { maxRetries: 2, label: 'attach_pending_photos', logPrefix: '[BusinessForm]' },
            );
            if (attachErr || attachData?.error) {
              const detail = await formatEdgeInvokeFailure(null, attachData, attachErr);
              // Listing row already exists; if we only throw, the user often retries and creates duplicates.
              // Best-effort rollback (requires RLS allowing owners to delete their own pending row).
              try {
                const { error: delErr } = await supabase
                  .from('pending_businesses')
                  .delete()
                  .eq('id', String(directData.id))
                  .eq('owner_id', user.id);
                if (delErr) {
                  console.warn('[BusinessForm] Could not roll back pending row after photo attach failure:', delErr);
                }
              } catch (rollbackEx) {
                console.warn('[BusinessForm] Rollback exception after photo attach failure:', rollbackEx);
              }
              throw new Error(detail);
            }
          } catch (photoEx) {
            throw photoEx;
          }
        }
        afterListingSubmitSuccess();
        return;
      }

      // Strategy 2: Edge function fallback (if RPC not deployed or fails)
      console.warn('[BusinessForm] RPC failed, trying manage-business Edge Function...', { rpcError: rpcError?.message });
      console.log(
        'SUBMISSION_PAYLOAD (edge invoke):',
        JSON.stringify(submissionPayloadForLog(submissionPayload as Record<string, unknown>), null, 2),
      );
      const { data, error } = await invokeEdgeFunctionWithRetry(
        'manage-business',
        submissionPayload as Record<string, unknown>,
        { maxRetries: 2, label: 'submit_business', logPrefix: '[BusinessForm]' },
      );

      if (data?.success && data?.business) {
        console.log('[BusinessForm] Edge function submission SUCCESS:', data.business.id);
        afterListingSubmitSuccess();
        return;
      }

      const edgeDetail = await formatEdgeInvokeFailure(rpcError, data, error);
      throw new Error(
        edgeDetail !== 'Failed to submit listing.'
          ? edgeDetail
          : language === 'en'
            ? 'Failed to submit listing. Please ensure the database migration has been applied.'
            : 'Échec de la soumission. Veuillez appliquer la migration de base de données.',
      );
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(submitTimedOutMsg)), LISTING_SUBMIT_DEADLINE_MS),
        ),
      ]);
    } catch (err: unknown) {
      console.error('[BusinessForm] Submit business FINAL error:', err);
      void formatListingSubmitCatchError(err, language).then((msg) => toast.error(msg));
    } finally {
      // Always re-enable submit after RPC failure, edge failure, timeout, or thrown errors.
      setSubmitting(false);
    }

  };

  if (submitted) {
    return (
      <section className="py-20 bg-gradient-to-b from-teal-50 to-white">
        <div className="max-w-lg mx-auto px-4 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            {language === 'en' ? 'Listing Submitted!' : 'Inscription soumise!'}
          </h2>
          <p className="text-gray-500 mb-4">
            {language === 'en'
              ? 'Thank you for listing your business on StikmNek. Our team will review your submission and get back to you within 24 hours. You will receive an email notification once your listing is approved.'
              : 'Merci d\'avoir inscrit votre entreprise sur StikmNek. Notre équipe examinera votre soumission et vous répondra dans les 24 heures. Vous recevrez une notification par email une fois votre inscription approuvée.'}
          </p>
          {ownerProfileBusinessId && (
            <p className="text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 mb-6 text-left">
              {language === 'en'
                ? 'Optional: upload insurance, permits, or training certificates in Business Profile → My credentials. Verified documents help you rank higher on the leaderboard.'
                : language === 'fr'
                  ? 'Facultatif : téléchargez assurance, permis ou certificats dans Profil entreprise → Mes accréditations.'
                  : 'Optional: upload insurance o permit long Business Profile → My credentials.'}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {ownerProfileBusinessId && (
              <button
                type="button"
                onClick={() => {
                  setCurrentView('business-dashboard');
                  window.setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent('switch-dashboard-tab', { detail: { tab: 'profile' } }),
                    );
                  }, 150);
                }}
                className="px-6 py-2.5 rounded-xl border border-teal-200 text-teal-800 font-semibold hover:bg-teal-50 transition-colors"
              >
                {language === 'en' ? 'Upload credentials' : language === 'fr' ? 'Télécharger des documents' : 'Upload kredensel'}
              </button>
            )}
            <button
              onClick={() => setSubmitted(false)}
              className="px-6 py-2.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
            >
              {language === 'en' ? 'Submit Another' : 'Soumettre un autre'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const isEmbeddedEdit = Boolean(embeddedEdit);
  const credentialsProfileId =
    embeddedEdit?.profileBusinessId?.trim() || ownerProfileBusinessId || null;
  const discountValidFromMin =
    isEmbeddedEdit &&
    savedDiscountValidFromRef.current &&
    form.discountValidFrom === savedDiscountValidFromRef.current
      ? savedDiscountValidFromRef.current
      : todayStr();

  return (
    <section
      className={`${isEmbeddedEdit ? 'py-8' : 'py-20'} bg-gradient-to-b from-teal-50 to-white`}
      id={isEmbeddedEdit ? undefined : 'list-business'}
    >
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {isEmbeddedEdit && (
          <div className="mb-6 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 p-4 flex gap-3">
            <Info className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-teal-900">
              {user?.type === 'admin'
                ? language === 'en'
                  ? 'Admin editor: changes save live on the public listing (including Adults / Children pricing tiers and photos).'
                  : 'Éditeur admin : les modifications sont publiées en direct.'
                : language === 'en'
                  ? 'This form loads your saved listing from the database. Save to update your live deal (title, category, and all fields below).'
                  : 'Ce formulaire charge votre annonce enregistrée. Enregistrer pour mettre à jour la page publique.'}
            </p>
          </div>
        )}
        <div className="text-center mb-10">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center">
            <Store className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 mb-3">
            {isEmbeddedEdit
              ? language === 'en'
                ? 'Edit your listing'
                : language === 'fr'
                  ? 'Modifier votre annonce'
                  : 'Senisim listing'
              : language === 'en'
                ? 'List Your Business for Free'
                : language === 'fr'
                  ? 'Inscrivez votre entreprise gratuitement'
                  : 'Listem Bisnis Blong Yu Fri'}
          </h2>
          <p className="text-gray-500">
            {isEmbeddedEdit
              ? language === 'en'
                ? 'Same fields as creating a new deal — your live listing is pre-filled below.'
                : 'Mêmes champs que pour une nouvelle offre — votre annonce est pré-remplie.'
              : language === 'en'
                ? 'Join 120+ local businesses reaching thousands of tourists'
                : language === 'fr'
                  ? 'Rejoignez plus de 120 entreprises locales atteignant des milliers de touristes'
                  : 'Joinem 120+ lokal bisnis we i rijim plante turis'}
          </p>
        </div>

        {user?.type === 'business' && !isEmbeddedEdit && (
          <div className="mb-6 rounded-xl border border-teal-100 bg-white p-4 text-left text-sm text-gray-700 shadow-sm">
            <p className="font-semibold text-teal-900 mb-1">
              {language === 'en' ? 'Simple flow' : language === 'fr' ? 'Parcours simple' : 'Wanwan wok'}
            </p>
            <p className="text-gray-600 leading-relaxed">
              {language === 'en'
                ? 'First complete your business profile (Dashboard → Business Profile) with phone, WhatsApp, and address. Here you add each deal separately — we copy those saved details into this form. Scroll down to optionally upload credentials (insurance, permits). Use a clear title for this deal (not only your company name).'
                : language === 'fr'
                  ? 'Complétez dabord votre profil entreprise (tableau de bord → Profil entreprise). Ici vous ajoutez chaque offre. Faites défiler pour télécharger des accréditations (facultatif). Donnez un titre clair pour cette offre.'
                  : 'Fes komplitim profil bisnis long dashboard. Hia yu adem evri dil. Scroll daon blong upload kredensel (optional). Yusum klia titel blong dil ia.'}
            </p>
          </div>
        )}

        {!user && !isEmbeddedEdit && (
          <div className="mb-6 p-5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Store className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">
              {language === 'en' ? 'Create a Business Account' : language === 'fr' ? 'Créer un compte entreprise' : 'Mekem Bisnis Akaont'}
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              {language === 'en'
                ? 'Sign up as a business owner to list your business and manage your offers.'
                : language === 'fr'
                ? 'Inscrivez-vous en tant que propriétaire d\'entreprise pour gérer vos offres.'
                : 'Saen ap olsem bisnis ona blong listem bisnis blong yu.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                onClick={() => { setAuthMode('signup-business'); setShowAuth(true); }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-200"
              >
                {language === 'en' ? 'Sign Up as Business' : language === 'fr' ? 'S\'inscrire en tant qu\'entreprise' : 'Saen Ap olsem Bisnis'}
              </button>
              <button
                onClick={() => { setAuthMode('signin'); setShowAuth(true); }}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                {language === 'en' ? 'Already have an account? Sign In' : language === 'fr' ? 'Déjà un compte? Se connecter' : 'Gat akaont? Saen In'}
              </button>
            </div>
          </div>
        )}

        {/* Tourist user - redirect to business signup */}
        {user && user.type === 'tourist' && !isEmbeddedEdit && (
          <div className="mb-6 p-5 rounded-xl bg-amber-50 border border-amber-200 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-bold text-amber-800">
                {language === 'en' ? 'Business Account Required' : language === 'fr' ? 'Compte entreprise requis' : 'Bisnis Akaont i Nidim'}
              </h3>
            </div>
            <p className="text-sm text-amber-700 mb-3">
              {language === 'en'
                ? 'You\'re currently signed in as a tourist. To list a business, you\'ll need a business account.'
                : language === 'fr'
                ? 'Vous êtes connecté en tant que touriste. Pour inscrire une entreprise, vous avez besoin d\'un compte entreprise.'
                : 'Yu saen in olsem turis. Blong listem bisnis, yu nidim bisnis akaont.'}
            </p>
            <p className="text-xs text-amber-600">
              {language === 'en'
                ? 'Please sign out and create a new business account, or contact support for assistance.'
                : 'Veuillez vous déconnecter et créer un nouveau compte entreprise.'}
            </p>
          </div>
        )}


        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'en'
                  ? 'Deal / listing title'
                  : language === 'fr'
                    ? 'Titre de l’offre'
                    : 'Titel blong dil'}
                <span className="text-red-600 font-semibold" aria-hidden> *</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  setFieldErrors((fe) => ({ ...fe, title: undefined }));
                  setForm((prev) => ({ ...prev, name: e.target.value }));
                }}
                aria-invalid={!!fieldErrors.title}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  fieldErrors.title ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-200'
                }`}
                placeholder={
                  language === 'en'
                    ? 'e.g. Reef Explorer Semi-Sub Tour – Port Vila'
                    : language === 'fr'
                      ? 'ex. Visite semi-submersible – Port-Vila'
                      : 'ex. Semi-sub tua – Port Vila'
                }
              />
              {fieldErrors.title && (
                <p className="text-sm text-red-600 mt-1.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  {fieldErrors.title}
                </p>
              )}
              <p className="text-[11px] text-gray-500 mt-1">
                {language === 'en'
                  ? 'This is the name tourists see for this deal. Save to update your live listing.'
                  : language === 'fr'
                    ? 'C’est le nom visible pour cette offre. Enregistrez pour mettre à jour.'
                    : 'Nem ia turis bae luk long dil ia. Sevem blong apdetem.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'en' ? 'Category' : 'Catégorie'}
                <span className="text-red-600 font-semibold" aria-hidden> *</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => {
                  setFieldErrors((fe) => ({ ...fe, pricing: undefined }));
                  setForm((prev) => ({ ...prev, category: e.target.value }));
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {CATEGORY_SELECT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {categoryLabelForKey(key, language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'en' ? 'Description' : 'Description'}
              <span className="text-red-600 font-semibold" aria-hidden> *</span>
            </label>
            <div className={fieldErrors.description ? 'rounded-xl ring-2 ring-red-100 border border-red-200 overflow-hidden' : ''}>
              <LazyBusinessDescriptionEditor
                value={form.description}
                onChange={(html) => {
                  setFieldErrors((fe) => ({ ...fe, description: undefined }));
                  setForm((prev) => ({ ...prev, description: html }));
                }}
                placeholder={
                  language === 'en'
                    ? 'Describe your business and what makes it special...'
                    : 'Décrivez votre entreprise...'
                }
              />
            </div>
            <div className="flex items-center justify-end mt-1">
              <span
                className={`text-[11px] font-medium ${
                  plainTextFromHtml(form.description).length > BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT
                    ? 'text-orange-500'
                    : 'text-gray-400'
                }`}
              >
                {plainTextFromHtml(form.description).length}/{BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX}
                {language === 'en' ? ' (plain text)' : ' (texte brut)'}
              </span>
            </div>
            {fieldErrors.description && (
              <p className="text-sm text-red-600 mt-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                {fieldErrors.description}
              </p>
            )}
          </div>
          {/* ─── Pricing & Discount (VT) ─── */}
          <div
            className={`p-5 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border ${
              fieldErrors.pricing
                ? 'border-red-300 ring-1 ring-red-200'
                : 'border-teal-100'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Tag className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-bold text-teal-800">
                {language === 'en' ? 'Pricing & Discount (VT)' : language === 'fr' ? 'Prix et remise (VT)' : 'Praes mo Diskaon (VT)'}
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-medium">
                {language === 'en' ? 'Discount Optional' : 'Remise optionnelle'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {categoryUsesTieredPricing(form.category)
                ? language === 'en'
                  ? 'Enter a single per-person price in Vatu (VT) (used if you add no tiers). Discount is optional — businesses offering discounts get featured priority.'
                  : language === 'fr'
                    ? "Entrez un prix unique par personne en Vatu (VT) (utilisé si vous n’ajoutez pas de paliers). La remise est optionnelle — les entreprises offrant des remises sont prioritaires."
                    : 'Putum wan praes long Vatu (VT) (hem i wok sapos yu no putum tiers). Diskaon i opsonal — bisnis we i gat diskaon i go fas.'
                : language === 'en'
                  ? 'Enter your price in Vatu (VT). Discount is optional — businesses offering discounts get featured priority.'
                  : language === 'fr'
                    ? 'Entrez votre prix en Vatu (VT). La remise est optionnelle — les entreprises offrant des remises sont prioritaires.'
                    : 'Putum praes long Vatu (VT). Diskaon i opsonal — bisnis we i gat diskaon i go fas.'}
            </p>


            {/* Price + Discount + New Price row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              {/* Original Price */}
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
                    value={form.originalPrice}
                    onChange={(e) => {
                      setFieldErrors((fe) => ({ ...fe, pricing: undefined }));
                      setForm((prev) => ({ ...prev, originalPrice: e.target.value }));
                    }}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    placeholder="5000"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {categoryUsesPerUnitPricing(form.category)
                    ? perUnitPriceHint(
                        form.category,
                        language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en',
                      )
                    : language === 'en'
                      ? 'Regular price per person in Vatu'
                      : language === 'fr'
                        ? 'Prix normal par personne en Vatu'
                        : 'Stanad praes long wan man (VT)'}
                </p>
              </div>

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
                    value={form.discountPercent}
                    onChange={(e) => {
                      setFieldErrors((fe) => ({ ...fe, pricing: undefined }));
                      setForm((prev) => ({ ...prev, discountPercent: e.target.value }));
                    }}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    placeholder="20"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {language === 'en' ? 'Percentage off for pass holders' : 'Pourcentage de réduction'}
                </p>
              </div>

              {/* Auto-Calculated New Price */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {language === 'en' ? 'New Price (auto)' : language === 'fr' ? 'Nouveau prix (auto)' : 'Niu Praes (oto)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">VT</span>
                  <input
                    type="text"
                    value={
                      displayAutoDealPrice
                        ? formatVT(parseFloat(displayAutoDealPrice)).replace('VT ', '')
                        : '—'
                    }
                    readOnly
                    className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm cursor-not-allowed ${
                      displayAutoDealPrice
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                        : 'bg-gray-50 border-gray-200 text-gray-400'
                    }`}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {language === 'en' ? 'Calculated from price & discount' : 'Calculé automatiquement'}
                </p>
              </div>
            </div>

            {/* ─── Live Price Breakdown Preview ─── */}
            {displayAutoDealPrice && form.originalPrice && (
              <div className="mt-4 p-4 rounded-xl bg-white border border-teal-200 shadow-sm">
                <div className="flex items-center gap-1.5 mb-3">
                  <Tag className="w-3.5 h-3.5 text-teal-600" />
                  <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                    {language === 'en' ? 'Customer will see' : language === 'fr' ? 'Le client verra' : 'Kastoma bae luk'}
                  </span>
                </div>

                {/* Visual price flow: Original → Discount → New Price */}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  {/* Original price (struck through) */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 mb-0.5">
                      {language === 'en' ? 'Was' : 'Était'}
                    </span>
                    <span className="text-lg text-gray-400 line-through font-medium">
                      {formatVT(parseFloat(form.originalPrice))}
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />

                  {/* Discount badge */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 mb-0.5">
                      {language === 'en' ? 'Discount' : 'Remise'}
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-orange-100 text-orange-700 text-sm font-bold">
                      {calculatedDiscountLabel}
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />

                  {/* New price (highlighted) */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-emerald-500 mb-0.5 font-medium">
                      {language === 'en' ? 'Now' : 'Maintenant'}
                    </span>
                    <span className="text-2xl font-extrabold text-emerald-600">
                      {formatVT(parseFloat(displayAutoDealPrice))}
                    </span>
                  </div>
                </div>

                {/* Savings summary */}
                <div className="flex items-center justify-between pt-3 border-t border-teal-100">
                  <span className="text-xs text-gray-500">
                    {language === 'en' ? 'Customer saves' : language === 'fr' ? 'Le client économise' : 'Kastoma i sevem'}
                  </span>
                  <span className="text-sm font-bold text-emerald-600">
                    {formatVT(parseFloat(form.originalPrice) - parseFloat(displayAutoDealPrice))}{' '}
                    <span className="text-xs font-normal text-gray-400">
                      {categoryUsesPerUnitPricing(form.category)
                        ? unitLabelForCategory(
                            form.category,
                            language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en',
                          ).singular
                        : language === 'en'
                          ? 'per person'
                          : language === 'fr'
                            ? 'par personne'
                            : 'long wan man'}
                    </span>
                  </span>
                </div>
              </div>
            )}
            {fieldErrors.pricing && (
              <p className="text-sm text-red-600 mt-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                {fieldErrors.pricing}
              </p>
            )}
          </div>

          {categoryUsesTieredPricing(form.category) && (
            <div
              className={
                fieldErrors.pricing
                  ? 'rounded-xl border border-red-300 ring-1 ring-red-200 p-1'
                  : ''
              }
            >
              <PricingTiersEditor
                tiers={pricingTiers}
                onChange={(next) => {
                  setFieldErrors((fe) => ({ ...fe, pricing: undefined }));
                  setPricingTiers(next);
                }}
                language={language}
                discountPercent={tierDiscountPercent}
              />
              {fieldErrors.pricing && (
                <p className="text-sm text-red-600 mt-2 px-1 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  {fieldErrors.pricing}
                </p>
              )}
            </div>
          )}

          {/* ─── Discount Validity Date Range ─── */}
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
                  {language === 'en' ? 'Discount Valid From *' : language === 'fr' ? 'Valide à partir du *' : 'Stat Dei *'}
                </label>
                <input
                  type="date"
                  value={form.discountValidFrom}
                  min={discountValidFromMin}
                  onChange={(e) => setForm((prev) => ({ ...prev, discountValidFrom: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {language === 'en' ? 'Listing Duration' : language === 'fr' ? 'Durée de l\'inscription' : 'Hamas Taem'}
                </label>
                <select
                  value={form.listingDuration}
                  onChange={(e) => setForm((prev) => ({ ...prev, listingDuration: e.target.value }))}
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
                  {language === 'en' ? 'Discount Valid Until' : language === 'fr' ? 'Valide jusqu\'au' : 'En Dei'}
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
            {form.discountValidFrom && (
              <div className="mt-3 p-3 rounded-lg bg-white border border-blue-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-semibold text-gray-700">
                    {new Date(form.discountValidFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {hoursFieldCopy.label}
              </label>
              <input
                type="text"
                value={form.hours}
                onChange={(e) => setForm((prev) => ({ ...prev, hours: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder={hoursFieldCopy.placeholder}
              />
              <p className="text-[11px] text-gray-400 mt-1">{hoursFieldCopy.hint}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'en' ? 'Address' : 'Adresse'}
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Port Vila, Vanuatu"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'en' ? 'Phone' : 'Téléphone'}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="+678 12345"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* ─── WhatsApp Number ─── */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-600">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <h3 className="text-sm font-bold text-green-800">
                {language === 'en' ? 'WhatsApp Number (Optional)' : language === 'fr' ? 'Numéro WhatsApp (Optionnel)' : 'WhatsApp Namba (Opsonal)'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {language === 'en'
                ? 'Add your WhatsApp number so tourists can message you directly. Include country code (e.g. +678).'
                : language === 'fr'
                ? 'Ajoutez votre numéro WhatsApp pour que les touristes puissent vous contacter directement.'
                : 'Addem WhatsApp namba blong yu blong turis i save mesej yu daerekli.'}
            </p>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <input
                type="tel"
                value={form.whatsappNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, whatsappNumber: e.target.value }))}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-green-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                placeholder="+678 5551234"
              />
            </div>
            <div className="flex items-start gap-1.5 mt-2">
              <Info className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-green-600">
                {language === 'en'
                  ? 'Tourists will be able to open WhatsApp and message you directly from your listing. Your number will be displayed publicly.'
                  : language === 'fr'
                  ? 'Les touristes pourront ouvrir WhatsApp et vous envoyer un message directement depuis votre fiche.'
                  : 'Turis bae save openem WhatsApp mo sendem mesej long yu daerekli.'}
              </p>
            </div>
          </div>


          {/* ─── Map Location & Website ─── */}
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
                : 'Indiquez votre emplacement sur la carte et votre site web pour que les touristes vous trouvent facilement.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <LocationMapPicker
                mapUrl={form.mapUrl}
                onMapUrlChange={(v) => setForm((prev) => ({ ...prev, mapUrl: v }))}
                language={language}
              />
              <WebsiteUrlInput
                website={form.website}
                onWebsiteChange={(v) => setForm((prev) => ({ ...prev, website: v }))}
                language={language}
                id="listing-website"
              />
            </div>
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'en' ? 'Business photos' : 'Photos de l\'entreprise'}
              <span className="text-red-600 font-semibold" aria-hidden> *</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              {language === 'en'
                ? 'At least one photo is required. Drag to reorder or use Set cover — the first photo is your listing cover.'
                : 'Au moins une photo est requise. Glissez pour réordonner ou « Définir couverture » — la première est l’image principale.'}
            </p>
            <div className={fieldErrors.photos ? 'rounded-xl ring-2 ring-red-100 border border-red-200 p-1' : ''}>
              <PhotoUploader
                photos={photos}
                onPhotosChange={(next) => {
                  setFieldErrors((fe) => ({ ...fe, photos: undefined }));
                  photosDirtyRef.current = true;
                  setPhotos(next);
                }}
                maxPhotos={5}
                userId={user?.id || ''}
              />
            </div>
            {fieldErrors.photos && (
              <p className="text-sm text-red-600 mt-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                {fieldErrors.photos}
              </p>
            )}
          </div>

          {credentialsProfileId && user?.id && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {language === 'en'
                  ? 'Optional — company credentials'
                  : language === 'fr'
                    ? 'Facultatif — accréditations'
                    : 'Optional — kredensel'}
              </p>
              <BusinessCredentialsSettings profileBusinessId={credentialsProfileId} />
            </div>
          )}

          {!credentialsProfileId && user?.type === 'business' && !isEmbeddedEdit && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900">
              {language === 'en'
                ? 'Save your business profile in the dashboard first (phone, address, logo). Then you can upload optional credentials (insurance, permits) on this form or under Business Profile.'
                : language === 'fr'
                  ? 'Enregistrez dabord votre profil entreprise dans le tableau de bord, puis vous pourrez télécharger des accréditations ici.'
                  : 'Save profail bisnis long dashboard first, bae yu save upload kredensel.'}
            </div>
          )}

          {!isEmbeddedEdit && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="listing-partner-terms"
                  checked={agreedPartnerTerms}
                  onChange={(e) => setAgreedPartnerTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700 leading-snug">
                  {language === 'en' ? (
                    <>
                      I have read and agree to the{' '}
                      <Link
                        to="/legal/business-partner"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 font-semibold hover:underline"
                      >
                        Business partner &amp; listing terms
                      </Link>
                      , including maintaining appropriate insurance and permits, conducting business honestly, and honouring StikmNek passes at the agreed discounted rates.
                    </>
                  ) : language === 'fr' ? (
                    <>
                      J’ai lu et j’accepte les{' '}
                      <Link
                        to="/legal/business-partner"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 font-semibold hover:underline"
                      >
                        conditions Partenaires commerciaux et d’inscription
                      </Link>
                      , y compris l’assurance et les autorisations appropriées, une activité honnête, et le respect des pass StikmNek aux tarifs réduits convenus.
                    </>
                  ) : (
                    <>
                      Mi bin ridim mo mi agri long{' '}
                      <Link
                        to="/legal/business-partner"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 font-semibold hover:underline"
                      >
                        Business partner &amp; listing terms
                      </Link>
                      : insuren mo pemit we i stret, wok honest mo professional, mo honor ol StikmNek pas long diskon we i stap long listing.
                    </>
                  )}
                </span>
              </label>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || (!isEmbeddedEdit && !agreedPartnerTerms)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {language === 'en' ? 'Submitting...' : 'Soumission en cours...'}
              </>
            ) : (
              <>
                <Store className="w-5 h-5" />
                {isEmbeddedEdit
                  ? language === 'en'
                    ? 'Submit changes for review'
                    : language === 'fr'
                      ? 'Envoyer les modifications'
                      : 'Submitem senis'
                  : language === 'en'
                    ? 'Submit for Review (Free)'
                    : 'Soumettre pour examen (Gratuit)'}
              </>
            )}
          </button>

          <p className="text-xs text-center text-gray-400">
            {isEmbeddedEdit
              ? language === 'en'
                ? 'Edits are reviewed before they appear on the public site.'
                : 'Les modifications sont vérifiées avant publication.'
              : language === 'en'
                ? 'Your listing will be reviewed within 24 hours. Listing is completely free.'
                : 'Votre inscription sera examinée dans les 24 heures. L\'inscription est entièrement gratuite.'}
          </p>
        </form>
      </div>
    </section>
  );
};

export default BusinessListingForm;

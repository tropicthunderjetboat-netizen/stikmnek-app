import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getEdgeAuthHeaders, supabase, SUPABASE_URL } from '@/lib/supabase';
import { invokeEdgeFunctionWithRetry, RPC_INSERT_PENDING_TIMEOUT_MS } from '@/lib/edgeInvoke';
import { toast } from 'sonner';
import { categories, type Business, type Category } from '@/data/businesses';
import {
  Store, Edit3, BarChart3, MessageSquare, Image, Power,
  Save, X, ChevronRight, TrendingUp, Users, DollarSign,
  Eye, Clock, Star, Send, Upload, Plus, Loader2,
  CheckCircle, XCircle, AlertCircle, AlertTriangle, FileText, ArrowUpRight,
  ArrowDownRight, Calendar, MapPin, Phone, Mail, Tag, Trash2,
  RefreshCw, ShieldCheck, History, ArrowRight, Info, ClipboardList,
  BellRing, ChevronDown, LayoutDashboard, Menu, ArrowLeft,
  Sparkles, Settings, LogOut, Zap, Wifi, Building2, Home
} from 'lucide-react';
import EmailNotificationCenter from './EmailNotificationCenter';
import PhotoUploader, { UploadedPhoto } from './PhotoUploader';
import MySubmissions from './MySubmissions';
import BusinessProfileSettings from './BusinessProfileSettings';
import BusinessCredentialsSettings from './BusinessCredentialsSettings';
import PricingDiscountFields, { DURATION_OPTIONS, addDays, todayStr } from './PricingDiscountFields';
import BusinessHomeScreen from './BusinessHomeScreen';
import BusinessSimpleHub from './BusinessSimpleHub';
import DealExpiryWarningBanner from './DealExpiryWarningBanner';
import PricingTiersEditor from './PricingTiersEditor';
import {
  categoryUsesTieredPricing,
  validatePricingTiersForSubmit,
  pricingTiersFromDb,
  pricingTiersForEditor,
  defaultPricingTiersForNewListing,
  type PricingTierInput,
} from '@/lib/pricingTiers';
import { normalizeWebsiteForStorage } from '@/lib/urlHelpers';
import {
  plainTextFromHtml,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT,
} from '@/lib/businessDescriptionHtml';
import {
  validateListingSubmissionOnboarding,
  localizedListingSubmitValidationFeedback,
} from '@/lib/businessOnboardingValidation';
import { photoRowsToUploadedPhotos } from '@/lib/fetchApprovedPhotosForOffering';
import {
  mergeResubmitListingPrefill,
  fetchResubmitProfileAndOffering,
  fetchPendingSubmissionGalleryPhotos,
} from '@/lib/resubmitPrefill';
import LazyBusinessDescriptionEditor from './LazyBusinessDescriptionEditor';
import OnboardingSteps, { type OnboardingStepNumber } from './OnboardingSteps';
import {
  businessHoursFromProfileRow,
  listingHoursFromRow,
  effectiveProfileBusinessId,
  OFFERING_LISTING_COLUMNS,
  BUSINESS_PROFILE_EMBED_COLS,
  listingCategoryFromOffering,
  listingDisplayTitleFromOfferingRow,
} from '@/lib/businessOfferingMap';
import { listingHoursFieldCopy } from '@/lib/listingHoursLabels';

const BusinessListingForm = React.lazy(() => import('./BusinessListingForm'));
const DashboardAnalytics = React.lazy(() => import('./DashboardAnalytics'));

const DASHBOARD_LISTING_SUBMIT_DEADLINE_MS = 150_000;

interface ReviewResponse {
  id: string;
  review_id: string;
  response: string;
  created_at: string;
}

interface GalleryPhoto {
  id: string;
  business_id: string;
  url: string;
  file_path: string;
  uploaded_by: string;
  is_main: boolean;
  created_at: string;
}

interface PendingEdit {
  id: string;
  business_id: string;
  owner_id: string;
  changes: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string;
  submitted_at: string;
  reviewed_at: string | null;
}

// Unified business item that can be from either table
interface UnifiedBusiness {
  id: string;
  name: string;
  category: string;
  description: string;
  descriptionFr: string;
  descriptionBi: string;
  image: string;
  rating: number;
  reviewCount: number;
  discount: string;
  originalPrice: number;
  dealPrice: number;
  location: string;
  lat: number;
  lng: number;
  hours: string;
  phone: string;
  tags: string[];
  featured: boolean;
  ownerId: string | null;
  // Unified status tracking
  _source: 'approved' | 'pending';
  _status: 'approved' | 'pending' | 'rejected';
  _pendingId?: string; // ID in pending_businesses table
  _adminNotes?: string;
  _reviewedAt?: string;
  _createdAt?: string;
  /** `public.businesses.id` when this row is a `business_offerings` listing */
  _profileBusinessId?: string;
  /** Master profile trading name (from `businesses.name`) when row is an offering */
  _profileDisplayName?: string;
  /** Master profile logo (`businesses.logo_url`) when row is an offering */
  _profileLogoUrl?: string;
  /** From `business_offerings.pricing_tiers` (or profile fallback); drives edit-listing tier editor. */
  pricingTiers?: unknown;
  /** Offering or profile map link (prefill full listing form). */
  mapUrl?: string | null;
  website?: string | null;
  /** Public / contact email for listing form prefill. */
  email?: string;
  whatsappNumber?: string | null;
  discountValidFrom?: string | null;
  discountValidUntil?: string | null;
}

function mapOfferingRowToUnified(
  o: Record<string, unknown>,
  b: Record<string, unknown> | null | undefined,
): UnifiedBusiness {
  const profile = b || {};
  const pid =
    profile.id != null ? String(profile.id) : String(o.business_id ?? o.id ?? '');
  return {
    id: String(o.id),
    _profileBusinessId: pid,
    _profileDisplayName: String(profile.name ?? '').trim() || undefined,
    _profileLogoUrl:
      String((profile.logo_url as string) || (profile.image as string) || '').trim() || undefined,
    name: listingDisplayTitleFromOfferingRow(o.title, profile.name),
    category: listingCategoryFromOffering(o, profile.category),
    description: String(o.description ?? ''),
    descriptionFr: String((o.description_fr ?? o.description) ?? ''),
    descriptionBi: String((o.description_bi ?? o.description) ?? ''),
    image: String(o.image ?? ''),
    rating: Number(profile.rating) || 0,
    reviewCount: Number(profile.review_count) || 0,
    discount: String(o.discount ?? ''),
    originalPrice: Number(o.original_price) || 0,
    dealPrice: Number(o.deal_price) || 0,
    location: String(profile.location ?? ''),
    lat: Number(profile.lat) || 0,
    lng: Number(profile.lng) || 0,
    hours: listingHoursFromRow(o, profile as Record<string, unknown>),
    phone: String(profile.phone ?? ''),
    tags: Array.isArray(o.tags) ? (o.tags as string[]) : Array.isArray(profile.tags) ? (profile.tags as string[]) : [],
    featured: Boolean(o.featured) || Boolean(profile.featured),
    ownerId: (profile.owner_id as string) || null,
    pricingTiers: o.pricing_tiers ?? null,
    mapUrl: String(o.map_url ?? profile.map_url ?? '').trim() || null,
    website: String(o.website ?? profile.website ?? '').trim() || null,
    email: String(
      profile.contact_email ?? profile.email ?? profile.business_email ?? '',
    ).trim(),
    whatsappNumber:
      String(o.whatsapp_number ?? profile.whatsapp_number ?? '').trim() || null,
    discountValidFrom:
      typeof o.discount_valid_from === 'string' && o.discount_valid_from.trim()
        ? String(o.discount_valid_from).split('T')[0]
        : null,
    discountValidUntil:
      typeof o.discount_valid_until === 'string' && o.discount_valid_until.trim()
        ? String(o.discount_valid_until).split('T')[0]
        : null,
    _source: 'approved',
    _status: 'approved',
    _createdAt: (o.created_at as string) || (profile.created_at as string),
  };
}

function mapProfileRowToUnified(b: Record<string, unknown>): UnifiedBusiness {
  return {
    id: String(b.id),
    _profileBusinessId: String(b.id),
    name: String(b.name ?? ''),
    category: String(b.category || 'dining'),
    description: String(b.description ?? ''),
    descriptionFr: String((b.description_fr ?? b.description) ?? ''),
    descriptionBi: String((b.description_bi ?? b.description) ?? ''),
              image: String((b.logo_url as string) || (b.image as string) || (b.image_url as string) || ''),
    rating: Number(b.rating) || 0,
    reviewCount: Number(b.review_count) || 0,
    discount: String((b.discount as string) || (b.deal as string) || ''),
    originalPrice: Number(b.original_price) || 0,
    dealPrice: Number(b.deal_price) || Number(b.discounted_price) || 0,
    location: String(b.location ?? ''),
    lat: Number(b.lat) || 0,
    lng: Number(b.lng) || 0,
    hours: businessHoursFromProfileRow(b),
    phone: String(b.phone ?? ''),
    tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
    featured: Boolean(b.featured),
    ownerId: (b.owner_id as string) || null,
    pricingTiers: b.pricing_tiers ?? null,
    mapUrl: String(b.map_url ?? '').trim() || null,
    website: String(b.website ?? '').trim() || null,
    email: String(b.contact_email ?? b.email ?? b.business_email ?? '').trim(),
    whatsappNumber: String(b.whatsapp_number ?? '').trim() || null,
    discountValidFrom:
      typeof b.discount_valid_from === 'string' && String(b.discount_valid_from).trim()
        ? String(b.discount_valid_from).split('T')[0]
        : null,
    discountValidUntil:
      typeof b.discount_valid_until === 'string' && String(b.discount_valid_until).trim()
        ? String(b.discount_valid_until).split('T')[0]
        : null,
    _source: 'approved',
    _status: 'approved',
    _createdAt: b.created_at as string | undefined,
  };
}

function unifiedToListingBusiness(u: UnifiedBusiness): Business {
  const catRaw = String(u.category || '').trim().toLowerCase();
  const cat = categories.some((c) => c.key === catRaw) ? (catRaw as Category) : 'dining';
  return {
    id: u.id,
    profileBusinessId: u._profileBusinessId,
    name: u.name,
    category: cat,
    description: u.description,
    descriptionFr: u.descriptionFr,
    descriptionBi: u.descriptionBi,
    image: u.image,
    rating: u.rating,
    reviewCount: u.reviewCount,
    discount: u.discount,
    originalPrice: u.originalPrice,
    dealPrice: u.dealPrice,
    location: u.location,
    lat: u.lat,
    lng: u.lng,
    mapUrl: u.mapUrl ?? null,
    map_url: u.mapUrl ?? null,
    website: u.website ?? null,
    hours: u.hours,
    phone: u.phone,
    contactEmail: u.email || null,
    whatsappNumber: u.whatsappNumber ?? null,
    whatsapp_number: u.whatsappNumber ?? null,
    tags: [...u.tags],
    featured: u.featured,
    ownerId: u.ownerId ?? null,
    pricingTiers: u.pricingTiers ?? null,
    discountValidFrom: u.discountValidFrom ?? null,
    discountValidUntil: u.discountValidUntil ?? null,
  };
}

function firstNonEmptyStr(...parts: (string | null | undefined)[]): string {
  for (const p of parts) {
    const s = String(p ?? '').trim();
    if (s) return s;
  }
  return '';
}

/** Prefer unified dashboard row for deal-specific fields; `dbBusinesses` can lag or omit title after fetch. */
function mergeListingBusinessForEdit(selected: UnifiedBusiness, fromDb: Business | undefined): Business {
  const uBiz = unifiedToListingBusiness(selected);
  if (!fromDb) return uBiz;
  return {
    ...fromDb,
    name: listingDisplayTitleFromOfferingRow(uBiz.name, fromDb.profileName ?? fromDb.name),
    category: uBiz.category,
    description: uBiz.description || fromDb.description,
    descriptionFr: uBiz.descriptionFr || fromDb.descriptionFr,
    descriptionBi: uBiz.descriptionBi || fromDb.descriptionBi,
    originalPrice: uBiz.originalPrice,
    dealPrice: uBiz.dealPrice,
    discount: uBiz.discount,
    pricingTiers: uBiz.pricingTiers ?? fromDb.pricingTiers,
    image: (fromDb.image && String(fromDb.image).trim()) ? fromDb.image : uBiz.image,
    tags: uBiz.tags?.length ? uBiz.tags : fromDb.tags,
    discountValidFrom: uBiz.discountValidFrom ?? fromDb.discountValidFrom ?? null,
    discountValidUntil: uBiz.discountValidUntil ?? fromDb.discountValidUntil ?? null,
    // Profile / contact: unified row + live fetch use `businesses`; `fromDb` can be a stale offering-shaped row with blanks.
    location: firstNonEmptyStr(uBiz.location, fromDb.location),
    lat: Number(uBiz.lat) || Number(fromDb.lat) || 0,
    lng: Number(uBiz.lng) || Number(fromDb.lng) || 0,
    hours: uBiz.hours,
    phone: firstNonEmptyStr(uBiz.phone, fromDb.phone),
    contactEmail:
      firstNonEmptyStr(uBiz.contactEmail ?? undefined, fromDb.contactEmail ?? undefined) || null,
    mapUrl: firstNonEmptyStr(uBiz.mapUrl ?? undefined, fromDb.mapUrl ?? undefined) || null,
    map_url: firstNonEmptyStr(uBiz.map_url ?? undefined, fromDb.map_url ?? undefined) || null,
    website: firstNonEmptyStr(uBiz.website ?? undefined, fromDb.website ?? undefined) || null,
    whatsappNumber:
      firstNonEmptyStr(uBiz.whatsappNumber ?? undefined, fromDb.whatsappNumber ?? undefined) || null,
    whatsapp_number:
      firstNonEmptyStr(uBiz.whatsapp_number ?? undefined, fromDb.whatsapp_number ?? undefined) || null,
  };
}

async function buildApprovedUnifiedFromProfiles(
  approvedProfiles: Record<string, unknown>[],
): Promise<UnifiedBusiness[]> {
  const profileIds = approvedProfiles.map((p) => p.id).filter(Boolean).map(String);
  type OfferingRow = { business_id?: unknown; businesses?: Record<string, unknown> };
  let offeringRows: OfferingRow[] = [];
  if (profileIds.length > 0) {
    const { data } = await supabase
      .from('business_offerings')
      .select(`${OFFERING_LISTING_COLUMNS}, businesses(${BUSINESS_PROFILE_EMBED_COLS})`)
      .in('business_id', profileIds);
    offeringRows = (data as OfferingRow[]) || [];
  }
  const seenProfiles = new Set(offeringRows.map((r) => String(r.business_id)));
  const out: UnifiedBusiness[] = [];
  for (const row of offeringRows) {
    out.push(mapOfferingRowToUnified(row, row.businesses));
  }
  for (const b of approvedProfiles) {
    if (!seenProfiles.has(String(b.id))) {
      out.push(mapProfileRowToUnified(b));
    }
  }
  return out;
}

type DashboardTab =
  | 'overview'
  | 'profile'
  | 'credentials'
  | 'submissions'
  | 'edit'
  | 'analytics'
  | 'reviews'
  | 'photos'
  | 'submit'
  | 'emails';

const BusinessOwnerDashboard: React.FC = () => {
  const {
    user,
    userProfile,
    language,
    dbBusinesses,
    dbReviews,
    setCurrentView,
    setShowAuth,
    setAuthMode,
    signOut,
    refreshBusinesses,
    businessOwnerHasBusinessRow,
    businessOwnerNeedsFirstListing,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const autoOpenedSubmitRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const selectedBusinessIdRef = useRef('');
  useEffect(() => {
    selectedBusinessIdRef.current = selectedBusinessId;
  }, [selectedBusinessId]);
  const [reviewResponses, setReviewResponses] = useState<ReviewResponse[]>([]);
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [pendingBusinesses, setPendingBusinesses] = useState<any[]>([]);
  const [unseenSubmissionChanges, setUnseenSubmissionChanges] = useState(0);
  const [businessSelectorOpen, setBusinessSelectorOpen] = useState(false);
  // ═══ UNIFIED OWNER DATA STATE ═══
  const [ownerDataLoading, setOwnerDataLoading] = useState(true);
  const [approvedBusinesses, setApprovedBusinesses] = useState<any[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [unifiedBusinesses, setUnifiedBusinesses] = useState<UnifiedBusiness[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const initialLoadDone = useRef(false);

  // Listen for custom tab-switch events
  // Resubmit mode: when owner edits a rejected submission
  const [resubmitSubmission, setResubmitSubmission] = useState<any | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent).detail;
      const tab = typeof payload === 'string' ? payload : payload?.tab ?? payload;
      if (tab === 'profile' && payload?.focus === 'credentials') {
        setActiveTab('credentials');
        setResubmitSubmission(null);
      } else if (
        [
          'submit',
          'submissions',
          'overview',
          'profile',
          'credentials',
          'edit',
          'analytics',
          'reviews',
          'photos',
          'emails',
        ].includes(tab)
      ) {
        setActiveTab(tab);
        if (tab === 'submit' && payload?.submission) {
          setResubmitSubmission(payload.submission);
        } else {
          setResubmitSubmission(null);
        }
      }
    };
    window.addEventListener('switch-dashboard-tab', handler);
    return () => window.removeEventListener('switch-dashboard-tab', handler);
  }, []);

  // Pending edits state
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [loadingEdits, setLoadingEdits] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editHasChanges, setEditHasChanges] = useState(false);

  // Photo management state
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [newGalleryPhotos, setNewGalleryPhotos] = useState<UploadedPhoto[]>([]);
  const [savingGallery, setSavingGallery] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // Submit form photo state
  const [submitPhotos, setSubmitPhotos] = useState<UploadedPhoto[]>([]);
  const [pricingTiers, setPricingTiers] = useState<PricingTierInput[]>([]);
  const [submitFieldErrors, setSubmitFieldErrors] = useState<{
    title?: string;
    description?: string;
    photos?: string;
    pricing?: string;
  }>({});

  // Edit form state
  const [editForm, setEditForm] = useState({
    description: '', hours: '', phone: '', discount: '', deal_price: 0, original_price: 0,
  });
  const [originalEditForm, setOriginalEditForm] = useState({
    description: '', hours: '', phone: '', discount: '', deal_price: 0, original_price: 0,
  });

  // New business submission form
  const [submitForm, setSubmitForm] = useState({
    name: '', category: 'dining', description: '', discount: '',
    originalPrice: '', discountPercent: '', dealPrice: '',
    location: '', phone: '', email: '', hours: '', image: '',
    whatsappNumber: '',
    mapUrl: '', website: '',
    discountValidFrom: todayStr(),
    listingDuration: '1_month',
  });

  /** Pre-fill resubmit from pending row + linked profile/offering + `business_photos`. */
  const resubmitPrefillGenRef = useRef(0);
  useEffect(() => {
    if (!resubmitSubmission) {
      setPricingTiers([]);
      return;
    }
    if (activeTab !== 'submit') return;

    const sid = String(resubmitSubmission.id ?? '').trim();
    if (!sid) return;

    const gen = ++resubmitPrefillGenRef.current;
    setSubmitFieldErrors({});

    const pending = resubmitSubmission as Record<string, unknown>;
    const sync = mergeResubmitListingPrefill({ pending, profile: null, offering: null });
    setSubmitForm(sync.form);
    setPricingTiers(sync.pricingTiers);
    setSubmitPhotos([]);

    let cancelled = false;
    void (async () => {
      try {
        const [{ profile, offering }, photoRows] = await Promise.all([
          fetchResubmitProfileAndOffering(supabase, pending),
          fetchPendingSubmissionGalleryPhotos(supabase, sid),
        ]);
        if (cancelled || gen !== resubmitPrefillGenRef.current) return;
        const merged = mergeResubmitListingPrefill({ pending, profile, offering });
        setSubmitForm(merged.form);
        setPricingTiers(merged.pricingTiers);
        if (photoRows.length > 0) {
          setSubmitPhotos(photoRowsToUploadedPhotos(photoRows, SUPABASE_URL));
        }
      } catch (e) {
        console.warn('[Dashboard] resubmit prefill enrichment failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resubmitSubmission, activeTab]);

  useEffect(() => {
    if (!categoryUsesTieredPricing(submitForm.category)) {
      setPricingTiers([]);
    } else if (pricingTiers.length === 0) {
      setPricingTiers(defaultPricingTiersForNewListing());
    }
  }, [submitForm.category]);

  const tierDiscountPercent = useMemo(() => {
    const p = parseFloat(submitForm.discountPercent);
    return Number.isFinite(p) && p >= 0 ? p : null;
  }, [submitForm.discountPercent]);

  // ═══ LOAD ALL OWNER DATA (UNIFIED) ═══
  const loadAllOwnerData = useCallback(async (showToast = false) => {
    if (!user) return;
    setOwnerDataLoading(true);
    console.log('[Dashboard] Loading all owner data for userId:', user.id);

    try {
      const headers = await getEdgeAuthHeaders();
      // Strategy 1: Use the new unified endpoint
      const { data, error } = await supabase.functions.invoke('manage-business', {
        headers,
        body: { action: 'get_all_owner_data', userId: user.id },
      });

      if (error) throw error;

      if (data?.success) {
        const approved = data.approved_businesses || [];
        const submissions = data.pending_submissions || [];

        console.log(`[Dashboard] Loaded: ${approved.length} approved, ${submissions.length} submissions`);

        setApprovedBusinesses(approved);
        setAllSubmissions(submissions);
        setPendingBusinesses(submissions);

        const approvedUnified = await buildApprovedUnifiedFromProfiles(approved);
        const unified: UnifiedBusiness[] = [...approvedUnified];

        // Add pending submissions that aren't already approved
        // (When approved, the pending record stays but a new businesses record is created)
        for (const s of submissions) {
          // Only add pending/rejected submissions (approved ones already have a businesses record)
          if (s.status === 'pending' || s.status === 'rejected' || s._status === 'pending' || s._status === 'rejected') {
            unified.push({
              id: `pending-${s.id}`,
              name: s.name,
              category: s.category,
              description: s.description,
              descriptionFr: s.description || '',
              descriptionBi: s.description || '',
              image: s.image || '',
              rating: 0,
              reviewCount: 0,
              discount: s.discount || '',
              originalPrice: Number(s.original_price) || 0,
              dealPrice: Number(s.deal_price) || 0,
              location: s.location || '',
              lat: 0,
              lng: 0,
              hours: s.hours || '',
              phone: s.phone || '',
              tags: [s.category],
              featured: false,
              ownerId: s.owner_id || null,
              _source: 'pending',
              _status: s.status || s._status || 'pending',
              _pendingId: s.id,
              _adminNotes: s.admin_notes,
              _reviewedAt: s.reviewed_at,
              _createdAt: s.created_at,
            });
          }
        }

        setUnifiedBusinesses(unified);

        if (showToast) {
          toast.success(`Loaded ${unified.length} business(es)`);
        }

        // Auto-select first business if none selected
        if (unified.length > 0 && !selectedBusinessIdRef.current) {
          // Prefer approved businesses
          const firstApproved = unified.find(b => b._source === 'approved');
          setSelectedBusinessId(firstApproved?.id || unified[0].id);
        }

        // Keep overview tab as default - BusinessHomeScreen handles pending state with action buttons
        if (!initialLoadDone.current) {
          initialLoadDone.current = true;
        }

        // CRITICAL: Set loading to false when Strategy 1 succeeds
        setOwnerDataLoading(false);
        return;
      }

    } catch (err) {
      console.error('[Dashboard] Unified load failed, falling back:', err);
    }

    // Strategy 2: Fallback - load separately
    try {
      const headers = await getEdgeAuthHeaders();
      const [ownerRes, pendingRes] = await Promise.all([
        supabase.functions.invoke('manage-business', {
          headers,
          body: { action: 'get_owner_businesses', userId: user.id },
        }),
        supabase.functions.invoke('manage-business', {
          headers,
          body: { action: 'get_pending', userId: user.id },
        }),
      ]);

      const approved = ownerRes.data?.businesses || [];
      const submissions = pendingRes.data?.businesses || [];

      setApprovedBusinesses(approved);
      setAllSubmissions(submissions);
      setPendingBusinesses(submissions);

      const approvedUnified = await buildApprovedUnifiedFromProfiles(approved);
      const unified: UnifiedBusiness[] = [...approvedUnified];
      for (const s of submissions) {
        if (s.status === 'pending' || s.status === 'rejected') {
          unified.push({
            id: `pending-${s.id}`, name: s.name, category: s.category,
            description: s.description, descriptionFr: s.description || '',
            descriptionBi: s.description || '', image: s.image || '',
            rating: 0, reviewCount: 0, discount: s.discount || '',
            originalPrice: Number(s.original_price) || 0, dealPrice: Number(s.deal_price) || 0,
            location: s.location || '', lat: 0, lng: 0,
            hours: s.hours || '', phone: s.phone || '', tags: [s.category],
            featured: false, ownerId: s.owner_id || null,
            _source: 'pending', _status: s.status || 'pending', _pendingId: s.id,
            _adminNotes: s.admin_notes, _reviewedAt: s.reviewed_at, _createdAt: s.created_at,
          });
        }
      }
      setUnifiedBusinesses(unified);

      if (unified.length > 0 && !selectedBusinessIdRef.current) {
        const firstApproved = unified.find(b => b._source === 'approved');
        setSelectedBusinessId(firstApproved?.id || unified[0].id);
      }

      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
      }

    } catch (err2) {
      console.error('[Dashboard] Fallback load also failed:', err2);
      // Last resort: try direct DB queries for both businesses and pending_businesses
      try {
        const [approvedRes, pendingRes] = await Promise.all([
          supabase.from('businesses').select('*').eq('owner_id', user.id),
          supabase.from('pending_businesses').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
        ]);
        const approved = approvedRes.data || [];
        const directPending = pendingRes.data || [];
        setApprovedBusinesses(approved);
        setPendingBusinesses(directPending);
        setAllSubmissions(directPending);

        const approvedUnified = await buildApprovedUnifiedFromProfiles(approved);
        const unified: UnifiedBusiness[] = [...approvedUnified];
        for (const s of directPending) {
          if (s.status === 'pending' || s.status === 'rejected') {
            unified.push({
              id: `pending-${s.id}`, name: s.name, category: s.category,
              description: s.description, descriptionFr: '', descriptionBi: '',
              image: s.image || '', rating: 0, reviewCount: 0, discount: s.discount || '',
              originalPrice: Number(s.original_price) || 0, dealPrice: Number(s.deal_price) || 0,
              location: s.location || '', lat: 0, lng: 0,
              hours: s.hours || '', phone: s.phone || '', tags: [s.category],
              featured: false, ownerId: s.owner_id || null,
              _source: 'pending' as const, _status: (s.status || 'pending') as any, _pendingId: s.id,
              _adminNotes: s.admin_notes, _reviewedAt: s.reviewed_at, _createdAt: s.created_at,
            });
          }
        }
        setUnifiedBusinesses(unified);

        if (unified.length > 0 && !selectedBusinessIdRef.current) {
          const firstApproved = unified.find(b => b._source === 'approved');
          setSelectedBusinessId(firstApproved?.id || unified[0].id);
        }
        if (!initialLoadDone.current) initialLoadDone.current = true;
      } catch (e3) {
        console.error('[Dashboard] Direct query failed:', e3);
      }
    } finally {
      setOwnerDataLoading(false);
    }
  }, [user]);

  const handleListingDeleted = useCallback(async () => {
    setSelectedBusinessId('');
    await refreshBusinesses();
    await loadAllOwnerData(false);
    setActiveTab('overview');
  }, [refreshBusinesses, loadAllOwnerData]);

  // Initial load
  useEffect(() => {
    loadAllOwnerData();
  }, [user]);

  // ═══ REALTIME SUBSCRIPTIONS ═══
  useEffect(() => {
    if (!user) return;

    // Subscribe to pending_businesses changes (status updates from admin)
    const pendingChannel = supabase
      .channel('owner-pending-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pending_businesses',
        filter: `owner_id=eq.${user.id}`,
      }, (payload) => {
        console.log('[Dashboard] Realtime: pending_businesses UPDATE', payload.new);
        const updated = payload.new as any;

        // Update allSubmissions
        setAllSubmissions(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
        setPendingBusinesses(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));

        // If approved, reload everything to get the new businesses record
        if (updated.status === 'approved') {
          toast.success(`"${updated.name}" has been approved! Refreshing...`, { duration: 5000 });
          setTimeout(() => loadAllOwnerData(), 1500);
        } else if (updated.status === 'rejected') {
          toast.error(`"${updated.name}" was not approved. Check admin notes.`, { duration: 5000 });
          // Update unified list status
          setUnifiedBusinesses(prev => prev.map(b =>
            b._pendingId === updated.id ? { ...b, _status: 'rejected', _adminNotes: updated.admin_notes } : b
          ));
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pending_businesses',
        filter: `owner_id=eq.${user.id}`,
      }, (payload) => {
        console.log('[Dashboard] Realtime: new pending_businesses INSERT', payload.new);
        // Reload to pick up new submission
        loadAllOwnerData();
      })
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    // Subscribe to businesses table for new approved businesses
    const bizChannel = supabase
      .channel('owner-businesses-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'businesses',
        filter: `owner_id=eq.${user.id}`,
      }, (payload) => {
        console.log('[Dashboard] Realtime: new business approved!', payload.new);
        loadAllOwnerData();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'businesses',
        filter: `owner_id=eq.${user.id}`,
      }, (payload) => {
        console.log('[Dashboard] Realtime: business updated', payload.new);
        const updated = payload.new as any;
        setUnifiedBusinesses(prev => prev.map(b =>
          effectiveProfileBusinessId(b) === updated.id ? {
            ...b,
            name: updated.name || b.name,
            description: updated.description || b.description,
            discount: updated.discount || b.discount,
            originalPrice: Number(updated.original_price) || b.originalPrice,
            dealPrice: Number(updated.deal_price) || b.dealPrice,
            hours: updated.hours || b.hours,
            phone: updated.phone || b.phone,
            image: updated.image || b.image,
            rating: Number(updated.rating) || b.rating,
            reviewCount: updated.review_count || b.reviewCount,
          } : b
        ));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(pendingChannel);
      supabase.removeChannel(bizChannel);
    };
  }, [user]);

  // Derived: approved-only businesses for features that need them
  const approvedOnlyBusinesses = unifiedBusinesses.filter(b => b._source === 'approved');
  const pendingOnlyBusinesses = unifiedBusinesses.filter(b => b._source === 'pending');
  const hasApprovedBusinesses = approvedOnlyBusinesses.length > 0;
  const hasAnyBusinesses = unifiedBusinesses.length > 0;

  /** True when at least one approved row is an offering (`business_offerings`), not only a profile stub. */
  const hasApprovedListingOffering = useMemo(
    () =>
      approvedOnlyBusinesses.some(
        (b) => String(b.id) !== String(b._profileBusinessId ?? ''),
      ),
    [approvedOnlyBusinesses],
  );

  /** First-time path: no live offering yet; only Overview + Submit (matches profile / first listing flow). */
  const showBusinessOnboardingStepper = useMemo(() => {
    if (ownerDataLoading) return false;
    if (hasApprovedListingOffering) return false;
    return activeTab === 'overview' || activeTab === 'submit';
  }, [ownerDataLoading, hasApprovedListingOffering, activeTab]);

  const businessOnboardingStepperState = useMemo(() => {
    const hasRow = businessOwnerHasBusinessRow === true;
    const completedSteps: number[] = [1, ...(hasRow ? [2] : [])];
    const currentStep: OnboardingStepNumber = hasRow ? 3 : 2;
    return { completedSteps, currentStep };
  }, [businessOwnerHasBusinessRow]);

  /** Owners with a profile but no deal yet land on Submit listing (return visits + hub entry). */
  useEffect(() => {
    if (ownerDataLoading) return;
    if (autoOpenedSubmitRef.current) return;
    if (businessOwnerNeedsFirstListing !== true) return;
    autoOpenedSubmitRef.current = true;
    setActiveTab('submit');
    toast.info(
      language === 'en'
        ? 'Submit your first deal to go live — add photos, prices, and your discount.'
        : language === 'fr'
          ? 'Soumettez votre première offre pour être visible — photos, prix et réduction.'
          : 'Submitim fes dil blong yu — atem foto, praes, mo diskaon.',
    );
  }, [ownerDataLoading, businessOwnerNeedsFirstListing, language]);

  const selectedBusiness = unifiedBusinesses.find(b => b.id === selectedBusinessId) || (hasAnyBusinesses ? unifiedBusinesses[0] : null);
  const selectedIsApproved = selectedBusiness?._source === 'approved';
  const selectedProfileId = useMemo(() => {
    if (!selectedBusiness || selectedBusiness._source !== 'approved') return '';
    return effectiveProfileBusinessId(selectedBusiness);
  }, [selectedBusiness]);

  /** Approved rows for the same company profile (each live deal / profile stub). Used on Edit for mobile listing switcher. */
  const approvedListingsSameProfile = useMemo(() => {
    if (!selectedProfileId) return [];
    const rows = unifiedBusinesses.filter(
      (b) => b._source === 'approved' && effectiveProfileBusinessId(b) === selectedProfileId,
    );
    return [...rows].sort((a, b) => {
      const aIsProfile = a.id === selectedProfileId;
      const bIsProfile = b.id === selectedProfileId;
      if (aIsProfile !== bIsProfile) return aIsProfile ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  }, [unifiedBusinesses, selectedProfileId]);

  /** Master profile row — company name + logo for Simple Hub header and share link. */
  const profileCompanyMeta = useMemo(() => {
    if (!selectedProfileId) return { name: '', logo: null as string | null };
    const stub = unifiedBusinesses.find(
      (b) => b._source === 'approved' && String(b.id) === String(selectedProfileId),
    );
    if (stub) {
      return { name: (stub.name || '').trim(), logo: stub.image || null };
    }
    const offeringRow =
      approvedListingsSameProfile.find(
        (b) => String(b._profileBusinessId ?? '') === String(selectedProfileId),
      ) ?? approvedListingsSameProfile[0];
    if (!offeringRow) return { name: '', logo: null };
    return {
      name: (offeringRow._profileDisplayName || '').trim(),
      logo: offeringRow._profileLogoUrl || offeringRow.image || null,
    };
  }, [approvedListingsSameProfile, unifiedBusinesses, selectedProfileId]);

  /** Profile row id for business-wide settings (not tied to which listing is selected). */
  const ownerProfileBusinessId = useMemo(() => {
    if (selectedProfileId) return selectedProfileId;
    const row = approvedOnlyBusinesses[0];
    if (!row) return '';
    return effectiveProfileBusinessId(row);
  }, [selectedProfileId, approvedOnlyBusinesses]);

  /** Profile id when owner has a `businesses` row but no approved offering yet (pending-first onboarding). */
  const [fallbackProfileBusinessId, setFallbackProfileBusinessId] = useState('');
  useEffect(() => {
    if (!user?.id) {
      setFallbackProfileBusinessId('');
      return;
    }
    if (ownerProfileBusinessId) {
      setFallbackProfileBusinessId('');
      return;
    }
    if (businessOwnerHasBusinessRow !== true) return;
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
      setFallbackProfileBusinessId(data?.id ? String(data.id) : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, ownerProfileBusinessId, businessOwnerHasBusinessRow]);

  /** Resolved profile `businesses.id` for settings/credentials (do not shadow `effectiveProfileBusinessId()` from businessOfferingMap). */
  const resolvedProfileBusinessId = ownerProfileBusinessId || fallbackProfileBusinessId;

  useEffect(() => {
    if (unifiedBusinesses.length > 0 && !selectedBusinessIdRef.current) {
      const firstApproved = unifiedBusinesses.find(b => b._source === 'approved');
      setSelectedBusinessId(firstApproved?.id || unifiedBusinesses[0].id);
    }
  }, [unifiedBusinesses]);

  useEffect(() => {
    if (selectedBusiness) {
      const formData = {
        description: selectedBusiness.description,
        hours: selectedBusiness.hours,
        phone: selectedBusiness.phone,
        discount: selectedBusiness.discount,
        deal_price: selectedBusiness.dealPrice,
        original_price: selectedBusiness.originalPrice,
      };
      setEditForm(formData);
      setOriginalEditForm(formData);
      setEditHasChanges(false);
    }
  }, [selectedBusiness]);

  useEffect(() => {
    const hasChanges =
      editForm.description !== originalEditForm.description ||
      editForm.hours !== originalEditForm.hours ||
      editForm.phone !== originalEditForm.phone ||
      editForm.discount !== originalEditForm.discount ||
      editForm.deal_price !== originalEditForm.deal_price ||
      editForm.original_price !== originalEditForm.original_price;
    setEditHasChanges(hasChanges);
  }, [editForm, originalEditForm]);

  // Load pending edits
  const loadPendingEdits = useCallback(async () => {
    if (!selectedBusiness || !user || !selectedIsApproved || !selectedProfileId) return;
    setLoadingEdits(true);
    try {
      const { data } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'get_pending_edits', userId: user.id, businessId: selectedProfileId },
      });
      if (data?.edits) setPendingEdits(data.edits);
    } catch (err) {
      console.error('Failed to load pending edits:', err);
    } finally {
      setLoadingEdits(false);
    }
  }, [selectedBusiness, user, selectedIsApproved, selectedProfileId]);

  useEffect(() => { loadPendingEdits(); }, [loadPendingEdits]);

  const listingEmbeddedEdit = useMemo(() => {
    if (!selectedBusiness || !selectedIsApproved || !user?.id) return null;
    const profileBusinessId = effectiveProfileBusinessId(selectedBusiness);
    const fromDb = dbBusinesses.find((b) => b.id === selectedBusiness.id);
    const biz = mergeListingBusinessForEdit(selectedBusiness, fromDb);
    const isOfferingRow = Boolean(
      selectedBusiness._profileBusinessId &&
        String(selectedBusiness.id) !== String(selectedBusiness._profileBusinessId),
    );
    const listingTitle =
      String(selectedBusiness.name || '').trim() || biz.name?.trim() || 'Offer';
    const listingCategory = String(selectedBusiness.category || '').trim() || String(biz.category || '');
    return {
      profileBusinessId,
      offeringId: isOfferingRow ? String(selectedBusiness.id) : '',
      listingTitle,
      listingCategory,
      business: biz,
      onEditSubmitted: () => {
        void refreshBusinesses();
        void loadPendingEdits();
      },
    };
  }, [selectedBusiness, selectedIsApproved, user?.id, dbBusinesses, refreshBusinesses, loadPendingEdits]);

  const loadReviewResponses = useCallback(async () => {
    if (!selectedProfileId || !selectedIsApproved) return;
    try {
      const { data, error } = await supabase
        .from('review_responses')
        .select('id, review_id, response, created_at')
        .eq('business_id', selectedProfileId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const byReview = new Map<string, ReviewResponse>();
      (data || []).forEach((row: { id: string; review_id: string; response: string; created_at: string }) => {
        if (!byReview.has(row.review_id)) {
          byReview.set(row.review_id, {
            id: row.id,
            review_id: row.review_id,
            response: row.response,
            created_at: row.created_at,
          });
        }
      });
      setReviewResponses(Array.from(byReview.values()));
    } catch (err) {
      console.error('Failed to load review responses:', err);
    }
  }, [selectedProfileId, selectedIsApproved]);

  useEffect(() => {
    void loadReviewResponses();
  }, [loadReviewResponses]);

  // Load gallery photos
  useEffect(() => {
    if (activeTab === 'photos' && selectedBusiness && selectedIsApproved) loadGalleryPhotos();
  }, [activeTab, selectedBusiness, selectedIsApproved]);

  const loadGalleryPhotos = async () => {
    if (!selectedBusiness || !selectedProfileId) return;
    setGalleryLoading(true);
    try {
      const { resolveGalleryOfferingId } = await import('@/lib/galleryOfferingId');
      const listingOfferingId = await resolveGalleryOfferingId(
        supabase,
        String(selectedBusiness.id),
        selectedProfileId,
      );
      const { data, error } = await supabase
        .from('business_photos')
        .select('*')
        .eq('business_id', selectedProfileId)
        .eq('offering_id', listingOfferingId)
        .order('is_main', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setGalleryPhotos(data || []);
    } catch (err) {
      console.error('Failed to load gallery photos:', err);
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleSaveNewGalleryPhotos = async () => {
    if (!selectedBusiness || !user || !selectedProfileId || newGalleryPhotos.length === 0) return;
    setSavingGallery(true);
    try {
      const { resolveGalleryOfferingId } = await import('@/lib/galleryOfferingId');
      const listingOfferingId = await resolveGalleryOfferingId(
        supabase,
        String(selectedBusiness.id),
        selectedProfileId,
      );
      const { buildGalleryPayloadFromPhotos } = await import('@/lib/listingGallerySave');
      const mergedGallery = buildGalleryPayloadFromPhotos([
        ...galleryPhotos.map((p) => ({
          url: p.url,
          filePath: p.file_path || '',
        })),
        ...newGalleryPhotos.map((photo) => ({
          url: photo.url,
          filePath: photo.filePath,
        })),
      ]);
      if (mergedGallery.length === 0) {
        throw new Error('No uploaded photos to save. Wait for uploads to finish.');
      }
      const { data, error } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'sync_listing_gallery',
          userId: user.id,
          businessId: selectedProfileId,
          offeringId: listingOfferingId,
          galleryPhotos: mergedGallery,
        },
      });
      if (error) throw error;
      if (data?.error || data?.photosSyncFailed) {
        throw new Error(String(data?.error || 'Failed to save photos'));
      }
      const totalApproved = Number(data?.photosSynced?.totalApproved ?? 0);
      if (totalApproved < mergedGallery.length) {
        throw new Error(
          `Only ${totalApproved} of ${mergedGallery.length} photos saved. Ask support to deploy manage-business, then try again.`,
        );
      }
      toast.success(`${newGalleryPhotos.length} photo${newGalleryPhotos.length > 1 ? 's' : ''} added!`);
      setNewGalleryPhotos([]);
      await loadGalleryPhotos();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save photos');
    } finally {
      setSavingGallery(false);
    }
  };

  const handleDeleteGalleryPhoto = async (photo: GalleryPhoto) => {
    setDeletingPhotoId(photo.id);
    try {
      if (photo.file_path) await supabase.storage.from('business-photos').remove([photo.file_path]);
      const { error } = await supabase.from('business_photos').delete().eq('id', photo.id);
      if (error) throw error;
      setGalleryPhotos(prev => prev.filter(p => p.id !== photo.id));
      toast.success('Photo deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete photo');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const handleSetMainPhoto = async (photo: GalleryPhoto) => {
    if (!selectedBusiness || !selectedProfileId) return;
    try {
      await supabase.from('business_photos').update({ is_main: false }).eq('business_id', selectedProfileId);
      const { error } = await supabase.from('business_photos').update({ is_main: true }).eq('id', photo.id);
      if (error) throw error;
      await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'update_business', userId: user?.id, businessId: selectedProfileId, updates: { image: photo.url } },
      });
      setGalleryPhotos(prev => prev.map(p => ({ ...p, is_main: p.id === photo.id })));
      toast.success('Main photo updated!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to set main photo');
    }
  };

  const businessReviews = useMemo(() => {
    if (!selectedProfileId) return [];
    const forProfile = dbReviews.filter((r) => r.business_id === selectedProfileId);
    const offeringFocus =
      selectedBusiness &&
      selectedIsApproved &&
      String(selectedBusiness.id) !== String(selectedProfileId);
    if (!offeringFocus) return forProfile;
    const oid = String(selectedBusiness!.id);
    return forProfile.filter((r) => String(r.offering_id || '') === oid);
  }, [dbReviews, selectedProfileId, selectedBusiness, selectedIsApproved]);

  const weeklyRedemptions = [
    { day: 'Mon', count: 12, revenue: 180 }, { day: 'Tue', count: 8, revenue: 120 },
    { day: 'Wed', count: 15, revenue: 225 }, { day: 'Thu', count: 18, revenue: 270 },
    { day: 'Fri', count: 24, revenue: 360 }, { day: 'Sat', count: 32, revenue: 480 },
    { day: 'Sun', count: 28, revenue: 420 },
  ];
  const totalRedemptions = weeklyRedemptions.reduce((sum, d) => sum + d.count, 0);
  const totalRevenue = weeklyRedemptions.reduce((sum, d) => sum + d.revenue, 0);

  // ═══ HANDLERS ═══
  const handleSubmitEditForReview = async () => {
    if (!selectedBusiness || !user || !selectedProfileId || !editHasChanges) {
      if (!editHasChanges) toast.info('No changes detected.');
      return;
    }
    setSubmittingEdit(true);
    try {
      const changes: Record<string, any> = {};
      if (editForm.description !== originalEditForm.description) changes.description = editForm.description;
      if (editForm.hours !== originalEditForm.hours) changes.hours = editForm.hours;
      if (editForm.phone !== originalEditForm.phone) changes.phone = editForm.phone;
      if (editForm.discount !== originalEditForm.discount) changes.discount = editForm.discount;
      if (editForm.deal_price !== originalEditForm.deal_price) changes.deal_price = editForm.deal_price;
      if (editForm.original_price !== originalEditForm.original_price) changes.original_price = editForm.original_price;

      const listingOfferingId =
        selectedBusiness?._profileBusinessId &&
        String(selectedBusiness.id) !== String(selectedBusiness._profileBusinessId)
          ? String(selectedBusiness.id)
          : '';

      const { data, error } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'submit_edit',
          userId: user.id,
          businessId: selectedProfileId,
          ...(listingOfferingId ? { offeringId: listingOfferingId } : {}),
          changes,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.updated ? 'Pending edit updated!' : 'Edit submitted for review!');
      await loadPendingEdits();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit edit');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleToggleActive = async (active: boolean) => {
    if (!selectedBusiness || !selectedProfileId) return;
    try {
      await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'toggle_active', userId: user?.id, businessId: selectedProfileId, active },
      });
      toast.success(active ? 'Listing activated!' : 'Listing deactivated');
    } catch (err: any) {
      toast.error('Failed to toggle listing status');
    }
  };

  const handleRespondToReview = async (reviewId: string) => {
    if (!selectedBusiness || !user || !selectedProfileId || !responseText[reviewId]?.trim()) return;
    try {
      const { data, error } = await invokeEdgeFunctionWithRetry(
        'manage-business',
        {
          action: 'respond_to_review',
          userId: user.id,
          reviewId,
          businessId: selectedProfileId,
          response: responseText[reviewId],
        },
        { logPrefix: '[Dashboard]' },
      );
      if (error) throw error instanceof Error ? error : new Error(String(error?.message || error));
      if (data?.error) throw new Error(data.error);
      setResponseText(prev => ({ ...prev, [reviewId]: '' }));
      toast.success('Response posted!');
      await loadReviewResponses();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to post response');
    }
  };

  const handleSubmitBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitFieldErrors({});

    // Same rules as `BusinessListingForm` (`validateListingSubmissionOnboarding` + i18n toasts).
    // Resubmit keeps this compact form + `resubmit_pending_business`; new listings use `<BusinessListingForm />`.
    const mainImageUrl = String(
      (submitPhotos.length > 0 ? submitPhotos[0].url : submitForm.image) || '',
    ).trim();

    const listingValidation = validateListingSubmissionOnboarding({
      title: submitForm.name.trim(),
      descriptionHtml: submitForm.description,
      category: submitForm.category,
      mainImageUrl,
      flatPricing: categoryUsesTieredPricing(submitForm.category)
        ? null
        : {
            originalPrice: submitForm.originalPrice,
            dealPrice: submitForm.dealPrice,
            discountPercent: submitForm.discountPercent,
          },
      pricingTiers: categoryUsesTieredPricing(submitForm.category) ? pricingTiers : null,
    });

    if (!listingValidation.valid) {
      const { fieldErrors: nextErr, toastMessage } = localizedListingSubmitValidationFeedback(
        listingValidation.errors,
        submitForm.description,
        language,
      );
      setSubmitFieldErrors(nextErr);
      toast.error(toastMessage);
      return;
    }

    const hasDiscountFields = submitForm.originalPrice || submitForm.discountPercent;
    let origPrice = 0;
    let dlPrice = 0;

    if (hasDiscountFields) {
      origPrice = Number(submitForm.originalPrice);
      dlPrice = Number(submitForm.dealPrice);
    } else {
      origPrice = Number(submitForm.originalPrice) || 0;
      dlPrice = Number(submitForm.dealPrice) || 0;
    }

    const pctForHeadline = parseFloat(String(submitForm.discountPercent).replace(/,/g, ''));
    if (
      (!Number.isFinite(dlPrice) || dlPrice <= 0) &&
      Number.isFinite(origPrice) &&
      origPrice > 0 &&
      Number.isFinite(pctForHeadline) &&
      pctForHeadline > 0 &&
      pctForHeadline < 100
    ) {
      dlPrice = origPrice * (1 - pctForHeadline / 100);
    }

    let discountForSubmit = String(submitForm.discount || '').trim();
    if (
      !discountForSubmit &&
      Number.isFinite(pctForHeadline) &&
      pctForHeadline > 0 &&
      pctForHeadline < 100
    ) {
      discountForSubmit = `${Math.round(pctForHeadline)}% OFF`;
    }

    let tiersPayload: unknown[] | null = null;
    if (categoryUsesTieredPricing(submitForm.category)) {
      const { data } = validatePricingTiersForSubmit(pricingTiers);
      tiersPayload = data ?? null;
    }

    setLoading(true);
    const submitDeadlineMsg =
      language === 'en'
        ? 'The connection is slow. Please check your internet and try again.'
        : 'La connexion est lente. Vérifiez votre réseau et réessayez.';
    try {
      await Promise.race([
        (async () => {
      const normalizedWebsite = normalizeWebsiteForStorage(submitForm.website) ?? null;

      // Calculate discount valid until from duration
      const selectedDuration = DURATION_OPTIONS.find(d => d.value === submitForm.listingDuration);
      const discountValidUntil = selectedDuration
        ? addDays(submitForm.discountValidFrom, selectedDuration.days)
        : addDays(submitForm.discountValidFrom, 30);

      // Prepare photo data
      const photoData = submitPhotos.map((photo, index) => ({
        url: photo.url,
        filePath: photo.filePath,
        isMain: index === 0,
      }));

      // ─── RESUBMIT: Edit & resubmit a rejected submission ───
      if (resubmitSubmission?.id) {
        const { data: resubmitData, error: resubmitErr } = await invokeEdgeFunctionWithRetry(
          'manage-business',
          {
            action: 'resubmit_pending_business',
            userId: user?.id,
            pendingId: resubmitSubmission.id,
            name: submitForm.name,
            category: submitForm.category,
            description: submitForm.description,
            discount: discountForSubmit,
            originalPrice: origPrice,
            dealPrice: dlPrice,
            location: submitForm.location || 'Port Vila, Vanuatu',
            phone: submitForm.phone,
            whatsappNumber: submitForm.whatsappNumber || null,
            email: submitForm.email || user?.email,
            hours: submitForm.hours,
            image: mainImageUrl,
            photos: photoData.length > 0 ? photoData : undefined,
            mapUrl: submitForm.mapUrl,
            website: normalizedWebsite,
            discountValidFrom: submitForm.discountValidFrom,
            discountValidUntil: discountValidUntil,
            pricingTiers: tiersPayload,
          } as Record<string, unknown>,
          { maxRetries: 2, label: 'resubmit', logPrefix: '[Dashboard]' },
        );
        const errMsg = resubmitData?.error || resubmitErr?.message || 'Resubmit failed';
        if (resubmitErr || resubmitData?.error) throw new Error(typeof errMsg === 'string' ? errMsg : 'Resubmit failed');
        if (resubmitData?.success) {
          toast.success('Listing resubmitted for approval!');
          setResubmitSubmission(null);
          setSubmitFieldErrors({});
          setSubmitForm({ name: '', category: 'dining', description: '', discount: '', originalPrice: '', discountPercent: '', dealPrice: '', location: '', phone: '', email: '', hours: '', image: '', whatsappNumber: '', mapUrl: '', website: '', discountValidFrom: todayStr(), listingDuration: '1_month' });
          setSubmitPhotos([]);
          setPricingTiers([]);
          await loadAllOwnerData();
          setActiveTab('submissions');
          setLoading(false);
          return;
        }
      }

      const linkToProfile = unifiedBusinesses.find(
        (b) => b._source === 'approved' && b.id === selectedBusinessId,
      );
      const pBusinessIdForSubmit =
        linkToProfile != null ? effectiveProfileBusinessId(linkToProfile) : null;

      // Strategy 1: RPC insert (SECURITY DEFINER, bypasses RLS — most reliable)
      const rpcAborter = new AbortController();
      const rpcTimer = setTimeout(() => rpcAborter.abort(), RPC_INSERT_PENDING_TIMEOUT_MS);
      let rpcId: string | null = null;
      let rpcError: { message?: string; name?: string } | null = null;
      try {
        const rpcRes = await supabase
          .rpc('insert_pending_business', {
            p_owner_id: user?.id,
            p_name: submitForm.name,
            p_category: submitForm.category,
            p_description: submitForm.description,
            p_discount: discountForSubmit,
            p_original_price: origPrice,
            p_deal_price: dlPrice,
            p_location: submitForm.location || 'Port Vila, Vanuatu',
            p_phone: submitForm.phone,
            p_email: submitForm.email || user?.email,
            p_hours: submitForm.hours,
            p_image: mainImageUrl,
            p_map_url: submitForm.mapUrl || null,
            p_website: normalizedWebsite,
            p_discount_valid_from: submitForm.discountValidFrom || null,
            p_discount_valid_until: discountValidUntil || null,
            p_whatsapp_number: submitForm.whatsappNumber || null,
            p_pricing_tiers: tiersPayload,
            p_business_id: pBusinessIdForSubmit,
          })
          .abortSignal(rpcAborter.signal);
        rpcId = rpcRes.data != null ? String(rpcRes.data) : null;
        rpcError = rpcRes.error;
      } catch (rpcEx: any) {
        const aborted =
          rpcEx?.name === 'AbortError' ||
          String(rpcEx?.message || '').toLowerCase().includes('abort');
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
        const directData = { id: rpcId };
        if (directData.id && submitPhotos.length > 0 && user) {
          const photoData = submitPhotos.map((photo, index) => ({
            url: photo.url,
            filePath: photo.filePath,
            isMain: index === 0,
          }));

          // Server-side insert (service role) to avoid silent RLS failures.
          const { data: attachData, error: attachErr } = await invokeEdgeFunctionWithRetry(
            'manage-business',
            {
              action: 'attach_pending_photos',
              userId: user.id,
              pendingId: directData.id,
              photos: photoData,
            },
            { maxRetries: 2, label: 'attach_pending_photos', logPrefix: '[Dashboard]' },
          );
          if (attachErr || attachData?.error) {
            throw new Error(
              attachData?.error ||
              attachErr?.message ||
              'Business created, but failed to save photo records'
            );
          }
        }
        toast.success('Business submitted for approval!');
        setSubmitForm({
          name: '', category: 'dining', description: '', discount: '',
          originalPrice: '', discountPercent: '', dealPrice: '',
          location: '', phone: '', email: '', hours: '', image: '',
          whatsappNumber: '',
          mapUrl: '', website: '',
          discountValidFrom: todayStr(),
          listingDuration: '1_month',
        });
        setSubmitPhotos([]);
        setPricingTiers([]);
        await loadAllOwnerData();
        setActiveTab('submissions');
        setLoading(false);
        return;
      }

      // Strategy 2: Edge function fallback (if RPC not deployed or fails)
      console.warn('[Dashboard] RPC failed, trying manage-business Edge Function...', { rpcError: rpcError?.message });
      const { data, error } = await invokeEdgeFunctionWithRetry(
        'manage-business',
        {
          action: 'submit_business',
          userId: user?.id,
          name: submitForm.name,
          category: submitForm.category,
          description: submitForm.description,
          discount: discountForSubmit,
          originalPrice: origPrice,
          dealPrice: dlPrice,
          location: submitForm.location || 'Port Vila, Vanuatu',
          phone: submitForm.phone,
          whatsappNumber: submitForm.whatsappNumber || null,
          email: submitForm.email || user?.email,
          hours: submitForm.hours,
          image: mainImageUrl,
          photos: photoData,
          mapUrl: submitForm.mapUrl,
          website: normalizedWebsite,
          discountValidFrom: submitForm.discountValidFrom,
          discountValidUntil: discountValidUntil,
          pricingTiers: tiersPayload,
          businessId: pBusinessIdForSubmit,
        } as Record<string, unknown>,
        { maxRetries: 2, label: 'submit_business', logPrefix: '[Dashboard]' },
      );

      if (data?.success && data?.business?.id) {
        toast.success('Business submitted for approval!');
        setSubmitForm({
          name: '', category: 'dining', description: '', discount: '',
          originalPrice: '', discountPercent: '', dealPrice: '',
          location: '', phone: '', email: '', hours: '', image: '',
          whatsappNumber: '',
          mapUrl: '', website: '',
          discountValidFrom: todayStr(),
          listingDuration: '1_month',
        });
        setSubmitPhotos([]);
        setPricingTiers([]);
        await loadAllOwnerData();
        setActiveTab('submissions');
        setLoading(false);
        return;
      }

      // Both strategies failed
      throw new Error(
        rpcError?.message || data?.error || error?.message || 'Failed to submit business. Please ensure the database migration has been applied.'
      );
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(submitDeadlineMsg)), DASHBOARD_LISTING_SUBMIT_DEADLINE_MS),
        ),
      ]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit business');
    } finally {
      setLoading(false);
    }
  };


  const currentPendingEdit = pendingEdits.find(
    e => selectedProfileId && e.business_id === selectedProfileId && e.status === 'pending',
  );
  const editHistory = pendingEdits.filter(
    e => selectedProfileId && e.business_id === selectedProfileId,
  );

  // ═══ ACCESS CHECK ═══
  // Use userProfile.role as the authoritative source (from DB), falling back to user.type
  // This prevents the "Business Account Required" flash when user.type is still 'tourist' from stale metadata
  const effectiveRole = userProfile?.role || user?.type;
  
  if (!user || (effectiveRole !== 'business' && effectiveRole !== 'admin')) {
    // If userProfile hasn't loaded yet, show a loading state instead of the error
    if (user && !userProfile) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-teal-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading your dashboard...</p>
          </div>
        </div>
      );
    }

    const openLogin = async () => {
      if (user && effectiveRole === 'tourist') {
        try {
          await signOut();
        } catch {
          /* open auth anyway */
        }
      }
      setAuthMode('signin');
      setShowAuth(true);
    };

    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-lg mx-auto px-4 text-center pt-20">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-orange-50 flex items-center justify-center">
            <Store className="w-10 h-10 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Business Account Required</h2>
          <p className="text-gray-500 mb-6">
            {user
              ? 'You are signed in with an account that cannot open the Business Hub. Sign in with your Staff or Business account.'
              : 'Sign in with your Staff or Business account to open the hub.'}
          </p>
          <button
            type="button"
            onClick={() => void openLogin()}
            className="w-full max-w-xs mx-auto px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
          >
            Staff / Business login
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('list-business')}
            className="mt-3 block w-full max-w-xs mx-auto text-sm text-teal-700 font-semibold hover:underline"
          >
            List your business — free
          </button>
        </div>
      </div>
    );
  }


  // ═══ STATUS BADGE HELPER ═══
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold"><div className="w-1.5 h-1.5 rounded-full bg-green-500" />Live</span>;
      case 'pending':
        return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-bold"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />Pending</span>;
      case 'rejected':
        return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold"><div className="w-1.5 h-1.5 rounded-full bg-red-500" />Rejected</span>;
      default:
        return null;
    }
  };

  // ═══ SIDEBAR NAV ITEMS ═══
  const simpleHubNav = hasApprovedListingOffering && !ownerDataLoading;
  const submissionsBadge =
    unseenSubmissionChanges > 0
      ? String(unseenSubmissionChanges)
      : allSubmissions.length > 0
        ? String(allSubmissions.length)
        : undefined;

  const profileNavItems: { key: DashboardTab; label: string; icon: React.ReactNode; badge?: string }[] =
    resolvedProfileBusinessId
      ? [
          {
            key: 'profile' as const,
            label: language === 'en' ? 'Business Profile' : language === 'fr' ? 'Profil entreprise' : 'Bisnis profael',
            icon: <Building2 className="w-5 h-5" />,
          },
          {
            key: 'credentials' as const,
            label: language === 'en' ? 'My credentials' : language === 'fr' ? 'Mes accréditations' : 'Kredensel blong mi',
            icon: <ShieldCheck className="w-5 h-5" />,
          },
        ]
      : [];

  const secondaryNavItems: { key: DashboardTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" /> },
    { key: 'reviews', label: 'Reviews', icon: <MessageSquare className="w-5 h-5" />, badge: businessReviews.length > 0 ? String(businessReviews.length) : undefined },
    { key: 'photos', label: 'Photos', icon: <Image className="w-5 h-5" /> },
    { key: 'submissions', label: 'My Submissions', icon: <ClipboardList className="w-5 h-5" />, badge: submissionsBadge },
    ...profileNavItems,
    { key: 'emails', label: 'Emails', icon: <Mail className="w-5 h-5" /> },
    { key: 'submit', label: 'New Listing', icon: <Plus className="w-5 h-5" /> },
  ];

  const navItems: { key: DashboardTab; label: string; icon: React.ReactNode; badge?: string; section?: 'primary' | 'secondary' }[] =
    simpleHubNav
      ? [
          {
            key: 'overview',
            label: language === 'en' ? 'Home' : language === 'fr' ? 'Accueil' : 'Hom',
            icon: <Home className="w-5 h-5" />,
            section: 'primary',
          },
          {
            key: 'edit',
            label: 'Edit Listing',
            icon: <Edit3 className="w-5 h-5" />,
            badge: currentPendingEdit ? '!' : undefined,
            section: 'primary',
          },
          ...secondaryNavItems.map((item) => ({ ...item, section: 'secondary' as const })),
        ]
      : [
          { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" />, section: 'primary' as const },
          ...profileNavItems.map((item) => ({ ...item, section: 'primary' as const })),
          { key: 'submissions', label: 'My Submissions', icon: <ClipboardList className="w-5 h-5" />, badge: submissionsBadge, section: 'primary' as const },
          { key: 'edit', label: 'Edit Listing', icon: <Edit3 className="w-5 h-5" />, badge: currentPendingEdit ? '!' : undefined, section: 'primary' as const },
          { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" />, section: 'primary' as const },
          { key: 'reviews', label: 'Reviews', icon: <MessageSquare className="w-5 h-5" />, section: 'primary' as const },
          { key: 'photos', label: 'Photos', icon: <Image className="w-5 h-5" />, section: 'primary' as const },
          { key: 'emails', label: 'Emails', icon: <Mail className="w-5 h-5" />, section: 'primary' as const },
          { key: 'submit', label: 'New Listing', icon: <Plus className="w-5 h-5" />, section: 'primary' as const },
        ];

  const handleNavClick = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
  };

  /** Mobile-first: pick which live deal row without opening the hamburger menu (Edit, Analytics, Reviews, Photos). */
  function renderHubListingSwitcher(context: 'edit' | 'analytics' | 'reviews' | 'photos') {
    if (approvedListingsSameProfile.length <= 1) return null;
    const selectId = `hub-listing-select-${context}`;
    const hint =
      context === 'edit'
        ? language === 'en'
          ? 'You have more than one live deal under this business. Choose which listing to update — no need to open the side menu.'
          : language === 'fr'
            ? 'Plusieurs annonces sont actives. Choisissez celle à modifier — sans passer par le menu.'
            : 'Yu gat mo tan one live dil anta long bisnis ia. Jusum wij listing nao save blong apdeit — no nid blong openem saed menu.'
        : context === 'analytics'
          ? language === 'en'
            ? 'Analytics and charts below are for the listing you select here.'
            : language === 'fr'
              ? 'Les statistiques ci-dessous correspondent à l’annonce choisie ici.'
              : 'Ol namba long daon i blong listing we yu jusum ia.'
          : context === 'reviews'
            ? language === 'en'
              ? 'Reviews shown below are for this listing when reviews are linked to a specific deal.'
              : language === 'fr'
                ? 'Les avis affichés correspondent à cette annonce lorsqu’ils sont liés à une offre.'
                : 'Ol riviu long daon i blong listing ia taem oli link long wan dil.'
            : language === 'en'
              ? 'Photos below are for this listing’s gallery (each deal can have its own photos).'
              : language === 'fr'
                ? 'Les photos ci-dessous sont celles de cette annonce (chaque offre peut avoir sa galerie).'
                : 'Ol foto  daon i blong gallery blong listing ia (evri dil i save gat ol foto blong hem).';
    return (
      <div className="mb-4 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
        <label
          htmlFor={selectId}
          className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2"
        >
          {language === 'en' ? 'Which listing?' : language === 'fr' ? 'Quelle annonce ?' : 'Wan listing?'}
        </label>
        <div className="relative">
          <select
            id={selectId}
            value={selectedBusinessId}
            onChange={(e) => setSelectedBusinessId(e.target.value)}
            className="w-full min-h-[48px] px-4 py-3.5 pr-11 rounded-xl border border-gray-200 text-base font-semibold text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400"
          >
            {approvedListingsSameProfile.map((b) => {
              const isProfileRow = b.id === selectedProfileId;
              const suffix =
                language === 'en'
                  ? isProfileRow
                    ? ' — company profile'
                    : ''
                  : language === 'fr'
                    ? isProfileRow
                      ? ' — profil entreprise'
                      : ''
                    : isProfileRow
                      ? ' — profil bisnis'
                      : '';
              return (
                <option key={b.id} value={b.id}>
                  {(b.name || 'Listing').trim()}
                  {suffix}
                </option>
              );
            })}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">{hint}</p>
      </div>
    );
  }

  // ═══ SIDEBAR RENDERER ═══
  function renderSidebar(isMobile: boolean) {
    return (
      <div className="flex flex-col h-full">
        <div className={`flex items-center gap-3 border-b border-gray-100 ${sidebarCollapsed && !isMobile ? 'justify-center px-4 py-5' : 'px-5 py-5'}`}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-200/50 flex-shrink-0">
            <Store className="w-5 h-5 text-white" />
          </div>
          {(!sidebarCollapsed || isMobile) && (
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-extrabold text-gray-900">Business Hub</h2>
              <p className="text-[11px] text-gray-400 truncate">{user?.email}</p>
            </div>
          )}
          {isMobile && (
            <button onClick={() => setMobileSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* Business Selector with Status Badges */}
        {(!sidebarCollapsed || isMobile) && unifiedBusinesses.length > 0 && (
          <div className="px-3 py-3 border-b border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Your Businesses ({unifiedBusinesses.length})</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {unifiedBusinesses.map(b => (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelectedBusinessId(b.id);
                    // If selecting a pending business, switch to submissions
                    if (b._source === 'pending') {
                      setActiveTab('submissions');
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all ${
                    b.id === selectedBusinessId
                      ? 'bg-teal-50 border border-teal-200'
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    {b.image ? (
                      <img src={b.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Store className="w-4 h-4 text-gray-300" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{b.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {getStatusBadge(b._status)}
                    </div>
                  </div>
                  {b.id === selectedBusinessId && <CheckCircle className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <div className="space-y-1">
            {navItems.map((item, index) => {
              const showMoreDivider =
                simpleHubNav &&
                item.section === 'secondary' &&
                (index === 0 || navItems[index - 1]?.section === 'primary');
              return (
                <React.Fragment key={item.key}>
                  {showMoreDivider && (
                    <p className="px-3.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {language === 'en' ? 'More' : language === 'fr' ? 'Plus' : 'Mo'}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => handleNavClick(item.key)}
                    className={`w-full flex min-h-11 items-center gap-3 rounded-xl transition-all relative ${sidebarCollapsed && !isMobile ? 'justify-center px-3 py-3' : 'px-3.5 py-2.5'} ${activeTab === item.key ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 font-semibold shadow-sm border border-teal-100' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                    title={sidebarCollapsed && !isMobile ? item.label : undefined}
                  >
                    <span className={activeTab === item.key ? 'text-teal-600' : 'text-gray-400'}>{item.icon}</span>
                    {(!sidebarCollapsed || isMobile) && <span className="text-sm flex-1 text-left">{item.label}</span>}
                    {item.badge && (!sidebarCollapsed || isMobile) && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === item.key ? 'bg-teal-200 text-teal-800' : 'bg-orange-100 text-orange-600'}`}>
                        {item.badge}
                      </span>
                    )}
                    {item.badge && sidebarCollapsed && !isMobile && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white" />
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </nav>
        <div className="border-t border-gray-100 p-3 space-y-1">
          {/* Realtime indicator */}
          <div className="flex items-center gap-2 px-3.5 py-1.5">
            <div className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-[10px] text-gray-400">{realtimeConnected ? 'Live updates' : 'Connecting...'}</span>
          </div>
          {!sidebarCollapsed || isMobile ? (
            <>
              <button onClick={() => loadAllOwnerData(true)} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors text-sm"><RefreshCw className="w-5 h-5" />Refresh Data</button>
              <button onClick={() => setCurrentView('home')} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors text-sm"><ArrowLeft className="w-5 h-5" />Back to Site</button>
              {!isMobile && <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors text-sm"><ChevronRight className={`w-5 h-5 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} />Collapse</button>}
            </>
          ) : (
            <>
              <button onClick={() => loadAllOwnerData(true)} className="w-full flex justify-center p-3 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors" title="Refresh"><RefreshCw className="w-5 h-5" /></button>
              <button onClick={() => setCurrentView('home')} className="w-full flex justify-center p-3 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors" title="Back to Site"><ArrowLeft className="w-5 h-5" /></button>
              <button onClick={() => setSidebarCollapsed(false)} className="w-full flex justify-center p-3 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors" title="Expand Sidebar"><ChevronRight className="w-5 h-5" /></button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ═══ REVIEWS TAB ═══
  function renderReviewsTab() {
    if (!selectedIsApproved) {
      return renderPendingOnlyNotice('Reviews are available once your listing is approved.');
    }
    const avgFromFiltered =
      businessReviews.length > 0
        ? businessReviews.reduce((s, r) => s + r.rating, 0) / businessReviews.length
        : null;
    const avgRatingDisplay =
      avgFromFiltered != null ? avgFromFiltered.toFixed(1) : String(selectedBusiness?.rating ?? '—');

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Customer Reviews ({businessReviews.length})</h3>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" aria-hidden />
            <span className="font-bold text-gray-900">{avgRatingDisplay}</span> average
          </div>
        </div>
        {businessReviews.length > 0 ? businessReviews.map(review => {
          const existingResponse = reviewResponses.find(r => r.review_id === review.id);
          return (
            <div key={review.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-sm font-bold">{review.user_name.charAt(0)}</div>
                    <div><p className="text-sm font-semibold text-gray-900">{review.user_name}</p><p className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString()}</p></div>
                  </div>
                  <div className="flex items-center gap-0.5">{Array.from({ length: 5 }).map((_, i) => (<Star key={i} className={`w-4 h-4 ${i < review.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-200'}`} />))}</div>
                </div>
                <p className="text-sm text-gray-600">{review.comment}</p>
                {existingResponse && (
                  <div className="mt-4 ml-6 p-4 bg-teal-50 rounded-xl border border-teal-100">
                    <div className="flex items-center gap-2 mb-2"><Store className="w-4 h-4 text-teal-600" /><span className="text-xs font-bold text-teal-700">Business Response</span></div>
                    <p className="text-sm text-teal-800">{existingResponse.response}</p>
                  </div>
                )}
                {!existingResponse && (
                  <div className="mt-4 ml-6 flex items-center gap-2">
                    <input type="text" value={responseText[review.id] || ''} onChange={(e) => setResponseText(prev => ({ ...prev, [review.id]: e.target.value }))} placeholder="Write a response..." className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    <button onClick={() => handleRespondToReview(review.id)} disabled={!responseText[review.id]?.trim()} className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-1"><Send className="w-4 h-4" />Reply</button>
                  </div>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No reviews yet.</p>
            <p className="text-sm text-gray-400 mt-1">Reviews from tourists will appear here.</p>
          </div>
        )}
      </div>
    );
  }

  // ═══ PENDING-ONLY NOTICE ═══
  function renderPendingOnlyNotice(message: string) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-yellow-50 to-amber-50 flex items-center justify-center border border-yellow-200">
          <Clock className="w-10 h-10 text-yellow-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-3">Listing Pending Approval</h2>
        <p className="text-gray-500 mb-2">{message}</p>
        <p className="text-sm text-gray-400 mb-6">Your listing is currently being reviewed by our admin team.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={() => setActiveTab('submissions')} className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200 flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />Check Submission Status
          </button>
        </div>
      </div>
    );
  }

  // ═══ PHOTOS TAB ═══
  function renderPhotosTab() {
    if (!selectedBusiness || !user) return null;
    if (!selectedIsApproved) {
      return renderPendingOnlyNotice('Photo management is available once your listing is approved.');
    }
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"><Image className="w-5 h-5 text-purple-600" />Photo Gallery</h3>
          <p className="text-sm text-gray-500 mb-6">Manage your business photos. The main photo appears on your listing card.</p>
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Current Main Image</p>
            <div className="relative rounded-xl overflow-hidden w-full max-w-md border border-gray-200">
              <img src={selectedBusiness.image} alt={selectedBusiness.name} className="w-full h-48 object-cover" />
              <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-teal-600 text-white text-xs font-bold">Main Photo</div>
            </div>
          </div>
          {galleryLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-teal-500 animate-spin" /><span className="ml-3 text-sm text-gray-500">Loading gallery...</span></div>
          ) : (
            <>
              {galleryPhotos.length > 0 && (
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-3">Gallery ({galleryPhotos.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {galleryPhotos.map(photo => (
                      <div key={photo.id} className="group relative rounded-xl overflow-hidden aspect-square bg-gray-100 border border-gray-200 hover:border-teal-300 transition-all">
                        <img src={photo.url} alt="Gallery" className="w-full h-full object-cover" />
                        {photo.is_main && <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-teal-600 text-white text-[9px] font-bold uppercase">Main</div>}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          {!photo.is_main && <button onClick={() => handleSetMainPhoto(photo)} className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700">Set as Main</button>}
                          <button
                            onClick={() => {
                              if (!window.confirm('Remove this photo permanently? This cannot be undone.')) return;
                              void handleDeleteGalleryPhoto(photo);
                            }}
                            disabled={deletingPhotoId === photo.id}
                            className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 flex items-center gap-1 disabled:opacity-50"
                          >
                            {deletingPhotoId === photo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {galleryPhotos.length === 0 && (
                <div className="mb-6 p-8 rounded-xl bg-gray-50 border border-gray-100 text-center"><Image className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-sm text-gray-500 font-medium">No gallery photos yet</p></div>
              )}
            </>
          )}
          <div className="border-t border-gray-100 pt-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Upload New Photos</p>
            <PhotoUploader photos={newGalleryPhotos} onPhotosChange={setNewGalleryPhotos} maxPhotos={10} maxSizeMB={5} userId={user.id} label="Upload New Promotional Images" sublabel="Vertical crop for the phone feed. PNG, JPG up to 5MB. First photo = cover." />
            {newGalleryPhotos.length > 0 && (
              <button onClick={handleSaveNewGalleryPhotos} disabled={savingGallery} className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 shadow-lg shadow-teal-200 flex items-center justify-center gap-2 disabled:opacity-60">
                {savingGallery ? <><Loader2 className="w-5 h-5 animate-spin" />Saving...</> : <><Save className="w-5 h-5" />Save {newGalleryPhotos.length} Photo{newGalleryPhotos.length > 1 ? 's' : ''}</>}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══ SUBMIT TAB ═══
  function renderSubmitTab() {
    if (!user) return null;
    const isResubmit = !!resubmitSubmission;

    // New listings: `BusinessListingForm` (shared validation + field errors). Rejected resubmits: compact
    // legacy form + `handleSubmitBusiness` — rules aligned via `validateListingSubmissionOnboarding` in both paths.
    if (!isResubmit) {
      return (
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 text-teal-500 animate-spin" aria-hidden />
            </div>
          }
        >
          <BusinessListingForm />
        </Suspense>
      );
    }

    return (
      <div className="max-w-3xl space-y-6">
        {isResubmit && resubmitSubmission?.admin_notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h4 className="text-sm font-bold text-amber-800 mb-1">Admin feedback (please address before resubmitting)</h4>
            <p className="text-sm text-amber-700">{resubmitSubmission.admin_notes}</p>
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"><Plus className="w-5 h-5 text-teal-600" />{isResubmit ? 'Edit & Resubmit Listing' : 'Submit New Business Listing'}</h3>
          <p className="text-sm text-gray-500 mb-6">{isResubmit ? 'Make your changes below and resubmit for approval.' : 'Your listing will be reviewed by our admin team before going live.'}</p>
          <form onSubmit={handleSubmitBusiness} className="space-y-5">
            {/* Business Name & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {language === 'en' ? 'Deal / listing title' : language === 'fr' ? 'Titre de l’offre' : 'Titel blong dil'}
                  <span className="text-red-600 font-semibold" aria-hidden> *</span>
                </label>
                <input
                  type="text"
                  value={submitForm.name}
                  onChange={(e) => {
                    setSubmitFieldErrors((fe) => ({ ...fe, title: undefined }));
                    setSubmitForm({ ...submitForm, name: e.target.value });
                  }}
                  aria-invalid={!!submitFieldErrors.title}
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                    submitFieldErrors.title ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-200'
                  }`}
                  placeholder="e.g. Paradise Beach Bar"
                />
                {submitFieldErrors.title && (
                  <p className="text-sm text-red-600 mt-1.5 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                    {submitFieldErrors.title}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {language === 'en' ? 'Category' : language === 'fr' ? 'Catégorie' : 'Kategori'}
                  <span className="text-red-600 font-semibold" aria-hidden> *</span>
                </label>
                <select
                  value={submitForm.category}
                  onChange={(e) => {
                    setSubmitFieldErrors((fe) => ({ ...fe, pricing: undefined }));
                    setSubmitForm({ ...submitForm, category: e.target.value });
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {language === 'fr' ? c.labelFr : language === 'bi' ? c.labelBi : c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {language === 'en' ? 'Description' : language === 'fr' ? 'Description' : 'Diskraepem'}
                <span className="text-red-600 font-semibold" aria-hidden> *</span>
              </label>
              <div className={submitFieldErrors.description ? 'rounded-xl ring-2 ring-red-100 border border-red-200 overflow-hidden' : ''}>
                <LazyBusinessDescriptionEditor
                  value={submitForm.description}
                  onChange={(html) => {
                    setSubmitFieldErrors((fe) => ({ ...fe, description: undefined }));
                    setSubmitForm({ ...submitForm, description: html });
                  }}
                  placeholder="Describe your business and what makes it special..."
                />
              </div>
              {submitFieldErrors.description && (
                <p className="text-sm text-red-600 mt-1.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  {submitFieldErrors.description}
                </p>
              )}
              <div className="flex items-center justify-end mt-1">
                <span
                  className={`text-[11px] font-medium ${
                    plainTextFromHtml(submitForm.description).length >
                    BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT
                      ? 'text-orange-500'
                      : 'text-gray-400'
                  }`}
                >
                  {plainTextFromHtml(submitForm.description).length}/{BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX}
                  {language === 'en' ? ' (plain text)' : ' (texte brut)'}
                </span>
              </div>
            </div>

            {/* ─── Pricing & Discount (PricingDiscountFields component) ─── */}
            <div className={submitFieldErrors.pricing && !categoryUsesTieredPricing(submitForm.category) ? 'rounded-xl ring-2 ring-red-100 border border-red-200 p-1' : ''}>
              <PricingDiscountFields
                mode="flat"
                originalPrice={submitForm.originalPrice}
                discountPercent={submitForm.discountPercent}
                onOriginalPriceChange={(val) => {
                  setSubmitFieldErrors((fe) => ({ ...fe, pricing: undefined }));
                  setSubmitForm(prev => ({ ...prev, originalPrice: val }));
                }}
                onDiscountPercentChange={(val) => {
                  setSubmitFieldErrors((fe) => ({ ...fe, pricing: undefined }));
                  setSubmitForm(prev => ({ ...prev, discountPercent: val }));
                }}
                onCalculatedValues={(dealPrice, discountLabel) => {
                  setSubmitForm(prev => ({ ...prev, dealPrice, discount: discountLabel }));
                }}
                showValidity={true}
                discountValidFrom={submitForm.discountValidFrom}
                listingDuration={submitForm.listingDuration}
                onDiscountValidFromChange={(val) => setSubmitForm(prev => ({ ...prev, discountValidFrom: val }))}
                onListingDurationChange={(val) => setSubmitForm(prev => ({ ...prev, listingDuration: val }))}
                showExtras={true}
                mapUrl={submitForm.mapUrl}
                website={submitForm.website}
                onMapUrlChange={(val) => setSubmitForm(prev => ({ ...prev, mapUrl: val }))}
                onWebsiteChange={(val) => setSubmitForm(prev => ({ ...prev, website: val }))}
                category={submitForm.category}
                language={language}
              />
            </div>
            {submitFieldErrors.pricing && !categoryUsesTieredPricing(submitForm.category) && (
              <p className="text-sm text-red-600 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                {submitFieldErrors.pricing}
              </p>
            )}

            {categoryUsesTieredPricing(submitForm.category) && (
              <div className={submitFieldErrors.pricing ? 'rounded-xl ring-2 ring-red-100 border border-red-200 p-1' : ''}>
                <PricingTiersEditor
                  tiers={pricingTiers}
                  onChange={(t) => {
                    setSubmitFieldErrors((fe) => ({ ...fe, pricing: undefined }));
                    setPricingTiers(t);
                  }}
                  language={language}
                  discountPercent={tierDiscountPercent}
                />
              </div>
            )}
            {submitFieldErrors.pricing && categoryUsesTieredPricing(submitForm.category) && (
              <p className="text-sm text-red-600 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                {submitFieldErrors.pricing}
              </p>
            )}

            {/* Location & Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
                <input type="text" value={submitForm.location} onChange={(e) => setSubmitForm({ ...submitForm, location: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Port Vila, Vanuatu" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {listingHoursFieldCopy(submitForm.category, language, {
                    isPerListing: Boolean(selectedProfileId),
                  }).label}
                </label>
                <input
                  type="text"
                  value={submitForm.hours}
                  onChange={(e) => setSubmitForm({ ...submitForm, hours: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder={
                    listingHoursFieldCopy(submitForm.category, language, {
                      isPerListing: Boolean(selectedProfileId),
                    }).placeholder
                  }
                />
              </div>
            </div>
            {/* Phone, Email & WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <input type="tel" value={submitForm.phone} onChange={(e) => setSubmitForm({ ...submitForm, phone: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="+678 12345" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input type="email" value={submitForm.email} onChange={(e) => setSubmitForm({ ...submitForm, email: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="business@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp Number</label>
                <input type="tel" value={submitForm.whatsappNumber} onChange={(e) => setSubmitForm({ ...submitForm, whatsappNumber: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="+678 12345" />
              </div>
            </div>


            {/* Photos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'en' ? 'Business photos' : language === 'fr' ? 'Photos' : 'Foto'}
                <span className="text-red-600 font-semibold" aria-hidden> *</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">
                {language === 'en'
                  ? 'At least one photo is required. Crop to vertical for the phone swipe feed — first photo is the cover.'
                  : language === 'fr'
                    ? 'Au moins une photo est requise. Cadrez en vertical pour le fil mobile — la première est la couverture.'
                    : 'Atlas u nidim wan foto. Crop vertical blong phone feed — first foto = cover.'}
              </p>
              <div className={submitFieldErrors.photos ? 'rounded-xl ring-2 ring-red-100 border border-red-200 p-1' : ''}>
                <PhotoUploader
                  photos={submitPhotos}
                  onPhotosChange={(next) => {
                    setSubmitFieldErrors((fe) => ({ ...fe, photos: undefined }));
                    setSubmitPhotos(next);
                  }}
                  maxPhotos={5}
                  maxSizeMB={5}
                  userId={user.id}
                  label="Upload photos of your business"
                  sublabel="Vertical crop for the phone feed. PNG, JPG up to 5MB. First photo = cover."
                />
              </div>
              {submitFieldErrors.photos && (
                <p className="text-sm text-red-600 mt-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  {submitFieldErrors.photos}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 shadow-lg shadow-teal-200 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {loading ? 'Submitting...' : 'Submit for Approval'}
            </button>
            <p className="text-xs text-gray-400 text-center">Your listing will be reviewed within 24 hours. Listing is completely free.</p>
          </form>
        </div>
      </div>
    );
  }


  // ═══ MAIN RETURN ═══
  return (
    <div className="min-h-screen bg-gray-50/80">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors" aria-label="Open menu"><Menu className="w-5 h-5 text-gray-700" /></button>
            <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center"><Store className="w-4 h-4 text-white" /></div><span className="font-bold text-gray-900 text-sm">{simpleHubNav ? (language === 'en' ? 'My Business' : language === 'fr' ? 'Mon entreprise' : 'Bisnis blong mi') : 'Dashboard'}</span></div>
          </div>
          <button type="button" onClick={() => setCurrentView('home')} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors" aria-label="Back to site"><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl animate-in slide-in-from-left duration-200">{renderSidebar(true)}</div>
        </div>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <div className={`hidden lg:flex flex-col fixed top-0 left-0 bottom-0 bg-white border-r border-gray-100 shadow-sm z-30 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>{renderSidebar(false)}</div>

        {/* Main Content */}
        <div className={`flex-1 min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
          <div className={`pt-20 lg:pt-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto min-w-0 pb-8 lg:pb-12`}>
            {/* Desktop Header — hidden on simple home for approved owners */}
            {!(simpleHubNav && activeTab === 'overview' && selectedIsApproved) && (
            <div className="hidden lg:flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-extrabold text-gray-900">{navItems.find(n => n.key === activeTab)?.label || 'Dashboard'}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedBusiness ? (
                    <span className="flex items-center gap-2">
                      Managing: {selectedBusiness.name}
                      {getStatusBadge(selectedBusiness._status)}
                    </span>
                  ) : 'Manage your business listings'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => loadAllOwnerData(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300 transition-colors shadow-sm text-sm text-gray-600"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
                <div className="relative">
                  <button onClick={() => setBusinessSelectorOpen(!businessSelectorOpen)} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-gray-300 transition-colors shadow-sm">
                    {selectedBusiness && selectedBusiness.image && <img src={selectedBusiness.image} alt="" className="w-7 h-7 rounded-lg object-cover" />}
                    {selectedBusiness && !selectedBusiness.image && <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center"><Store className="w-4 h-4 text-gray-400" /></div>}
                    <span className="text-sm font-medium text-gray-700 max-w-[150px] truncate">{selectedBusiness?.name || 'Select Business'}</span>
                    {selectedBusiness && getStatusBadge(selectedBusiness._status)}
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${businessSelectorOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {businessSelectorOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                      <div className="p-2 max-h-96 overflow-y-auto">
                        {unifiedBusinesses.length === 0 && (
                          <div className="p-4 text-center text-sm text-gray-500">No businesses yet</div>
                        )}
                        {unifiedBusinesses.map(b => (
                          <button key={b.id} onClick={() => {
                            setSelectedBusinessId(b.id);
                            setBusinessSelectorOpen(false);
                            if (b._source === 'pending') setActiveTab('submissions');
                          }} className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${b.id === selectedBusinessId ? 'bg-teal-50 border border-teal-200' : 'hover:bg-gray-50'}`}>
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                              {b.image ? <img src={b.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Store className="w-5 h-5 text-gray-300" /></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-gray-400 truncate">{b.location || b.category}</p>
                                {getStatusBadge(b._status)}
                              </div>
                            </div>
                            {b.id === selectedBusinessId && <CheckCircle className="w-4 h-4 text-teal-600 flex-shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}


            {/* ═══ DEAL EXPIRY WARNING BANNER ═══ */}
            {user && hasApprovedBusinesses && !ownerDataLoading && (
              <DealExpiryWarningBanner
                userId={user.id}
                onUpdateDeal={(businessId: string) => {
                  // Select the business with the expiring deal
                  const targetBiz = unifiedBusinesses.find(b => b.id === businessId);
                  if (targetBiz) {
                    setSelectedBusinessId(businessId);
                  }
                  // Set initial section to pricing and switch to edit tab
                  setActiveTab('edit');
                  toast.info('Switched to Edit listing — scroll to Pricing & discount dates in the form below.');
                }}
              />
            )}

            {/* First listing onboarding — hidden once a live offering exists; uses `businessOwnerHasBusinessRow` + offerings. */}
            <div
              className={`transition-[max-height,opacity,margin,padding] duration-300 ease-out motion-reduce:transition-none ${
                showBusinessOnboardingStepper
                  ? 'mb-6 max-h-[min(28rem,100vh)] opacity-100'
                  : 'pointer-events-none mb-0 max-h-0 overflow-hidden opacity-0 py-0'
              }`}
              aria-hidden={!showBusinessOnboardingStepper}
            >
              <div
                className={`rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/90 to-teal-50/70 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300 ${
                  showBusinessOnboardingStepper ? 'p-3 sm:p-4' : 'p-0'
                }`}
              >
                <OnboardingSteps
                  currentStep={businessOnboardingStepperState.currentStep}
                  completedSteps={businessOnboardingStepperState.completedSteps}
                  variant="compact"
                  language={language}
                />
              </div>
            </div>

            {/* No Businesses Empty State — only show on non-overview tabs */}
            {!hasAnyBusinesses && !ownerDataLoading && activeTab !== 'overview' && activeTab !== 'submit' && activeTab !== 'submissions' && activeTab !== 'emails' && (
              <div className="max-w-lg mx-auto text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center border border-teal-100"><Store className="w-10 h-10 text-teal-500" /></div>
                <h2 className="text-xl font-bold text-gray-900 mb-3">Welcome to Your Business Hub</h2>
                <p className="text-gray-500 mb-2">You haven't submitted any business listings yet.</p>
                <p className="text-sm text-gray-400 mb-8">Get started by submitting your first business listing for approval.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button onClick={() => setActiveTab('submit')} className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200 flex items-center gap-2"><Plus className="w-5 h-5" />Submit New Listing</button>
                </div>
              </div>
            )}

            {ownerDataLoading && activeTab !== 'submit' && activeTab !== 'emails' && (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-teal-500 animate-spin" /><span className="ml-3 text-sm text-gray-500">Loading your businesses...</span></div>
            )}

            {/* Tab Content */}
            {/* Overview tab — approved business: scanner-first Simple Hub */}
            {activeTab === 'overview' && selectedBusiness && selectedIsApproved && (
              <BusinessSimpleHub
                profileCompanyName={profileCompanyMeta.name || selectedBusiness?.name || 'Business'}
                profileLogoUrl={profileCompanyMeta.logo}
                profileBusinessId={resolvedProfileBusinessId || selectedProfileId}
                listingOptions={approvedListingsSameProfile.map((b) => {
                  const orig = Number(b.originalPrice) || 0;
                  const deal = Number(b.dealPrice) || 0;
                  const discountPercent =
                    orig > 0 && deal > 0 && deal < orig
                      ? Math.round(((orig - deal) / orig) * 100)
                      : null;
                  return {
                    id: b.id,
                    name: b.name || 'Listing',
                    image: b.image,
                    isProfileRow: String(b.id) === String(selectedProfileId),
                    discountPercent,
                  };
                })}
                selectedListingId={selectedBusinessId}
                onSelectListing={setSelectedBusinessId}
                reviewCount={businessReviews.length}
                submissionBadge={submissionsBadge}
                hasBusinessProfile={Boolean(resolvedProfileBusinessId)}
                onSwitchTab={(tab) => setActiveTab(tab as DashboardTab)}
                offerDiscountPercent={
                  selectedBusiness?.originalPrice > 0 &&
                  selectedBusiness?.dealPrice > 0 &&
                  selectedBusiness.dealPrice < selectedBusiness.originalPrice
                    ? Math.round(
                        ((selectedBusiness.originalPrice - selectedBusiness.dealPrice) /
                          selectedBusiness.originalPrice) *
                          100,
                      )
                    : 20
                }
              />
            )}
            {activeTab === 'profile' && resolvedProfileBusinessId && (
              <BusinessProfileSettings
                profileBusinessId={resolvedProfileBusinessId}
                profileDisplayName={
                  approvedListingsSameProfile.find((b) => String(b.id) === String(selectedProfileId))?.name ||
                  selectedBusiness?.name
                }
              />
            )}
            {activeTab === 'credentials' && resolvedProfileBusinessId && (
              <div className="max-w-3xl mx-auto space-y-4">
                <BusinessCredentialsSettings profileBusinessId={resolvedProfileBusinessId} />
                <p className="text-center text-sm text-gray-500">
                  {language === 'en' ? 'Need to change phone, email, or address?' : language === 'fr' ? 'Modifier téléphone, e-mail ou adresse ?' : 'Nid blong jensem fon, emeil mo adres?'}
                  {' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('profile')}
                    className="font-semibold text-teal-700 hover:text-teal-800 underline-offset-2 hover:underline"
                  >
                    {language === 'en' ? 'Open Business Profile' : language === 'fr' ? 'Ouvrir le profil entreprise' : 'Openem Bisnis profael'}
                  </button>
                </p>
              </div>
            )}
            {activeTab === 'credentials' && !resolvedProfileBusinessId && !ownerDataLoading && (
              renderPendingOnlyNotice(
                language === 'en'
                  ? 'Save your business profile first, then you can upload credentials here.'
                  : language === 'fr'
                    ? 'Enregistrez d’abord votre profil entreprise.'
                    : 'Sevem  profail blong bisnis fastaem mo save aplotem kretensel',
              )
            )}
            {activeTab === 'profile' && !resolvedProfileBusinessId && !ownerDataLoading && (
              renderPendingOnlyNotice(
                language === 'en'
                  ? 'Save your business profile first (complete setup), then you can update phone and contact details here.'
                  : language === 'fr'
                    ? 'Complétez d’abord votre profil entreprise.'
                    : 'Sevem profael blong bisnis fastaem afta u save aptaetem fon mo kontak titels blong yu',
              )
            )}
            {/* Overview tab — pending business OR no businesses at all: show BusinessHomeScreen with 6 action buttons */}
            {activeTab === 'overview' && !ownerDataLoading && (!selectedBusiness || !selectedIsApproved) && (
              <BusinessHomeScreen
                selectedBusiness={selectedBusiness}
                hasApprovedBusinesses={hasApprovedBusinesses}
                hasBusinessProfile={Boolean(resolvedProfileBusinessId)}
                pendingCount={pendingOnlyBusinesses.length}
                reviewCount={businessReviews.length}
                onSwitchTab={(tab) => setActiveTab(tab as DashboardTab)}
              />
            )}


            {activeTab === 'analytics' && selectedBusiness && selectedIsApproved && (
              <>
                {renderHubListingSwitcher('analytics')}
                <Suspense
                  fallback={
                    <div className="flex justify-center py-16">
                      <Loader2 className="h-8 w-8 text-teal-500 animate-spin" aria-hidden />
                    </div>
                  }
                >
                  <DashboardAnalytics selectedBusiness={selectedBusiness as any} />
                </Suspense>
              </>
            )}
            {activeTab === 'analytics' && selectedBusiness && !selectedIsApproved && renderPendingOnlyNotice('Analytics are available once your listing is approved.')}
            {activeTab === 'edit' && selectedBusiness && selectedIsApproved && listingEmbeddedEdit && (
              <>
                {renderHubListingSwitcher('edit')}
                <Suspense
                  fallback={
                    <div className="flex justify-center py-16">
                      <Loader2 className="h-8 w-8 text-teal-500 animate-spin" aria-hidden />
                    </div>
                  }
                >
                  <BusinessListingForm
                    key={`edit-${listingEmbeddedEdit.profileBusinessId}-${listingEmbeddedEdit.offeringId || listingEmbeddedEdit.business.id}`}
                    embeddedEdit={listingEmbeddedEdit}
                  />
                </Suspense>
              </>
            )}
            {activeTab === 'edit' && selectedBusiness && !selectedIsApproved && renderPendingOnlyNotice('Editing is available once your listing is approved.')}
            {activeTab === 'reviews' && selectedBusiness && (
              <>
                {selectedIsApproved && renderHubListingSwitcher('reviews')}
                {renderReviewsTab()}
              </>
            )}
            {activeTab === 'photos' && selectedBusiness && (
              <>
                {selectedIsApproved && renderHubListingSwitcher('photos')}
                {renderPhotosTab()}
              </>
            )}
            {activeTab === 'submit' && renderSubmitTab()}
            {activeTab === 'submissions' && (<MySubmissions onNewStatusChange={setUnseenSubmissionChanges} />)}
            {activeTab === 'emails' && (<EmailNotificationCenter mode={user?.type === 'admin' ? 'admin' : 'business'} />)}
          </div>
        </div>
      </div>

    </div>
  );
};

export default BusinessOwnerDashboard;

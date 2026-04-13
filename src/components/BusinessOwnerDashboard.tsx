import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { invokeEdgeFunctionWithRetry, RPC_INSERT_PENDING_TIMEOUT_MS } from '@/lib/edgeInvoke';
import { toast } from 'sonner';
import { businesses as localBusinesses } from '@/data/businesses';
import {
  Store, Edit3, BarChart3, MessageSquare, Image, Power,
  Save, X, ChevronRight, TrendingUp, Users, DollarSign,
  Eye, Clock, Star, Send, Upload, Plus, Loader2,
  CheckCircle, XCircle, AlertCircle, FileText, ArrowUpRight,
  ArrowDownRight, Calendar, MapPin, Phone, Mail, Tag, Trash2,
  RefreshCw, ShieldCheck, History, ArrowRight, Info, ClipboardList,
  BellRing, ChevronDown, LayoutDashboard, Menu, ArrowLeft,
  Sparkles, Settings, LogOut, Zap, Wifi, ScanLine
} from 'lucide-react';
import EmailNotificationCenter from './EmailNotificationCenter';
import PhotoUploader, { UploadedPhoto } from './PhotoUploader';
import MySubmissions from './MySubmissions';
import DashboardOverview from './DashboardOverview';
import DashboardAnalytics from './DashboardAnalytics';
import EditListingPanel from './EditListingPanel';
import PricingDiscountFields, { DURATION_OPTIONS, addDays, todayStr } from './PricingDiscountFields';
import QRScanner from './QRScanner';
import BusinessHomeScreen from './BusinessHomeScreen';
import DealExpiryWarningBanner from './DealExpiryWarningBanner';
import BusinessListingForm from './BusinessListingForm';
import PricingTiersEditor from './PricingTiersEditor';
import {
  categoryUsesTieredPricing,
  validatePricingTiersForSubmit,
  pricingTiersFromDb,
  type PricingTierInput,
} from '@/lib/pricingTiers';
import { normalizeWebsiteForStorage } from '@/lib/urlHelpers';
import {
  hasMeaningfulDescriptionContent,
  plainTextFromHtml,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT,
} from '@/lib/businessDescriptionHtml';
import BusinessDescriptionEditor from './BusinessDescriptionEditor';
import { effectiveProfileBusinessId } from '@/lib/businessOfferingMap';

const DASHBOARD_LISTING_SUBMIT_DEADLINE_MS = 240_000;

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
  /** From `business_offerings.pricing_tiers` (or profile fallback); drives edit-listing tier editor. */
  pricingTiers?: unknown;
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
    name: String(o.title || profile.name || 'Offer'),
    category: String(profile.category || 'dining'),
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
    hours: String(profile.hours ?? profile.opening_hours ?? ''),
    phone: String(profile.phone ?? ''),
    tags: Array.isArray(o.tags) ? (o.tags as string[]) : Array.isArray(profile.tags) ? (profile.tags as string[]) : [],
    featured: Boolean(o.featured) || Boolean(profile.featured),
    ownerId: (profile.owner_id as string) || null,
    pricingTiers: o.pricing_tiers ?? null,
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
    image: String((b.image as string) || (b.image_url as string) || ''),
    rating: Number(b.rating) || 0,
    reviewCount: Number(b.review_count) || 0,
    discount: String((b.discount as string) || (b.deal as string) || ''),
    originalPrice: Number(b.original_price) || 0,
    dealPrice: Number(b.deal_price) || Number(b.discounted_price) || 0,
    location: String(b.location ?? ''),
    lat: Number(b.lat) || 0,
    lng: Number(b.lng) || 0,
    hours: String((b.hours as string) || (b.opening_hours as string) || ''),
    phone: String(b.phone ?? ''),
    tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
    featured: Boolean(b.featured),
    ownerId: (b.owner_id as string) || null,
    pricingTiers: b.pricing_tiers ?? null,
    _source: 'approved',
    _status: 'approved',
    _createdAt: b.created_at as string | undefined,
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
      .select('*, businesses(*)')
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

type DashboardTab = 'overview' | 'submissions' | 'edit' | 'analytics' | 'reviews' | 'photos' | 'submit' | 'emails';

const BusinessOwnerDashboard: React.FC = () => {
  const { user, userProfile, language, dbBusinesses, dbReviews, setCurrentView, signOut, refreshBusinesses } = useAppContext();

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [reviewResponses, setReviewResponses] = useState<ReviewResponse[]>([]);
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [pendingBusinesses, setPendingBusinesses] = useState<any[]>([]);
  const [unseenSubmissionChanges, setUnseenSubmissionChanges] = useState(0);
  const [businessSelectorOpen, setBusinessSelectorOpen] = useState(false);
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [editInitialSection, setEditInitialSection] = useState<'basic' | 'pricing' | 'contact' | 'media' | undefined>(undefined);



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
      if (['submit', 'submissions', 'overview', 'edit', 'analytics', 'reviews', 'photos', 'emails'].includes(tab)) {
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

  // Pre-fill form when resubmitting a rejected submission (once per submission)
  const lastResubmitIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (resubmitSubmission && activeTab === 'submit' && lastResubmitIdRef.current !== resubmitSubmission.id) {
      lastResubmitIdRef.current = resubmitSubmission.id;
      const s = resubmitSubmission;
      const orig = Number(s.original_price) || 0;
      const deal = Number(s.deal_price) || 0;
      const pct = orig > 0 && deal > 0 ? Math.round((1 - deal / orig) * 100) : 0;
      setSubmitForm({
        name: s.name || '',
        category: s.category || 'dining',
        description: s.description || '',
        discount: s.discount || '',
        originalPrice: orig > 0 ? String(orig) : '',
        discountPercent: pct > 0 ? String(pct) : '',
        dealPrice: deal > 0 ? String(deal) : '',
        location: s.location || '',
        phone: s.phone || '',
        email: s.email || '',
        hours: s.hours || '',
        image: s.image || '',
        whatsappNumber: s.whatsapp_number || '',
        mapUrl: s.map_url || '',
        website: s.website || '',
        discountValidFrom: s.discount_valid_from ? s.discount_valid_from.split('T')[0] : todayStr(),
        listingDuration: '1_month',
      });
      setSubmitPhotos([]);
      setPricingTiers(pricingTiersFromDb(s.pricing_tiers));
    }
    if (!resubmitSubmission) lastResubmitIdRef.current = null;
  }, [resubmitSubmission, activeTab]);

  useEffect(() => {
    if (!resubmitSubmission) setPricingTiers([]);
  }, [resubmitSubmission]);

  useEffect(() => {
    if (!categoryUsesTieredPricing(submitForm.category)) setPricingTiers([]);
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
        if (unified.length > 0 && !selectedBusinessId) {
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

      if (unified.length > 0 && !selectedBusinessId) {
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

        if (unified.length > 0 && !selectedBusinessId) {
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
  }, [user, selectedBusinessId]);

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

  const selectedBusiness = unifiedBusinesses.find(b => b.id === selectedBusinessId) || (hasAnyBusinesses ? unifiedBusinesses[0] : null);
  const selectedIsApproved = selectedBusiness?._source === 'approved';
  const selectedProfileId = useMemo(() => {
    if (!selectedBusiness || selectedBusiness._source !== 'approved') return '';
    return effectiveProfileBusinessId(selectedBusiness);
  }, [selectedBusiness]);

  useEffect(() => {
    if (unifiedBusinesses.length > 0 && !selectedBusinessId) {
      const firstApproved = unifiedBusinesses.find(b => b._source === 'approved');
      setSelectedBusinessId(firstApproved?.id || unifiedBusinesses[0].id);
    }
  }, [unifiedBusinesses, selectedBusinessId]);

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
      const { data, error } = await supabase
        .from('business_photos')
        .select('*')
        .eq('business_id', selectedProfileId)
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
      const photoRecords = newGalleryPhotos.map((photo, index) => ({
        business_id: selectedProfileId, url: photo.url, file_path: photo.filePath,
        uploaded_by: user.id, is_main: galleryPhotos.length === 0 && index === 0,
      }));
      const { error } = await supabase.from('business_photos').insert(photoRecords);
      if (error) throw error;
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

  const businessReviews = dbReviews.filter(
    r => selectedProfileId && r.business_id === selectedProfileId,
  );

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

      const { data, error } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'submit_edit', userId: user.id, businessId: selectedProfileId, changes },
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

    // Only name and description are required
    if (!submitForm.name.trim() || !hasMeaningfulDescriptionContent(submitForm.description)) {
      toast.error('Please fill in the required fields (business name and description)');
      return;
    }

    const submitDescPlainLen = plainTextFromHtml(submitForm.description).length;
    if (submitDescPlainLen > BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX) {
      toast.error(
        language === 'en'
          ? `Description must be ${BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} characters or fewer (plain text).`
          : `La description doit comporter au plus ${BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} caractères (texte brut).`,
      );
      return;
    }

    // If discount fields are provided, validate them
    const hasDiscountFields = submitForm.originalPrice || submitForm.discountPercent;
    let origPrice = 0;
    let dlPrice = 0;

    if (hasDiscountFields) {
      const pct = Number(submitForm.discountPercent);
      origPrice = Number(submitForm.originalPrice);

      if (submitForm.discountPercent && (isNaN(pct) || pct <= 0 || pct >= 100)) {
        toast.error('Discount must be between 1% and 99%');
        return;
      }
      if (submitForm.originalPrice && (isNaN(origPrice) || origPrice <= 0)) {
        toast.error('Please enter a valid original price greater than 0');
        return;
      }

      dlPrice = Number(submitForm.dealPrice);
      if (origPrice > 0 && dlPrice > 0 && dlPrice >= origPrice) {
        toast.error('Deal price should be less than the original price');
        return;
      }
    } else {
      origPrice = Number(submitForm.originalPrice) || 0;
      dlPrice = Number(submitForm.dealPrice) || 0;
    }

    let tiersPayload: unknown[] | null = null;
    if (categoryUsesTieredPricing(submitForm.category)) {
      const { data, error: tierErr } = validatePricingTiersForSubmit(pricingTiers);
      if (tierErr) {
        toast.error(tierErr);
        return;
      }
      tiersPayload = data;
    }

    setLoading(true);
    const submitDeadlineMsg =
      language === 'en'
        ? 'Submit timed out. Check your connection, sign out and back in, then try again.'
        : 'Délai de soumission dépassé. Vérifiez la connexion ou reconnectez-vous.';
    try {
      await Promise.race([
        (async () => {
      const normalizedWebsite = normalizeWebsiteForStorage(submitForm.website) ?? null;
      const mainImageUrl = submitPhotos.length > 0 ? submitPhotos[0].url : submitForm.image;

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
            discount: submitForm.discount || '',
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
            p_discount: submitForm.discount || '',
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
          discount: submitForm.discount || '',
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
    
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-lg mx-auto px-4 text-center pt-20">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-orange-50 flex items-center justify-center">
            <Store className="w-10 h-10 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Business Account Required</h2>
          <p className="text-gray-500 mb-6">You need a business account to access this dashboard.</p>
          <button onClick={() => setCurrentView('home')} className="px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors">
            Go Home
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
  const navItems: { key: DashboardTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" /> },
    { key: 'submissions', label: 'My Submissions', icon: <ClipboardList className="w-5 h-5" />, badge: unseenSubmissionChanges > 0 ? String(unseenSubmissionChanges) : (allSubmissions.length > 0 ? String(allSubmissions.length) : undefined) },
    { key: 'edit', label: 'Edit Listing', icon: <Edit3 className="w-5 h-5" />, badge: currentPendingEdit ? '!' : undefined },
    { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" /> },
    { key: 'reviews', label: 'Reviews', icon: <MessageSquare className="w-5 h-5" /> },
    { key: 'photos', label: 'Photos', icon: <Image className="w-5 h-5" /> },
    { key: 'emails', label: 'Emails', icon: <Mail className="w-5 h-5" /> },
    { key: 'submit', label: 'New Listing', icon: <Plus className="w-5 h-5" /> },
  ];

  const handleNavClick = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
  };

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
            {navItems.map(item => (
              <button key={item.key} type="button" onClick={() => handleNavClick(item.key)} className={`w-full flex min-h-11 items-center gap-3 rounded-xl transition-all relative ${sidebarCollapsed && !isMobile ? 'justify-center px-3 py-3' : 'px-3.5 py-2.5'} ${activeTab === item.key ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 font-semibold shadow-sm border border-teal-100' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`} title={sidebarCollapsed && !isMobile ? item.label : undefined}>
                <span className={activeTab === item.key ? 'text-teal-600' : 'text-gray-400'}>{item.icon}</span>
                {(!sidebarCollapsed || isMobile) && <span className="text-sm flex-1 text-left">{item.label}</span>}
                {item.badge && (!sidebarCollapsed || isMobile) && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === item.key ? 'bg-teal-200 text-teal-800' : 'bg-orange-100 text-orange-600'}`}>{item.badge}</span>}
                {item.badge && sidebarCollapsed && !isMobile && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white" />}
              </button>
            ))}
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
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Customer Reviews ({businessReviews.length})</h3>
          <div className="flex items-center gap-2 text-sm text-gray-500"><Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /><span className="font-bold text-gray-900">{selectedBusiness?.rating}</span> average</div>
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
                          <button onClick={() => handleDeleteGalleryPhoto(photo)} disabled={deletingPhotoId === photo.id} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 flex items-center gap-1 disabled:opacity-50">{deletingPhotoId === photo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Delete</button>
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
            <PhotoUploader photos={newGalleryPhotos} onPhotosChange={setNewGalleryPhotos} maxPhotos={10} maxSizeMB={5} userId={user.id} label="Upload New Promotional Images" sublabel="Drag & drop or click. PNG, JPG up to 5MB each." />
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

    // Standardize "New Listing" with the public List a Business form.
    if (!isResubmit) {
      return <BusinessListingForm />;
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name *</label>
                <input type="text" value={submitForm.name} onChange={(e) => setSubmitForm({ ...submitForm, name: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="e.g. Paradise Beach Bar" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category *</label>
                <select value={submitForm.category} onChange={(e) => setSubmitForm({ ...submitForm, category: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="dining">Dining</option>
                  <option value="activities">Activities</option>
                  <option value="tours">Tours</option>
                  <option value="shopping">Shopping</option>
                  <option value="spa">Spa & Wellness</option>
                  <option value="accommodation">Accommodation</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
              <BusinessDescriptionEditor
                value={submitForm.description}
                onChange={(html) => setSubmitForm({ ...submitForm, description: html })}
                placeholder="Describe your business and what makes it special..."
              />
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
            <PricingDiscountFields
              originalPrice={submitForm.originalPrice}
              discountPercent={submitForm.discountPercent}
              onOriginalPriceChange={(val) => setSubmitForm(prev => ({ ...prev, originalPrice: val }))}
              onDiscountPercentChange={(val) => setSubmitForm(prev => ({ ...prev, discountPercent: val }))}
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
              language={language}
            />

            {categoryUsesTieredPricing(submitForm.category) && (
              <PricingTiersEditor
                tiers={pricingTiers}
                onChange={setPricingTiers}
                language={language}
                discountPercent={tierDiscountPercent}
              />
            )}

            {/* Location & Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
                <input type="text" value={submitForm.location} onChange={(e) => setSubmitForm({ ...submitForm, location: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Port Vila, Vanuatu" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Operating Hours</label>
                <input type="text" value={submitForm.hours} onChange={(e) => setSubmitForm({ ...submitForm, hours: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="9:00 AM - 5:00 PM" />
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Business Photos</label>
              <PhotoUploader photos={submitPhotos} onPhotosChange={setSubmitPhotos} maxPhotos={5} maxSizeMB={5} userId={user.id} label="Upload photos of your business" sublabel="Drag & drop or click. PNG, JPG up to 5MB. First photo = main image." />
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
            <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center"><Store className="w-4 h-4 text-white" /></div><span className="font-bold text-gray-900 text-sm">Dashboard</span></div>
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
          <div className="pt-20 lg:pt-8 pb-28 lg:pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto min-w-0">
            {/* Desktop Header */}
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
                  setEditInitialSection('pricing');
                  setActiveTab('edit');
                  toast.info('Switched to Edit Listing — update your deal dates in the Pricing section.');
                }}
              />
            )}

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
            {/* Overview tab — approved business: show full DashboardOverview */}
            {activeTab === 'overview' && selectedBusiness && selectedIsApproved && (
              <DashboardOverview selectedBusiness={selectedBusiness as any} totalRedemptions={totalRedemptions} totalRevenue={totalRevenue} businessReviews={businessReviews} pendingBusinesses={pendingBusinesses} currentPendingEdit={currentPendingEdit} onSwitchTab={(tab) => setActiveTab(tab as DashboardTab)} onToggleActive={handleToggleActive} onOpenScanner={() => setShowScanner(true)} />
            )}
            {/* Overview tab — pending business OR no businesses at all: show BusinessHomeScreen with 6 action buttons */}
            {activeTab === 'overview' && !ownerDataLoading && (!selectedBusiness || !selectedIsApproved) && (
              <BusinessHomeScreen
                selectedBusiness={selectedBusiness}
                hasApprovedBusinesses={hasApprovedBusinesses}
                pendingCount={pendingOnlyBusinesses.length}
                reviewCount={businessReviews.length}
                onSwitchTab={(tab) => setActiveTab(tab as DashboardTab)}
                onOpenScanner={() => setShowScanner(true)}
              />
            )}


            {activeTab === 'analytics' && selectedBusiness && selectedIsApproved && (<DashboardAnalytics selectedBusiness={selectedBusiness as any} />)}
            {activeTab === 'analytics' && selectedBusiness && !selectedIsApproved && renderPendingOnlyNotice('Analytics are available once your listing is approved.')}
            {activeTab === 'edit' && selectedBusiness && selectedIsApproved && (
              <EditListingPanel
                selectedBusiness={selectedBusiness as any}
                onToggleActive={handleToggleActive}
                onListingDeleted={handleListingDeleted}
                initialSection={editInitialSection}
              />
            )}
            {activeTab === 'edit' && selectedBusiness && !selectedIsApproved && renderPendingOnlyNotice('Editing is available once your listing is approved.')}
            {activeTab === 'reviews' && selectedBusiness && renderReviewsTab()}
            {activeTab === 'photos' && selectedBusiness && renderPhotosTab()}
            {activeTab === 'submit' && renderSubmitTab()}
            {activeTab === 'submissions' && (<MySubmissions onNewStatusChange={setUnseenSubmissionChanges} />)}
            {activeTab === 'emails' && (<EmailNotificationCenter mode={user?.type === 'admin' ? 'admin' : 'business'} />)}
          </div>
        </div>
      </div>

      {/* Floating Action Button - Scan QR Code */}
      <button
        onClick={() => setShowScanner(true)}
        className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold shadow-xl shadow-teal-300/40 hover:shadow-2xl hover:shadow-teal-400/50 hover:from-teal-500 hover:to-emerald-500 active:scale-95 transition-all duration-200"
        title="Scan Tourist QR Code"
      >
        <div className="relative">
          <ScanLine className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400" />
        </div>
        <span className="text-sm hidden sm:inline">Scan QR</span>
      </button>

      {showScanner && (
        <QRScanner
          onClose={() => setShowScanner(false)}
          preferredBusinessId={
            selectedBusiness?._source === 'approved'
              ? effectiveProfileBusinessId(selectedBusiness)
              : null
          }
          preferredOfferingId={
            selectedBusiness?._source === 'approved' ? selectedBusiness.id : null
          }
          preferredBusinessName={selectedBusiness?.name ?? null}
        />
      )}
    </div>
  );
};

export default BusinessOwnerDashboard;

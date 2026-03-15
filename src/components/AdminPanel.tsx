import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses as hardcodedBusinesses, Business } from '@/data/businesses';

import { supabase, SUPABASE_URL } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  BarChart3, Users, TrendingUp, DollarSign, Store, Eye, Download,
  Plus, Search, Filter, ChevronDown, ArrowUpRight, ArrowDownRight,
  CheckCircle, XCircle, AlertCircle, Clock, FileText, MessageSquare,
  Image as ImageIcon, Calendar, Loader2, RefreshCw, Edit3, ArrowRight,
  Wifi, WifiOff, Mail, Trash2, AlertTriangle, X, MapPin, Phone, Tag, Save,
  Globe, Percent, CreditCard
} from 'lucide-react';
import { formatVT, getPhotoDisplayUrl } from '@/lib/utils';
import PricingDiscountFields from './PricingDiscountFields';

import EmailReceiptManager from './EmailReceiptManager';
import EmailNotificationCenter from './EmailNotificationCenter';
import PassEditor from './PassEditor';
import AdminPurchaseOverview from './AdminPurchaseOverview';
import AdminUserManager from './AdminUserManager';





import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart
} from 'recharts';

interface PendingBusiness {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  description: string;
  discount: string;
  original_price: number;
  deal_price: number;
  location: string;
  phone: string;
  email: string;
  hours: string;
  image: string;
  status: string;
  created_at: string;
  discount_valid_from?: string;
  discount_valid_until?: string;
}

interface BusinessPhoto {
  id: string;
  business_id: string;
  url: string;
  file_path: string;
  uploaded_by: string;
  is_main: boolean;
  status: string;
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


const AdminPanel: React.FC = () => {
  const { language, user, refreshBusinesses, dbBusinesses } = useAppContext();

  const [activeTab, setActiveTab] = useState<'overview' | 'businesses' | 'approvals' | 'users' | 'passes' | 'emails' | 'reports'>('overview');




  const [searchBiz, setSearchBiz] = useState('');
  const [pendingBusinesses, setPendingBusinesses] = useState<PendingBusiness[]>([]);
  const [businessPhotos, setBusinessPhotos] = useState<Record<string, BusinessPhoto[]>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingPhotoId, setProcessingPhotoId] = useState<string | null>(null);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Pending edits state
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [loadingEdits, setLoadingEdits] = useState(false);
  const [processingEditId, setProcessingEditId] = useState<string | null>(null);
  const [editAdminNotes, setEditAdminNotes] = useState<Record<string, string>>({});

  // Delete business state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Add Business modal state ───
  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [addingBusiness, setAddingBusiness] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', category: 'dining', description: '', discount: '',
    originalPrice: '', discountPercent: '', dealPrice: '', location: 'Port Vila, Vanuatu',
    phone: '', email: '', hours: '', image: '',
    mapUrl: '', website: '',
    discountValidFrom: new Date().toISOString().split('T')[0],
    listingDuration: '1_month',
  });

  // ─── Edit Business modal state ───
  const [editBusinessId, setEditBusinessId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', category: '', description: '', discount: '',
    originalPrice: '', discountPercent: '', dealPrice: '', location: '',
    phone: '', email: '', hours: '', image: '',
    mapUrl: '', website: '',
    discountValidFrom: new Date().toISOString().split('T')[0],
    listingDuration: '1_month',
  });

  // ─── Preview Business modal state ───
  const [previewBusinessId, setPreviewBusinessId] = useState<string | null>(null);


  // Ref to prevent duplicate loads
  const loadingRef = useRef(false);
  const retryCountRef = useRef(0);

  // ─── Helper: invoke edge function with retry + rate-limit awareness ───
  const invokeWithRetry = async (fnName: string, body: any, maxRetries = 2, label = ''): Promise<{ data: any; error: any }> => {
    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s, 4s...
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          console.log('[Admin]' + (label ? ' ' + label : '') + ' Retry ' + attempt + '/' + maxRetries + ' after ' + delay + 'ms...');
          await new Promise(r => setTimeout(r, delay));
        }
        const result = await supabase.functions.invoke(fnName, { body });

        // Check if the error is a rate-limit (429) or other HTTP error
        if (result.error) {
          const errMsg = result.error?.message || '';
          // Try to extract the actual response body for better error messages
          let detailedMessage = errMsg;
          try {
            if (result.error?.context && typeof result.error.context.json === 'function') {
              const responseBody = await result.error.context.json();
              if (responseBody?.error) detailedMessage = responseBody.error;
              if (responseBody?.retryAfter) {
                // Rate limited — wait the specified time before retrying
                const waitMs = (responseBody.retryAfter || 60) * 1000;
                console.warn('[Admin] Rate limited. Retry-After: ' + responseBody.retryAfter + 's');
                if (attempt < maxRetries) {
                  await new Promise(r => setTimeout(r, waitMs));
                  continue;
                }
                lastError = new Error('Rate limited. Please wait ' + responseBody.retryAfter + ' seconds and try again.');
                continue;
              }
            }
          } catch (_) {
            // Could not parse response body — use original message
          }

          // Check for common rate-limit indicators in the error message
          if (errMsg.includes('non-2xx') || errMsg.includes('429')) {
            lastError = new Error(detailedMessage !== errMsg ? detailedMessage : 'Server temporarily unavailable. Please try again in a moment.');
          } else {
            lastError = result.error;
          }
          console.warn('[Admin]' + (label ? ' ' + label : '') + ' ' + fnName + ' attempt ' + attempt + ' error:', detailedMessage);
          continue;
        }
        return result;
      } catch (err: any) {
        lastError = err;
        console.warn('[Admin]' + (label ? ' ' + label : '') + ' ' + fnName + ' attempt ' + attempt + ' threw:', err.message);
      }
    }
    return { data: null, error: lastError };
  };


  // ─── Load pending businesses ───
  // Strategy 1: RPC (bypasses RLS, most reliable for admins)
  // Strategy 2: Edge Function
  // Strategy 3: Direct query (may be blocked by RLS if policies missing)
  const loadPending = useCallback(async (showToast = false) => {
    if (!user || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingPending(true);
    try {
      // Strategy 1: RPC — bypasses RLS, guaranteed to work for admins
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_pending_businesses_for_admin');
      if (!rpcError && Array.isArray(rpcData)) {
        setPendingBusinesses((rpcData || []) as PendingBusiness[]);
        loadAllPhotos((rpcData || []) as PendingBusiness[]);
        if (showToast) toast.success(`Loaded ${(rpcData || []).length} pending submission(s)`);
        setLastRefreshed(new Date());
        retryCountRef.current = 0;
        return;
      }

      // Strategy 2: Edge Function
      const { data, error } = await invokeWithRetry('manage-business', {
        action: 'get_pending', userId: user.id, isAdmin: true,
      });
      if (data?.businesses && Array.isArray(data.businesses)) {
        const pendingOnly = data.businesses.filter((b: PendingBusiness) => b.status === 'pending');
        setPendingBusinesses(pendingOnly);
        loadAllPhotos(pendingOnly);
        if (showToast) toast.success(`Loaded ${pendingOnly.length} pending submission(s)`);
        setLastRefreshed(new Date());
        retryCountRef.current = 0;
        return;
      }

      // Strategy 3: Direct query fallback
      await loadPendingDirect(showToast);
    } catch (err: any) {
      await loadPendingDirect(showToast);
    } finally {
      setLoadingPending(false);
      loadingRef.current = false;
    }
  }, [user]);

  const loadPendingDirect = useCallback(async (showToast = false) => {
    try {
      const { data, error } = await supabase.from('pending_businesses').select('*').eq('status', 'pending').order('created_at', { ascending: false });
      if (error) { if (pendingBusinesses.length === 0) toast.error('Could not load submissions.'); return; }
      if (data && data.length > 0) {
        setPendingBusinesses(data as PendingBusiness[]);
        loadAllPhotosDirect();
        if (showToast) toast.success(`Loaded ${data.length} pending submission(s)`);
      } else {
        setPendingBusinesses([]);
      }
      setLastRefreshed(new Date());
    } catch (err) { console.error('[Admin] Direct fallback failed:', err); }
  }, []);

  const loadAllPhotos = async (businesses: PendingBusiness[]) => {
    const groupPhotos = (photos: BusinessPhoto[]) => {
      const grouped: Record<string, BusinessPhoto[]> = {};
      for (const photo of photos) {
        const key = String(photo.business_id ?? '');
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(photo);
      }
      return grouped;
    };

    // Strategy 1: Direct DB query (admin RLS allows reading all photos)
    try {
      const { data, error } = await supabase
        .from('business_photos')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        setBusinessPhotos(groupPhotos(data as BusinessPhoto[]));
        return;
      }
    } catch (err) {
      console.warn('[Admin] Direct photo load failed:', err);
    }

    // Strategy 2: Edge Function fallback
    try {
      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: { action: 'get_all_photos', userId: user?.id },
      });
      if (!error && data?.photos && data.photos.length > 0) {
        setBusinessPhotos(groupPhotos(data.photos));
      } else if (businesses.length > 0) {
        setBusinessPhotos({});
      }
    } catch (err) {
      console.warn('[Admin] get_all_photos failed:', err);
      setBusinessPhotos({});
    }
  };

  const loadAllPhotosDirect = async () => {
    try {
      const { data, error } = await supabase
        .from('business_photos')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) return;
      if (data && data.length > 0) {
        const grouped: Record<string, BusinessPhoto[]> = {};
        for (const photo of data) {
          const key = String((photo as BusinessPhoto).business_id ?? '');
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(photo as BusinessPhoto);
        }
        setBusinessPhotos(grouped);
      }
    } catch (err) {
      console.error('[Admin] Direct photo fallback failed:', err);
    }
  };

  // Per-card photo fetch: when a pending business has no photos in state, refetch for that id
  const photoFetchRequestedRef = useRef<Set<string>>(new Set());
  const loadPhotosForPendingId = useCallback(async (pendingId: string) => {
    if (!pendingId || photoFetchRequestedRef.current.has(pendingId)) return;
    photoFetchRequestedRef.current.add(pendingId);
    try {
      const { data, error } = await supabase
        .from('business_photos')
        .select('*')
        .eq('business_id', pendingId)
        .order('created_at', { ascending: true });
      if (error) return;
      if (data && data.length > 0) {
        setBusinessPhotos(prev => ({
          ...prev,
          [String(pendingId)]: data as BusinessPhoto[],
        }));
      }
    } catch (err) {
      console.warn('[Admin] Per-card photo fetch failed:', err);
    } finally {
      photoFetchRequestedRef.current.delete(pendingId);
    }
  }, []);

  // When pending list is loaded, ensure we have photos for each biz (refetch if missing)
  const pendingIdsKey = pendingBusinesses.map(b => b.id).join(',');
  useEffect(() => {
    if (pendingBusinesses.length === 0) return;
    pendingBusinesses.forEach(biz => {
      const key = String(biz.id);
      if (!businessPhotos[key]?.length) loadPhotosForPendingId(key);
    });
  }, [pendingIdsKey, loadPhotosForPendingId]);

  const editsLoadedRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    loadPending();
    if (!editsLoadedRef.current) { editsLoadedRef.current = true; loadPendingEdits(); }
  }, [user]);

  const loadPendingEdits = async (showToast = false) => {
    if (!user) return;
    setLoadingEdits(true);
    try {
      // Strategy 1: RPC (bypasses RLS)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_pending_edits_for_admin');
      if (!rpcError && Array.isArray(rpcData)) {
        setPendingEdits((rpcData || []) as PendingEdit[]);
        if (showToast && (rpcData?.length ?? 0) > 0) toast.success(`Loaded ${rpcData.length} pending edit(s)`);
        return;
      }
      // Strategy 2: Edge Function
      const { data, error } = await supabase.functions.invoke('manage-business', { body: { action: 'get_pending_edits', userId: user.id, isAdmin: true } });
      if (!error && data?.edits && Array.isArray(data.edits)) {
        const pendingOnly = data.edits.filter((e: PendingEdit) => e.status === 'pending');
        setPendingEdits(pendingOnly);
        return;
      }
      await loadPendingEditsDirect(showToast);
    } catch (err) {
      await loadPendingEditsDirect(showToast);
    } finally { setLoadingEdits(false); }
  };

  const loadPendingEditsDirect = async (showToast = false) => {
    try {
      const { data, error } = await supabase.from('pending_edits').select('*').eq('status', 'pending').order('submitted_at', { ascending: false });
      if (error) { toast.error('Could not load listing edits.'); return; }
      if (data) { setPendingEdits(data as PendingEdit[]); if (showToast) toast.success(`Loaded ${data.length} pending edit(s)`); }
    } catch (err) { toast.error('Failed to load listing edits.'); }
  };

  const handleReviewEdit = async (editId: string, decision: 'approved' | 'rejected') => {
    setProcessingEditId(editId);
    try {
      const { data, error } = await supabase.functions.invoke('manage-business', { body: { action: 'review_edit', userId: user?.id, editId, decision, adminNotes: editAdminNotes[editId] || '' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPendingEdits(prev => prev.filter(e => e.id !== editId));
      toast.success(`Edit ${decision === 'approved' ? 'approved and applied' : 'rejected'} successfully!`);
      if (decision === 'approved') { setTimeout(async () => { await refreshBusinesses(); }, 1000); }
    } catch (err: any) { toast.error('Failed to review edit: ' + (err.message || 'Unknown error')); }
    finally { setProcessingEditId(null); }
  };

  const pendingEditCount = pendingEdits.length;

  const handleRefreshBusinesses = useCallback(async () => {
    setLoadingBusinesses(true);
    try { await refreshBusinesses(); } finally { setLoadingBusinesses(false); }
  }, [refreshBusinesses]);

  const handleDeleteBusiness = async (businessId: string) => {
    const biz = allBusinesses.find(b => b.id === businessId);
    const isFromDb = dbBusinesses.some(db => db.id === businessId);
    if (!isFromDb) { toast.error('Sample businesses cannot be deleted.'); setConfirmDeleteId(null); return; }
    setDeletingId(businessId);
    try {
      // Strategy 1: Try edge function with retry (handles rate limiting + transient errors)
      const { data, error } = await invokeWithRetry(
        'manage-business',
        { action: 'admin_delete_business', userId: user?.id, businessId },
        2,
        'delete_business'
      );

      if (data && !data.error) {
        toast.success('"' + (biz?.name || 'Business') + '" has been permanently deleted.');
        await refreshBusinesses();
        return;
      }

      // If edge function returned an error in data, throw it
      if (data?.error) throw new Error(data.error);
      if (error) throw error;

      // If we got here with no data and no error, something unexpected happened
      throw new Error('No response from server');
    } catch (err: any) {
      const errMsg = err?.message || 'Unknown error';
      console.warn('[Admin] Edge function delete failed:', errMsg, '— trying direct DB fallback...');

      // Strategy 2: Direct database deletion fallback
      try {
        // Delete related data first (photos, reviews, favorites, redemptions)
        const tables = ['business_photos', 'reviews', 'favorites', 'redemptions'];
        for (const table of tables) {
          try {
            await supabase.from(table).delete().eq('business_id', businessId);
          } catch (tableErr) {
            console.warn('[Admin] Could not clean ' + table + ':', tableErr);
          }
        }

        // Delete the business itself
        const { error: deleteError } = await supabase
          .from('businesses')
          .delete()
          .eq('id', businessId);

        if (deleteError) throw deleteError;

        toast.success('"' + (biz?.name || 'Business') + '" has been permanently deleted (direct).');
        await refreshBusinesses();
      } catch (directErr: any) {
        console.error('[Admin] Direct DB delete also failed:', directErr);
        // Show a helpful error message based on the original error
        if (errMsg.includes('Rate limited') || errMsg.includes('429') || errMsg.includes('temporarily unavailable')) {
          toast.error('Server is busy. Please wait a moment and try again.', {
            description: 'The server is rate-limiting requests. Try again in 30-60 seconds.',
            duration: 6000,
          });
        } else {
          toast.error('Failed to delete business: ' + (directErr.message || errMsg));
        }
      }
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };


  const handleExportCSV = () => {
    try {
      const headers = ['Name', 'Category', 'Description', 'Discount', 'Original Price', 'Deal Price', 'Location', 'Phone', 'Hours', 'Rating', 'Reviews', 'Source'];
      const rows = allBusinesses.map(b => {
        const isFromDb = dbBusinesses.some(db => db.id === b.id);
        return [`"${(b.name||'').replace(/"/g,'""')}"`,b.category,`"${(b.description||'').replace(/"/g,'""')}"`,b.discount||'',String(b.originalPrice||0),String(b.dealPrice||0),`"${(b.location||'').replace(/"/g,'""')}"`,b.phone||'',`"${(b.hours||'').replace(/"/g,'""')}"`,String(b.rating||0),String(b.reviewCount||0),isFromDb?'Database':'Sample'].join(',');
      });
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `businesses_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      toast.success(`Exported ${allBusinesses.length} businesses to CSV`);
    } catch (err: any) { toast.error('Failed to export businesses'); }
  };

  // ─── Add Business (admin bypass — auto-calculate pricing) ───
  const handleAddBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.description) { toast.error('Please fill in the business name and description.'); return; }
    if (!addForm.originalPrice || !addForm.discountPercent) { toast.error('Please enter the original price and discount percentage.'); return; }
    setAddingBusiness(true);
    try {
      const DURATION_DAYS: Record<string, number> = { '1_day': 1, '1_week': 7, '2_weeks': 14, '1_month': 30, '3_months': 90, '6_months': 180, '1_year': 365 };
      const days = DURATION_DAYS[addForm.listingDuration] || 30;
      const validFrom = addForm.discountValidFrom || new Date().toISOString().split('T')[0];
      const validUntilDate = new Date(validFrom); validUntilDate.setDate(validUntilDate.getDate() + days);
      const validUntil = validUntilDate.toISOString().split('T')[0];

      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: {
          action: 'admin_create_business',
          userId: user?.id,
          name: addForm.name, category: addForm.category, description: addForm.description,
          discount: addForm.discount, originalPrice: Number(addForm.originalPrice) || 0,
          dealPrice: Number(addForm.dealPrice) || 0, location: addForm.location || 'Port Vila, Vanuatu',
          phone: addForm.phone, hours: addForm.hours, image: addForm.image,
          mapUrl: addForm.mapUrl, website: addForm.website,
          discountValidFrom: validFrom, discountValidUntil: validUntil,
          featured: false,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`"${addForm.name}" added to businesses successfully!`);
      setShowAddBusiness(false);
      setAddForm({ name: '', category: 'dining', description: '', discount: '', originalPrice: '', discountPercent: '', dealPrice: '', location: 'Port Vila, Vanuatu', phone: '', email: '', hours: '', image: '', mapUrl: '', website: '', discountValidFrom: new Date().toISOString().split('T')[0], listingDuration: '1_month' });
      await refreshBusinesses();
    } catch (err: any) { toast.error('Failed to add business: ' + (err.message || 'Unknown error')); }
    finally { setAddingBusiness(false); }
  };

  // ─── Open Edit modal ───
  const openEditModal = (bizId: string) => {
    const biz = allBusinesses.find(b => b.id === bizId);
    if (!biz) return;
    const isFromDb = dbBusinesses.some(db => db.id === bizId);
    if (!isFromDb) { toast.error('Sample businesses cannot be edited.'); return; }
    // Reverse-calculate discount percent from original and deal price
    let pct = '';
    if (biz.originalPrice > 0 && biz.dealPrice > 0 && biz.dealPrice < biz.originalPrice) {
      pct = String(Math.round((1 - biz.dealPrice / biz.originalPrice) * 100));
    }
    setEditForm({
      name: biz.name || '', category: biz.category || 'dining', description: biz.description || '',
      discount: biz.discount || '', originalPrice: String(biz.originalPrice || ''), discountPercent: pct,
      dealPrice: String(biz.dealPrice || ''), location: biz.location || '', phone: biz.phone || '',
      email: '', hours: biz.hours || '', image: biz.image || '',
      mapUrl: (biz as any).mapUrl || (biz as any).map_url || '',
      website: (biz as any).website || '',
      discountValidFrom: new Date().toISOString().split('T')[0], listingDuration: '1_month',
    });
    setEditBusinessId(bizId);
  };

  // ─── Save Edit (admin direct) ───
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBusinessId || !editForm.name) { toast.error('Business name is required.'); return; }
    setSavingEdit(true);
    try {
      // Use canonical schema (image, discount, deal_price, hours) to avoid "column not found"
      const updates: Record<string, any> = {
        name: editForm.name, category: editForm.category, description: editForm.description,
        discount: editForm.discount, original_price: Number(editForm.originalPrice) || 0,
        deal_price: Number(editForm.dealPrice) || 0,
        location: editForm.location, phone: editForm.phone,
        hours: editForm.hours,
        map_url: editForm.mapUrl, website: editForm.website,
      };
      if (editForm.image) updates.image = editForm.image;

      const { error } = await supabase.from('businesses').update(updates).eq('id', editBusinessId);
      if (error) throw error;
      toast.success(`"${editForm.name}" updated successfully!`);
      setEditBusinessId(null);
      await refreshBusinesses();
    } catch (err: any) { toast.error('Failed to update business: ' + (err.message || 'Unknown error')); }
    finally { setSavingEdit(false); }
  };




  // ─── Auto-refresh when switching to businesses or approvals tab ───
  // Stagger requests to avoid concurrent edge function call failures
  useEffect(() => {
    if (activeTab === 'businesses') {
      handleRefreshBusinesses();
    }
    if (activeTab === 'approvals') {
      console.log('[Admin] Switched to approvals tab — refreshing (staggered)...');
      loadPending();
      // Stagger the edits load by 300ms to avoid concurrent request failures
      const timer = setTimeout(() => loadPendingEdits(), 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);


  // ─── Real-time subscription for pending_businesses table ───
  useEffect(() => {
    // Subscribe to INSERT/UPDATE events on pending_businesses to auto-detect new submissions
    const channel = supabase
      .channel('admin-pending-businesses-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pending_businesses' },
        (payload) => {
          console.log('[Admin] Real-time: New business submission detected!', payload.new);
          const newBiz = payload.new as PendingBusiness;
          setPendingBusinesses(prev => {
            if (prev.some(b => b.id === newBiz.id)) return prev;
            return [newBiz, ...prev];
          });
          toast.info(`New business submission: "${newBiz.name || 'Unknown'}"`, {
            description: 'A new business listing has been submitted for review.',
            duration: 8000,
          });
          setLastRefreshed(new Date());
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pending_businesses' },
        (payload) => {
          console.log('[Admin] Real-time: Business submission updated', payload.new);
          const updated = payload.new as PendingBusiness;
          // If the status is no longer 'pending', remove it from the approvals list
          if (updated.status !== 'pending') {
            setPendingBusinesses(prev => prev.filter(b => b.id !== updated.id));
            toast.info(`"${updated.name}" has been ${updated.status}`, {
              description: 'Removed from pending approvals.',
              duration: 4000,
            });
          } else {
            // Still pending — update in place (e.g. owner edited the submission)
            setPendingBusinesses(prev =>
              prev.map(b => b.id === updated.id ? updated : b)
            );
          }
        }
      )
      .subscribe((status) => {

        console.log('[Admin] Realtime subscription status:', status);
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  // ─── Polling: refresh every 30s when on approvals tab ───
  useEffect(() => {
    if (activeTab !== 'approvals') return;

    const interval = setInterval(() => {
      console.log('[Admin] Polling: auto-refreshing approvals...');
      loadPending();
      loadPendingEdits();
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [activeTab, loadPending]);

  // ─── Format "last refreshed" time ───
  const formatLastRefreshed = () => {
    if (!lastRefreshed) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - lastRefreshed.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return lastRefreshed.toLocaleTimeString();
  };




  const handleReviewBusiness = async (businessId: string, decision: 'approved' | 'rejected') => {
    setProcessingId(businessId);
    const biz = pendingBusinesses.find(b => b.id === businessId);
    let rpcErrorMsg: string | null = null;
    try {
      // Strategy 1: RPC (bypasses Edge Function, most reliable)
      const { data: rpcData, error: rpcError } = await supabase.rpc('review_pending_business', {
        p_pending_id: businessId,
        p_decision: decision,
        p_admin_notes: adminNotes[businessId] || '',
      });

      if (rpcError) rpcErrorMsg = rpcError.message;

      if (!rpcError && rpcData?.success) {
        setPendingBusinesses(prev => prev.filter(b => b.id !== businessId));
        toast.success(`Business "${biz?.name}" ${decision === 'approved' ? 'approved' : 'rejected'} successfully!`);
        if (decision === 'approved') {
          setTimeout(async () => {
            await refreshBusinesses();
            toast.success('Business list refreshed - new business is now live!');
          }, 1000);
        }
        if (biz?.email) {
          try {
            await supabase.functions.invoke('send-email', {
              body: {
                action: 'send_business_decision',
                owner_id: biz.owner_id || '',
                owner_email: biz.email,
                owner_name: biz.name,
                business_name: biz.name,
                category: biz.category,
                location: biz.location,
                discount: biz.discount,
                decision,
                admin_notes: adminNotes[businessId] || 'No additional notes.',
              },
            });
            toast.success(`Notification email sent to ${biz.email}`);
          } catch (emailErr) {
            console.error('Failed to send decision email:', emailErr);
          }
        }
        return;
      }

      // Strategy 2: Edge Function fallback
      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: {
          action: 'review_business',
          userId: user?.id,
          businessId,
          decision,
          adminNotes: adminNotes[businessId] || '',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPendingBusinesses(prev => prev.filter(b => b.id !== businessId));
      toast.success(`Business "${biz?.name}" ${decision === 'approved' ? 'approved' : 'rejected'} successfully!`);

      if (decision === 'approved') {
        setTimeout(async () => {
          await refreshBusinesses();
          toast.success('Business list refreshed - new business is now live!');
        }, 1000);
      }

      // Send email notification to business owner
      if (biz?.email) {
        try {
          await supabase.functions.invoke('send-email', {
            body: {
              action: 'send_business_decision',
              owner_id: biz.owner_id || '',
              owner_email: biz.email,
              owner_name: biz.name,
              business_name: biz.name,
              category: biz.category,
              location: biz.location,
              discount: biz.discount,
              decision,
              admin_notes: adminNotes[businessId] || 'No additional notes.',
            },
          });
          toast.success(`Notification email sent to ${biz.email}`);
        } catch (emailErr) {
          console.error('Failed to send decision email:', emailErr);
        }
      }
    } catch (err: any) {
      const msg = rpcErrorMsg || err?.message || 'Unknown error';
      toast.error('Failed to process review: ' + msg);
    } finally {
      setProcessingId(null);
    }
  };

  // Handle individual photo approval/rejection
  const handlePhotoReview = async (photoId: string, decision: 'approved' | 'rejected') => {
    setProcessingPhotoId(photoId);
    try {
      const action = decision === 'approved' ? 'approve_photo' : 'reject_photo';
      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: { action, userId: user?.id, photoId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update local state
      setBusinessPhotos(prev => {
        const updated = { ...prev };
        for (const bizId of Object.keys(updated)) {
          updated[bizId] = updated[bizId].map(p =>
            p.id === photoId ? { ...p, status: decision } : p
          );
        }
        return updated;
      });

      toast.success(`Photo ${decision === 'approved' ? 'approved' : 'rejected'}!`);
    } catch (err: any) {
      toast.error('Failed to review photo: ' + (err.message || 'Unknown error'));
    } finally {
      setProcessingPhotoId(null);
    }
  };

  // Bulk photo actions
  const handleBulkPhotoReview = async (photos: BusinessPhoto[], decision: 'approved' | 'rejected') => {
    const pendingPhotos = photos.filter(p => p.status === 'pending');
    for (const p of pendingPhotos) {
      await handlePhotoReview(p.id, decision);
    }
  };


  const pendingCount = pendingBusinesses.length;


  // Merge hardcoded businesses with DB businesses (DB takes priority, deduplicate by id)
  const allBusinesses = (() => {
    const dbIds = new Set(dbBusinesses.map(b => b.id));
    const fromHardcoded = hardcodedBusinesses.filter(b => !dbIds.has(b.id));
    return [...dbBusinesses, ...fromHardcoded];
  })();

  const filteredBiz = allBusinesses.filter(b =>
    b.name.toLowerCase().includes(searchBiz.toLowerCase()) ||
    b.category.toLowerCase().includes(searchBiz.toLowerCase())
  );



  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm">
              {language === 'en' ? 'Manage businesses, analytics, and reports' : 'Gérer les entreprises, analyses et rapports'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />
              Export
            </button>
            <button onClick={() => setShowAddBusiness(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add Business
            </button>

          </div>
        </div>

        {/* Tabs */}
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 mb-8 w-fit overflow-x-auto">
          {(['overview', 'businesses', 'approvals', 'users', 'passes', 'emails', 'reports'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize relative whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab === 'users' && <Users className="w-3.5 h-3.5" />}
              {tab === 'emails' && <Mail className="w-3.5 h-3.5" />}
              {tab === 'passes' && <CreditCard className="w-3.5 h-3.5" />}
              {tab}
              {tab === 'approvals' && (pendingCount + pendingEditCount) > 0 && (
                <span className={`absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  activeTab === tab ? 'bg-white text-teal-600' : 'bg-red-500 text-white animate-pulse'
                }`}>
                  {pendingCount + pendingEditCount}
                </span>
              )}

            </button>
          ))}
        </div>


        {/* ═══ PASSES TAB ═══ */}
        {activeTab === 'passes' && (
          <PassEditor />
        )}

        {/* ═══ USERS TAB ═══ */}
        {activeTab === 'users' && (
          <AdminUserManager />
        )}





        {activeTab === 'overview' && (
          <AdminPurchaseOverview
            totalBusinesses={allBusinesses.length}
            dbBusinessCount={dbBusinesses.length}
          />
        )}



        {/* ═══ BUSINESSES TAB ═══ */}
        {activeTab === 'businesses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchBiz}
                  onChange={(e) => setSearchBiz(e.target.value)}
                  placeholder="Search businesses..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 font-medium">
                  {filteredBiz.length} businesses ({dbBusinesses.length} from DB, {hardcodedBusinesses.length} sample)
                </span>
                <button
                  onClick={handleRefreshBusinesses}
                  disabled={loadingBusinesses}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBusinesses ? 'animate-spin' : ''}`} />
                  {loadingBusinesses ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>

            {loadingBusinesses && dbBusinesses.length === 0 ? (
              <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-500">Loading businesses from database...</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Business</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Category</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Rating</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Discount</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Source</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredBiz.map(biz => {
                        const isFromDb = dbBusinesses.some(db => db.id === biz.id);
                        return (
                          <tr key={biz.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                {biz.image ? (
                                  <img src={biz.image} alt={biz.name} className="w-10 h-10 rounded-lg object-cover" />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                    <Store className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{biz.name}</p>
                                  <p className="text-xs text-gray-400">{biz.location}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <span className="px-2 py-1 rounded-md bg-gray-100 text-xs font-medium text-gray-600 capitalize">{biz.category}</span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-sm font-semibold text-gray-900">{biz.rating}</span>
                              <span className="text-xs text-gray-400 ml-1">({biz.reviewCount})</span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-sm font-bold text-orange-600">{biz.discount || '-'}</span>
                            </td>
                            <td className="px-5 py-3">
                              {isFromDb ? (
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  Database
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                  Sample
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Active
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <button onClick={() => openEditModal(biz.id)} className="px-3 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors flex items-center gap-1">
                                  <Edit3 className="w-3 h-3" />
                                  Edit
                                </button>
                                <button onClick={() => setPreviewBusinessId(biz.id)} className="px-3 py-1 rounded-lg bg-gray-50 text-gray-600 text-xs font-semibold hover:bg-gray-100 transition-colors flex items-center gap-1" title="Preview business details">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>

                                {isFromDb ? (
                                  <button
                                    onClick={() => setConfirmDeleteId(biz.id)}
                                    disabled={deletingId === biz.id}
                                    className="px-3 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {deletingId === biz.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                    Delete
                                  </button>
                                ) : (
                                  <span className="px-3 py-1 rounded-lg bg-gray-50 text-gray-300 text-xs font-semibold cursor-not-allowed flex items-center gap-1" title="Sample businesses cannot be deleted">
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );

                      })}
                    </tbody>
                  </table>
                </div>
                {filteredBiz.length === 0 && (
                  <div className="p-8 text-center">
                    <Store className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No businesses found matching your search.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {/* ═══ APPROVALS TAB ═══ */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            {/* Status bar with realtime indicator and last refreshed */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2">
                {realtimeConnected ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                    <Wifi className="w-3.5 h-3.5" />
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Live updates active
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <WifiOff className="w-3.5 h-3.5" />
                    Polling every 30s
                  </span>
                )}
              </div>
              <div className="h-4 w-px bg-gray-200" />
              <span className="text-xs text-gray-400">
                Last refreshed: <span className="font-semibold text-gray-600">{formatLastRefreshed()}</span>
              </span>
              <div className="h-4 w-px bg-gray-200" />
              <span className="text-xs text-gray-400">
                {pendingBusinesses.length} total submission{pendingBusinesses.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-500" />
                Pending Business Approvals
              </h3>
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <button
                  onClick={() => loadPending(true)}
                  disabled={loadingPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPending ? 'animate-spin' : ''}`} />
                  {loadingPending ? 'Loading...' : 'Refresh'}
                </button>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 font-semibold">
                  <AlertCircle className="w-4 h-4" />
                  {pendingCount} Pending Business{pendingCount !== 1 ? 'es' : ''}
                </span>
                {pendingEditCount > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold">
                    <Edit3 className="w-4 h-4" />
                    {pendingEditCount} Pending Edit{pendingEditCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

            </div>

            {/* Loading state */}
            {loadingPending && pendingBusinesses.length === 0 && (
              <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-500">Loading pending business submissions...</p>
                <p className="text-xs text-gray-400 mt-1">Checking edge function and direct database...</p>
              </div>
            )}


            {pendingBusinesses.length > 0 ? (
              <div className="space-y-4">
                {pendingBusinesses.map(biz => {
                  const photos = businessPhotos[biz.id] || [];
                  const pendingPhotos = photos.filter(p => p.status === 'pending');
                  const approvedPhotos = photos.filter(p => p.status === 'approved');
                  const rejectedPhotos = photos.filter(p => p.status === 'rejected');

                  return (
                    <div key={biz.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                      biz.status === 'pending' ? 'border-yellow-200' :
                      biz.status === 'approved' ? 'border-green-200' : 'border-red-200'
                    }`}>
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              biz.status === 'pending' ? 'bg-yellow-50' :
                              biz.status === 'approved' ? 'bg-green-50' : 'bg-red-50'
                            }`}>
                              {biz.status === 'pending' ? <AlertCircle className="w-6 h-6 text-yellow-500" /> :
                               biz.status === 'approved' ? <CheckCircle className="w-6 h-6 text-green-500" /> :
                               <XCircle className="w-6 h-6 text-red-500" />}
                            </div>
                            <div>
                              <h4 className="text-lg font-bold text-gray-900">{biz.name}</h4>
                              <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span className="px-2 py-0.5 rounded-md bg-gray-100 text-xs font-medium capitalize">{biz.category}</span>
                                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(biz.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                            biz.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                            biz.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' :
                            'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            {biz.status}
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">{biz.description}</p>

                        {/* ═══ ALL Uploaded Photos with Individual Approval ═══ */}
                        {photos.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-sm text-gray-700 font-semibold flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-gray-500" />
                                Uploaded Photos ({photos.length})
                                {pendingPhotos.length > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold">
                                    {pendingPhotos.length} need review
                                  </span>
                                )}
                                {approvedPhotos.length > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                    {approvedPhotos.length} approved
                                  </span>
                                )}
                                {rejectedPhotos.length > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                                    {rejectedPhotos.length} rejected
                                  </span>
                                )}
                              </p>
                              {/* Bulk actions for photos */}
                              {pendingPhotos.length >= 1 && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleBulkPhotoReview(photos, 'approved')}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors shadow-sm"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Approve All ({pendingPhotos.length})
                                  </button>
                                  <button
                                    onClick={() => handleBulkPhotoReview(photos, 'rejected')}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    Reject All ({pendingPhotos.length})
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                              {photos.map((photo, idx) => (
                                <div key={photo.id} className={`rounded-xl overflow-hidden border-2 ${
                                  photo.status === 'approved' ? 'border-green-300' :
                                  photo.status === 'rejected' ? 'border-red-300' : 'border-yellow-300'
                                }`}>
                                  {/* Photo */}
                                  <div className="relative">
                                    <img
                                      src={getPhotoDisplayUrl(photo, SUPABASE_URL) || photo.url || '/placeholder.svg'}
                                      alt={`Photo ${idx + 1}`}
                                      className="w-full h-40 object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = '/placeholder.svg';
                                      }}
                                    />
                                    {/* Main badge */}
                                    {photo.is_main && (
                                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-bold shadow-sm">
                                        MAIN
                                      </div>
                                    )}
                                    {/* Status badge */}
                                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold capitalize shadow-sm ${
                                      photo.status === 'approved' ? 'bg-green-600 text-white' :
                                      photo.status === 'rejected' ? 'bg-red-600 text-white' :
                                      'bg-yellow-500 text-white'
                                    }`}>
                                      {photo.status}
                                    </div>
                                  </div>

                                  {/* Action buttons - ALWAYS visible below the photo */}
                                  <div className={`p-2 ${
                                    photo.status === 'pending' ? 'bg-yellow-50' :
                                    photo.status === 'approved' ? 'bg-green-50' :
                                    'bg-red-50'
                                  }`}>
                                    {photo.status === 'pending' ? (
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => handlePhotoReview(photo.id, 'approved')}
                                          disabled={processingPhotoId === photo.id}
                                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors disabled:opacity-50 shadow-sm"
                                        >
                                          {processingPhotoId === photo.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <CheckCircle className="w-3.5 h-3.5" />
                                          )}
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => handlePhotoReview(photo.id, 'rejected')}
                                          disabled={processingPhotoId === photo.id}
                                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
                                        >
                                          {processingPhotoId === photo.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <XCircle className="w-3.5 h-3.5" />
                                          )}
                                          Reject
                                        </button>
                                      </div>
                                    ) : photo.status === 'approved' ? (
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-green-700 flex items-center gap-1">
                                          <CheckCircle className="w-3.5 h-3.5" /> Approved
                                        </span>
                                        <button
                                          onClick={() => handlePhotoReview(photo.id, 'rejected')}
                                          disabled={processingPhotoId === photo.id}
                                          className="px-2 py-1 rounded-md bg-red-100 text-red-600 text-[10px] font-bold hover:bg-red-200 transition-colors"
                                        >
                                          Revoke
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-red-700 flex items-center gap-1">
                                          <XCircle className="w-3.5 h-3.5" /> Rejected
                                        </span>
                                        <button
                                          onClick={() => handlePhotoReview(photo.id, 'approved')}
                                          disabled={processingPhotoId === photo.id}
                                          className="px-2 py-1 rounded-md bg-green-100 text-green-600 text-[10px] font-bold hover:bg-green-200 transition-colors"
                                        >
                                          Approve
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}


                        {/* Show single image fallback if no photos in business_photos but biz.image exists */}
                        {photos.length === 0 && biz.image && (
                          <div className="mb-4">
                            <p className="text-[10px] text-gray-400 font-medium uppercase mb-2 flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" />
                              Uploaded Photo
                            </p>
                            <div className="relative rounded-xl overflow-hidden w-full max-w-sm border border-gray-200">
                              <img
                                src={biz.image}
                                alt={biz.name}
                                className="w-full h-40 object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          </div>
                        )}


                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                          {/* Pricing */}
                          {(biz.original_price > 0 || biz.deal_price > 0) && (
                            <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-100">
                              <p className="text-[10px] text-gray-400 font-medium uppercase">Pricing</p>
                              <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-sm font-bold text-teal-700">${biz.deal_price || 0}</span>
                                {biz.original_price > 0 && (
                                  <span className="text-xs text-gray-400 line-through">${biz.original_price}</span>
                                )}
                              </div>
                              {biz.original_price > 0 && biz.deal_price > 0 && biz.deal_price < biz.original_price && (
                                <p className="text-[9px] text-emerald-600 font-semibold mt-0.5">
                                  Save ${(biz.original_price - biz.deal_price).toFixed(0)}
                                </p>
                              )}
                            </div>
                          )}
                          {biz.discount && (
                            <div className="p-2.5 rounded-lg bg-gray-50">
                              <p className="text-[10px] text-gray-400 font-medium uppercase">Discount</p>
                              <p className="text-sm font-bold text-orange-600">{biz.discount}</p>
                            </div>
                          )}
                          {/* Discount Validity Dates */}
                          {(biz.discount_valid_from || biz.discount_valid_until) && (
                            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100 col-span-2 sm:col-span-1">
                              <p className="text-[10px] text-gray-400 font-medium uppercase flex items-center gap-1">
                                <Calendar className="w-2.5 h-2.5" />
                                Valid Period
                              </p>
                              <div className="mt-0.5">
                                {biz.discount_valid_from && (
                                  <p className="text-[11px] font-semibold text-blue-700">
                                    From: {new Date(biz.discount_valid_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                )}
                                {biz.discount_valid_until && (
                                  <p className="text-[11px] font-semibold text-blue-700">
                                    Until: {new Date(biz.discount_valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                          {biz.location && (
                            <div className="p-2.5 rounded-lg bg-gray-50">
                              <p className="text-[10px] text-gray-400 font-medium uppercase">Location</p>
                              <p className="text-sm font-semibold text-gray-700">{biz.location}</p>
                            </div>
                          )}
                          {biz.phone && (
                            <div className="p-2.5 rounded-lg bg-gray-50">
                              <p className="text-[10px] text-gray-400 font-medium uppercase">Phone</p>
                              <p className="text-sm font-semibold text-gray-700">{biz.phone}</p>
                            </div>
                          )}
                          {biz.hours && (
                            <div className="p-2.5 rounded-lg bg-gray-50">
                              <p className="text-[10px] text-gray-400 font-medium uppercase">Hours</p>
                              <p className="text-sm font-semibold text-gray-700">{biz.hours}</p>
                            </div>
                          )}
                        </div>


                        {biz.status === 'pending' && (
                          <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                            <input
                              type="text"
                              value={adminNotes[biz.id] || ''}
                              onChange={(e) => setAdminNotes(prev => ({ ...prev, [biz.id]: e.target.value }))}
                              placeholder="Admin notes (optional)..."
                              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                            <button
                              onClick={() => handleReviewBusiness(biz.id, 'approved')}
                              disabled={processingId === biz.id}
                              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              {processingId === biz.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() => handleReviewBusiness(biz.id, 'rejected')}
                              disabled={processingId === biz.id}
                              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                              {processingId === biz.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">No Pending Approvals</h3>
                <p className="text-gray-500">All business submissions have been reviewed.</p>
              </div>
            )}

            {/* ═══ PENDING LISTING EDITS ═══ */}
            <div className="mt-8">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-blue-500" />
                  Pending Listing Edits
                  {pendingEditCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                      {pendingEditCount} pending
                    </span>
                  )}
                </h3>
                <button
                  onClick={loadPendingEdits}
                  disabled={loadingEdits}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingEdits ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {loadingEdits ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Loading pending edits...</p>
                </div>
              ) : pendingEdits.length > 0 ? (
                <div className="space-y-4">
                  {pendingEdits.map(edit => {
                    const business = allBusinesses.find(b => b.id === edit.business_id);
                    const changes = typeof edit.changes === 'string' ? JSON.parse(edit.changes) : edit.changes;

                    return (
                      <div key={edit.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                        edit.status === 'pending' ? 'border-blue-200' :
                        edit.status === 'approved' ? 'border-green-200' : 'border-red-200'
                      }`}>
                        <div className="p-6">
                          {/* Header */}
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                edit.status === 'pending' ? 'bg-blue-50' :
                                edit.status === 'approved' ? 'bg-green-50' : 'bg-red-50'
                              }`}>
                                <Edit3 className={`w-6 h-6 ${
                                  edit.status === 'pending' ? 'text-blue-500' :
                                  edit.status === 'approved' ? 'text-green-500' : 'text-red-500'
                                }`} />
                              </div>
                              <div>
                                <h4 className="text-lg font-bold text-gray-900">
                                  {business?.name || 'Unknown Business'}
                                </h4>
                                <div className="flex items-center gap-3 text-sm text-gray-500">
                                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-xs font-medium">
                                    Listing Edit
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {new Date(edit.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {Object.keys(changes).length} field{Object.keys(changes).length !== 1 ? 's' : ''} changed
                                  </span>
                                </div>
                              </div>
                            </div>
                            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                              edit.status === 'pending' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              edit.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' :
                              'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {edit.status}
                            </span>
                          </div>

                          {/* Changes Diff */}
                          <div className="space-y-3 mb-4">
                            {Object.entries(changes).map(([key, newValue]) => {
                              const currentValue = business ? (business as any)[key === 'original_price' ? 'originalPrice' : key === 'deal_price' ? 'dealPrice' : key] : undefined;
                              return (
                                <div key={key} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                    {key.replace(/_/g, ' ')}
                                  </p>
                                  <div className="flex items-start gap-3">
                                    <div className="flex-1">
                                      <p className="text-[10px] text-gray-400 mb-0.5">Current</p>
                                      <p className="text-sm text-gray-600 bg-white rounded-lg px-3 py-1.5 border border-gray-200">
                                        {currentValue !== undefined ? (
                                          typeof currentValue === 'number' ? `$${currentValue}` : String(currentValue || '—')
                                        ) : '—'}
                                      </p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-gray-300 mt-5 flex-shrink-0" />
                                    <div className="flex-1">
                                      <p className="text-[10px] text-blue-500 mb-0.5 font-semibold">Proposed</p>
                                      <p className="text-sm text-blue-700 font-semibold bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-200">
                                        {typeof newValue === 'number' ? `$${newValue}` : String(newValue || '—')}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Admin Actions */}
                          {edit.status === 'pending' && (
                            <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                              <input
                                type="text"
                                value={editAdminNotes[edit.id] || ''}
                                onChange={(e) => setEditAdminNotes(prev => ({ ...prev, [edit.id]: e.target.value }))}
                                placeholder="Admin notes (optional)..."
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => handleReviewEdit(edit.id, 'approved')}
                                disabled={processingEditId === edit.id}
                                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                              >
                                {processingEditId === edit.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                                Approve & Apply
                              </button>
                              <button
                                onClick={() => handleReviewEdit(edit.id, 'rejected')}
                                disabled={processingEditId === edit.id}
                                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                {processingEditId === edit.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <XCircle className="w-4 h-4" />
                                )}
                                Reject
                              </button>
                            </div>
                          )}

                          {/* Reviewed status */}
                          {edit.status !== 'pending' && edit.reviewed_at && (
                            <div className={`mt-3 p-3 rounded-lg text-xs ${
                              edit.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                            }`}>
                              <span className="font-bold">
                                {edit.status === 'approved' ? 'Approved & Applied' : 'Rejected'}
                              </span>
                              {' on '}
                              {new Date(edit.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {edit.admin_notes && (
                                <span> — {edit.admin_notes}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <Edit3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-gray-900 mb-1">No Pending Edits</h4>
                  <p className="text-xs text-gray-500">Business listing edit requests will appear here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ EMAILS TAB ═══ */}
        {activeTab === 'emails' && (
          <div className="space-y-8">
            {/* Receipt Manager */}
            <EmailReceiptManager />

            {/* Divider */}
            <div className="border-t border-gray-200 pt-8">
              {/* Email Notification Center (admin mode) */}
              <EmailNotificationCenter mode="admin" />
            </div>
          </div>
        )}



        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-4">Usage Pattern Reports</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-teal-50 border border-teal-100">
                  <p className="text-sm text-teal-600 font-medium">Peak Hours</p>
                  <p className="text-xl font-bold text-teal-800 mt-1">10 AM - 2 PM</p>
                  <p className="text-xs text-teal-500 mt-1">Most redemptions occur during lunch</p>
                </div>
                <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                  <p className="text-sm text-orange-600 font-medium">Popular Day</p>
                  <p className="text-xl font-bold text-orange-800 mt-1">Saturday</p>
                  <p className="text-xs text-orange-500 mt-1">40% higher than weekday average</p>
                </div>
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                  <p className="text-sm text-purple-600 font-medium">Avg. Session</p>
                  <p className="text-xl font-bold text-purple-800 mt-1">12 min</p>
                  <p className="text-xs text-purple-500 mt-1">Users browse 4.2 deals per session</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Pass Type Distribution</h4>
                  <div className="space-y-2">
                    {[
                      { label: 'Daily', pct: 25, color: 'bg-sky-500' },
                      { label: 'Weekly', pct: 55, color: 'bg-teal-500' },
                      { label: 'Monthly', pct: 20, color: 'bg-orange-500' },
                    ].map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">{item.label}</span>
                          <span className="font-semibold">{item.pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                          <div className={`h-2 ${item.color} rounded-full`} style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Tourist Demographics</h4>
                  <div className="space-y-2">
                    {[
                      { label: 'Australia/NZ', pct: 45, color: 'bg-emerald-500' },
                      { label: 'Europe', pct: 25, color: 'bg-blue-500' },
                      { label: 'Asia', pct: 18, color: 'bg-violet-500' },
                      { label: 'Other', pct: 12, color: 'bg-pink-500' },
                    ].map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">{item.label}</span>
                          <span className="font-semibold">{item.pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                          <div className={`h-2 ${item.color} rounded-full`} style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors">
                <Download className="w-4 h-4" />
                Download Full Report (PDF)
              </button>
            </div>
          </div>
        )}

        {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
        {confirmDeleteId && (() => {
          const bizToDelete = allBusinesses.find(b => b.id === confirmDeleteId);
          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => !deletingId && setConfirmDeleteId(null)}
              />
              {/* Modal */}
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Red header bar */}
                <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-900">Delete Business Listing</h3>
                    <p className="text-xs text-red-600">This action cannot be undone</p>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                  <p className="text-sm text-gray-600 mb-4">
                    Are you sure you want to permanently delete this business listing? All associated data will be removed:
                  </p>

                  {/* Business preview */}
                  {bizToDelete && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 mb-4">
                      {bizToDelete.image ? (
                        <img src={bizToDelete.image} alt={bizToDelete.name} className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center">
                          <Store className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{bizToDelete.name}</p>
                        <p className="text-xs text-gray-500">{bizToDelete.location} &middot; {bizToDelete.category}</p>
                      </div>
                    </div>
                  )}

                  {/* What will be deleted */}
                  <div className="space-y-2 mb-2">
                    {[
                      'Business listing and all details',
                      'All uploaded photos',
                      'Customer reviews and ratings',
                      'Favorites and saved items',
                      'Redemption history',
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer actions */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={!!deletingId}
                    className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteBusiness(confirmDeleteId)}
                    disabled={!!deletingId}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {deletingId === confirmDeleteId ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Delete Permanently
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══ ADD BUSINESS MODAL ═══ */}
        {showAddBusiness && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !addingBusiness && setShowAddBusiness(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center"><Plus className="w-5 h-5 text-teal-600" /></div>
                  <div><h3 className="text-lg font-bold text-gray-900">Add New Business</h3><p className="text-xs text-gray-500">This listing will go live immediately (admin bypass)</p></div>
                </div>
                <button onClick={() => setShowAddBusiness(false)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <form onSubmit={handleAddBusinessSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Business Name *</label><input type="text" value={addForm.name} onChange={e => setAddForm(p => ({...p, name: e.target.value}))} required className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="e.g. Island Café" /></div>
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Category</label><select value={addForm.category} onChange={e => setAddForm(p => ({...p, category: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">{['dining','activities','tours','shopping','spa','accommodation'].map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</select></div>
                </div>
                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Description *</label><textarea value={addForm.description} onChange={e => setAddForm(p => ({...p, description: e.target.value}))} required rows={3} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Describe the business..." /></div>

                {/* ─── Auto-Calculate Pricing (same as homepage form) ─── */}
                <PricingDiscountFields
                  originalPrice={addForm.originalPrice}
                  discountPercent={addForm.discountPercent}
                  onOriginalPriceChange={(v) => setAddForm(p => ({...p, originalPrice: v}))}
                  onDiscountPercentChange={(v) => setAddForm(p => ({...p, discountPercent: v}))}
                  onCalculatedValues={(dp, dl) => setAddForm(p => ({...p, dealPrice: dp, discount: dl}))}
                  showValidity={true}
                  discountValidFrom={addForm.discountValidFrom}
                  listingDuration={addForm.listingDuration}
                  onDiscountValidFromChange={(v) => setAddForm(p => ({...p, discountValidFrom: v}))}
                  onListingDurationChange={(v) => setAddForm(p => ({...p, listingDuration: v}))}
                  showExtras={true}
                  mapUrl={addForm.mapUrl}
                  website={addForm.website}
                  onMapUrlChange={(v) => setAddForm(p => ({...p, mapUrl: v}))}
                  onWebsiteChange={(v) => setAddForm(p => ({...p, website: v}))}
                  language={language}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Location</label><input type="text" value={addForm.location} onChange={e => setAddForm(p => ({...p, location: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" /></div>
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label><input type="text" value={addForm.phone} onChange={e => setAddForm(p => ({...p, phone: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="+678 ..." /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Email</label><input type="email" value={addForm.email} onChange={e => setAddForm(p => ({...p, email: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" /></div>
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Hours</label><input type="text" value={addForm.hours} onChange={e => setAddForm(p => ({...p, hours: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="9:00 AM - 5:00 PM" /></div>
                </div>
                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Image URL</label><input type="url" value={addForm.image} onChange={e => setAddForm(p => ({...p, image: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="https://..." /></div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setShowAddBusiness(false)} disabled={addingBusiness} className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                  <button type="submit" disabled={addingBusiness} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-50">{addingBusiness ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</> : <><Plus className="w-4 h-4" />Add Business</>}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ EDIT BUSINESS MODAL ═══ */}
        {editBusinessId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !savingEdit && setEditBusinessId(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Edit3 className="w-5 h-5 text-blue-600" /></div>
                  <div><h3 className="text-lg font-bold text-gray-900">Edit Business</h3><p className="text-xs text-gray-500">Changes are saved directly to the database (admin)</p></div>
                </div>
                <button onClick={() => setEditBusinessId(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Business Name *</label><input type="text" value={editForm.name} onChange={e => setEditForm(p => ({...p, name: e.target.value}))} required className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Category</label><select value={editForm.category} onChange={e => setEditForm(p => ({...p, category: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">{['dining','activities','tours','shopping','spa','accommodation'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</select></div>
                </div>
                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Description</label><textarea value={editForm.description} onChange={e => setEditForm(p => ({...p, description: e.target.value}))} rows={3} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>

                {/* ─── Auto-Calculate Pricing (same as homepage form) ─── */}
                <PricingDiscountFields
                  originalPrice={editForm.originalPrice}
                  discountPercent={editForm.discountPercent}
                  onOriginalPriceChange={(v) => setEditForm(p => ({...p, originalPrice: v}))}
                  onDiscountPercentChange={(v) => setEditForm(p => ({...p, discountPercent: v}))}
                  onCalculatedValues={(dp, dl) => setEditForm(p => ({...p, dealPrice: dp, discount: dl}))}
                  showExtras={true}
                  mapUrl={editForm.mapUrl}
                  website={editForm.website}
                  onMapUrlChange={(v) => setEditForm(p => ({...p, mapUrl: v}))}
                  onWebsiteChange={(v) => setEditForm(p => ({...p, website: v}))}
                  language={language}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Location</label><input type="text" value={editForm.location} onChange={e => setEditForm(p => ({...p, location: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label><input type="text" value={editForm.phone} onChange={e => setEditForm(p => ({...p, phone: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Hours</label><input type="text" value={editForm.hours} onChange={e => setEditForm(p => ({...p, hours: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1">Image URL</label><input type="url" value={editForm.image} onChange={e => setEditForm(p => ({...p, image: e.target.value}))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setEditBusinessId(null)} disabled={savingEdit} className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                  <button type="submit" disabled={savingEdit} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50">{savingEdit ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Changes</>}</button>
                </div>
              </form>
            </div>
          </div>
        )}


        {/* ═══ PREVIEW BUSINESS MODAL ═══ */}
        {previewBusinessId && (() => {
          const biz = allBusinesses.find(b => b.id === previewBusinessId);
          if (!biz) return null;
          const isFromDb = dbBusinesses.some(db => db.id === biz.id);
          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPreviewBusinessId(null)} />
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <button onClick={() => setPreviewBusinessId(null)} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/80 hover:bg-white shadow-sm transition-colors"><X className="w-5 h-5 text-gray-600" /></button>
                {biz.image && <img src={biz.image} alt={biz.name} className="w-full h-56 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{biz.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-xs font-semibold capitalize">{biz.category}</span>
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${isFromDb ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{isFromDb ? 'Database' : 'Sample'}</span>
                        {biz.featured && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-semibold">Featured</span>}
                      </div>
                    </div>
                    {biz.discount && <span className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-sm font-bold border border-orange-200">{biz.discount}</span>}
                  </div>
                  <p className="text-sm text-gray-600 mb-4 leading-relaxed">{biz.description}</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {biz.location && <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-50"><MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" /><div><p className="text-[10px] text-gray-400 font-medium uppercase">Location</p><p className="text-sm font-semibold text-gray-700">{biz.location}</p></div></div>}
                    {biz.phone && <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-50"><Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" /><div><p className="text-[10px] text-gray-400 font-medium uppercase">Phone</p><p className="text-sm font-semibold text-gray-700">{biz.phone}</p></div></div>}
                    {biz.hours && <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-50"><Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" /><div><p className="text-[10px] text-gray-400 font-medium uppercase">Hours</p><p className="text-sm font-semibold text-gray-700">{biz.hours}</p></div></div>}
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-50"><BarChart3 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" /><div><p className="text-[10px] text-gray-400 font-medium uppercase">Rating</p><p className="text-sm font-semibold text-gray-700">{biz.rating} ({biz.reviewCount} reviews)</p></div></div>
                  </div>
                  {(biz.originalPrice > 0 || biz.dealPrice > 0) && (
                    <div className="p-4 rounded-xl bg-teal-50 border border-teal-100 mb-4">
                      <p className="text-xs text-teal-600 font-medium mb-1">Pricing</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-teal-700">${biz.dealPrice}</span>
                        {biz.originalPrice > 0 && biz.originalPrice !== biz.dealPrice && <span className="text-sm text-gray-400 line-through">${biz.originalPrice}</span>}
                      </div>
                    </div>
                  )}
                  {biz.tags && biz.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">{biz.tags.map((tag, i) => <span key={i} className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-medium">{tag}</span>)}</div>
                  )}
                  <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                    <button onClick={() => { setPreviewBusinessId(null); openEditModal(biz.id); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition-colors"><Edit3 className="w-4 h-4" />Edit Listing</button>
                    <button onClick={() => setPreviewBusinessId(null)} className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors">Close</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default AdminPanel;

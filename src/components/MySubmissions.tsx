import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, getEdgeAuthHeaders } from '@/lib/supabase';
import { toast } from 'sonner';
import { Business } from '@/data/businesses';
import { getBusinessImageUrl } from '@/lib/utils';
import {
  Clock, CheckCircle, XCircle, AlertCircle, FileText, RefreshCw,
  MapPin, Phone, Mail, Tag, DollarSign, Calendar, ChevronDown,
  ChevronUp, Store, Loader2, Bell, BellRing, Eye, MessageSquare,
  ArrowRight, ExternalLink, Info, Sparkles, ShieldCheck, X, Trash2,
} from 'lucide-react';
import {
  looksLikeRichDescriptionHtml,
  sanitizeBusinessDescriptionHtml,
} from '@/lib/businessDescriptionHtml';
import { PROSE_CLASSES } from '@/lib/prose';
import { mapJoinedOfferingToBusiness } from '@/lib/businessOfferingMap';

export interface Submission {
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
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  business_id?: string | null;
  /** When `'live'`, this row mirrors `business_offerings` (canonical for Explore), not `pending_businesses`. */
  listingSource?: 'pending' | 'live';
  /** Real `business_offerings.id` when `listingSource === 'live'`. */
  offeringId?: string | null;
}

type LiveEdgeItem = {
  offering: Record<string, unknown>;
  business: Record<string, unknown>;
};

function submissionFromLiveOffering(
  offering: Record<string, unknown>,
  profile: Record<string, unknown>,
): Submission {
  const b = mapJoinedOfferingToBusiness(offering, profile, SUPABASE_URL);
  const oid = String(offering.id ?? '').trim();
  const created = String(offering.created_at ?? new Date().toISOString());
  return {
    id: `live:${oid}`,
    listingSource: 'live',
    offeringId: oid,
    owner_id: String(profile.owner_id ?? ''),
    name: b.name,
    category: b.category,
    description: b.description,
    discount: b.discount,
    original_price: b.originalPrice,
    deal_price: b.dealPrice,
    location: b.location,
    phone: b.phone ?? '',
    email: typeof b.contactEmail === 'string' ? b.contactEmail : '',
    hours: b.hours ?? '',
    image: typeof b.image === 'string' ? b.image : '',
    status: 'approved',
    admin_notes: null,
    reviewed_at: created,
    created_at: created,
    business_id: String(profile.id ?? ''),
  };
}

async function fetchLiveSubmissionsForOwner(userId: string): Promise<Submission[]> {
  try {
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('manage-business', {
      body: { action: 'get_owner_offerings_live', userId },
    });
    if (edgeErr) {
      console.warn('[MySubmissions] get_owner_offerings_live:', edgeErr.message || edgeErr);
      return [];
    }
    const payload = edgeData as { success?: boolean; items?: LiveEdgeItem[] } | null | undefined;
    if (!payload?.success || !Array.isArray(payload.items)) return [];

    const out: Submission[] = [];
    for (const item of payload.items) {
      if (!item?.offering || !item?.business) continue;
      if (item.offering.active === false) continue; // null/undefined = treat as active (same as public mapper)
      out.push(submissionFromLiveOffering(item.offering, item.business));
    }
    return out;
  } catch (e) {
    console.warn('[MySubmissions] fetchLiveSubmissionsForOwner:', e);
    return [];
  }
}

/** Drop stale `pending_businesses` rows that duplicate an active live offering (same profile + title). */
function mergePendingAndLiveRows(pending: Submission[], live: Submission[]): Submission[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const pendingFiltered = pending.filter((p) => {
    if (p.listingSource === 'live') return false;
    if (p.status !== 'approved') return true;
    const pid = p.business_id != null ? String(p.business_id).trim() : '';
    const pname = norm(p.name || '');
    if (!pid || !pname) return true;
    const hasLiveTwin = live.some(
      (l) =>
        l.listingSource === 'live' &&
        String(l.business_id || '').trim() === pid &&
        norm(l.name) === pname,
    );
    return !hasLiveTwin;
  });
  return [...pendingFiltered, ...live].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

interface MySubmissionsProps {
  onNewStatusChange?: (count: number) => void;
}

/** Offering columns only — avoid `businesses!inner` (RLS + PostgREST embed often errors). */
const OFFERING_LIVE_COLS =
  'id, business_id, title, description, description_fr, description_bi, discount, original_price, deal_price, image, map_url, website, discount_valid_from, discount_valid_until, whatsapp_number, pricing_tiers, tags, featured, active, created_at';

const PROFILE_LIVE_COLS =
  'id, name, category, owner_id, location, lat, lng, hours, opening_hours, phone, email, contact_email, business_email, whatsapp_number, rating, review_count, featured, active, map_url, website, tags';

/** Map DB row → app Business (matches AppContext loadBusinesses). */
function mapDbRowToBusiness(row: Record<string, unknown>): Business {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: (row.category as Business['category']) || 'dining',
    description: String(row.description ?? ''),
    descriptionFr: String(row.description_fr || row.description || ''),
    descriptionBi: String(row.description_bi || row.description || ''),
    image: getBusinessImageUrl((row.image_url || row.image) as string, SUPABASE_URL),
    rating: Number(row.rating) || 0,
    reviewCount: Number(row.review_count) || 0,
    discount: String(row.discount ?? row.deal ?? ''),
    originalPrice: Number(row.original_price) || 0,
    dealPrice: Number(row.discounted_price ?? row.deal_price) || 0,
    location: String(row.location ?? ''),
    lat: Number(row.lat) || 0,
    lng: Number(row.lng) || 0,
    hours: String(row.opening_hours || row.hours || ''),
    phone: String(row.phone ?? ''),
    contactEmail: (row.email || row.contact_email || row.business_email) as string | null | undefined,
    whatsappNumber: (row.whatsapp_number as string) || null,
    tags: (row.tags as string[]) || [],
    featured: Boolean(row.featured),
    ownerId: (row.owner_id as string) || null,
    superStarCount: Number(row.super_star_count) || 0,
  };
}

const MySubmissions: React.FC<MySubmissionsProps> = ({ onNewStatusChange }) => {
  const { user, language, setCurrentView, setSelectedBusiness, dbBusinesses, refreshBusinesses } =
    useAppContext();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [unseenChanges, setUnseenChanges] = useState<Set<string>>(new Set());
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const previousStatusesRef = useRef<Map<string, string>>(new Map());
  const initialLoadDone = useRef(false);

  const handleWithdrawSubmission = useCallback(
    async (submission: Submission) => {
      console.log('!!! WITHDRAW FUNCTION TRIGGERED !!!', submission.id);
      try {
        if (!user?.id) {
          console.warn('[MySubmissions] withdraw: skipped — no user?.id');
          toast.error(
            language === 'en' ? 'Sign in again to remove submissions.' : 'Reconnectez-vous pour supprimer.',
          );
          return;
        }

        if (submission.listingSource === 'live' && submission.offeringId) {
          const confirmMessage =
            language === 'en'
              ? `Hide "${submission.name}" from Explore? Tourists will no longer see this deal.`
              : language === 'fr'
                ? `Masquer « ${submission.name} » sur Explore ? Les touristes ne verront plus cette offre.`
                : `Haed "${submission.name}" long Explore?`;

          if (!window.confirm(confirmMessage)) return;

          setWithdrawingId(submission.id);
          const { error: deactErr } = await supabase
            .from('business_offerings')
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq('id', submission.offeringId);

          if (deactErr) {
            console.error('[MySubmissions] deactivate offering:', deactErr);
            toast.error(
              language === 'en'
                ? 'Could not hide listing. Try again or contact support.'
                : 'Impossible de masquer l’annonce.',
            );
            setWithdrawingId(null);
            return;
          }

          setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
          setUnseenChanges((prev) => {
            const next = new Set(prev);
            next.delete(submission.id);
            return next;
          });
          toast.success(
            language === 'en'
              ? 'Listing hidden from Explore.'
              : language === 'fr'
                ? 'Annonce masquée sur Explore.'
                : 'Listing i haed long Explore.',
          );
          await refreshBusinesses?.();
          setWithdrawingId(null);
          return;
        }

        const confirmMessage =
          submission.status === 'approved'
            ? language === 'en'
              ? `Remove "${submission.name}" from My Submissions? This deletes the dashboard record only (e.g. stuck "approved" rows). It does not remove a live listing from Explore. This cannot be undone.`
              : language === 'fr'
                ? `Retirer « ${submission.name} » de Mes soumissions ? Supprime uniquement l’entrée du tableau de bord. Irréversible.`
                : `Raetem "${submission.name}" long dashboard? Hem i raetem wan row nomo.`
            : language === 'en'
              ? `Remove "${submission.name}" from your submissions? This cannot be undone.`
              : language === 'fr'
                ? `Retirer « ${submission.name} » de vos soumissions ? Action irréversible.`
                : `Raetem "${submission.name}" long ol sabmisen?`;

        const confirmed = window.confirm(confirmMessage);
        console.log('[MySubmissions] withdraw: confirm result', {
          confirmed,
          submissionId: submission.id,
        });
        if (!confirmed) {
          console.log('[MySubmissions] withdraw: user cancelled');
          return;
        }

        setWithdrawingId(submission.id);

        const headers = await getEdgeAuthHeaders();
        console.log('Attempting Edge Function Invoke...', {
          pendingId: submission.id,
          hasAuthorizationHeader: Boolean(headers?.Authorization),
        });

        const invokeAborter = new AbortController();
        const withdrawInvokeMs = 90_000;
        const invokeTimer = setTimeout(() => invokeAborter.abort(), withdrawInvokeMs);

        let data: unknown;
        let error: unknown;
        let response: Response | undefined;
        try {
          const result = await supabase.functions.invoke('manage-business', {
            body: {
              action: 'withdraw_pending_submission',
              pendingId: submission.id,
            },
            headers,
            signal: invokeAborter.signal,
          });
          data = result.data;
          error = result.error;
          response = result.response as Response | undefined;
        } finally {
          clearTimeout(invokeTimer);
        }

        console.log('[MySubmissions] withdraw: invoke settled', {
          hasError: Boolean(error),
          errorName: error && typeof error === 'object' && 'name' in error ? (error as Error).name : null,
          responseStatus: response?.status,
          dataSummary: data && typeof data === 'object' ? (data as { success?: boolean }).success : data,
        });

        if (error) {
          console.error('!!! WITHDRAW FAILED !!!', error);
          if (
            error instanceof FunctionsHttpError ||
            (error as { name?: string }).name === 'FunctionsHttpError'
          ) {
            const ctx = (error as FunctionsHttpError).context as Response | undefined;
            if (ctx && typeof ctx.status === 'number') {
              let bodyText = '';
              try {
                bodyText = await ctx.clone().text();
              } catch (readErr) {
                bodyText = `(could not read body: ${String(readErr)})`;
              }
              console.error('[MySubmissions] FunctionsHttpError details', {
                status: ctx.status,
                statusText: ctx.statusText,
                bodyText: bodyText.slice(0, 4000),
              });
            }
          }
          const errObj = error as { message?: string };
          let errMsg = errObj?.message;
          if (!errMsg && error && typeof error === 'object' && 'context' in error) {
            try {
              const res = (error as { context?: Response }).context;
              if (res && typeof res.clone === 'function') {
                const t = await res.clone().text();
                try {
                  errMsg = (JSON.parse(t) as { error?: string }).error;
                } catch {
                  errMsg = t?.slice(0, 200);
                }
              }
            } catch {
              /* ignore */
            }
          }
          toast.error(
            errMsg ||
              (language === 'en'
                ? 'Could not remove submission. Try again or contact support.'
                : 'Impossible de retirer la soumission.'),
          );
          return;
        }

        const payload = data as { success?: boolean; error?: string } | null | undefined;
        let payloadErrMsg = payload?.error;
        if (!payload?.success) {
          console.error('[MySubmissions] withdraw_pending_submission: success=false or missing', {
            data: payload,
          });
          toast.error(
            payloadErrMsg ||
              (language === 'en'
                ? 'Could not remove submission. Try again or contact support.'
                : 'Impossible de retirer la soumission.'),
          );
          return;
        }

        console.log('[MySubmissions] withdraw: success', submission.id);
        setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
        setUnseenChanges((prev) => {
          const next = new Set(prev);
          next.delete(submission.id);
          return next;
        });
        previousStatusesRef.current.delete(submission.id);
        toast.success(
          language === 'en'
            ? 'Submission removed.'
            : language === 'fr'
              ? 'Soumission supprimée.'
              : 'Sabmisen i raetem.',
        );
      } catch (err) {
        console.error('!!! WITHDRAW FAILED !!!', err);
        if (
          err instanceof FunctionsHttpError ||
          (err as { name?: string })?.name === 'FunctionsHttpError'
        ) {
          const ctx = (err as FunctionsHttpError).context as Response | undefined;
          if (ctx && typeof ctx.status === 'number') {
            let bodyText = '';
            try {
              bodyText = await ctx.clone().text();
            } catch (readErr) {
              bodyText = `(could not read body: ${String(readErr)})`;
            }
            console.error('[MySubmissions] FunctionsHttpError details (catch)', {
              status: ctx.status,
              statusText: ctx.statusText,
              bodyText: bodyText.slice(0, 4000),
            });
          }
        }
        toast.error(language === 'en' ? 'Could not remove submission.' : 'Échec.');
      } finally {
        setWithdrawingId(null);
      }
    },
    [user?.id, language, refreshBusinesses],
  );

  const handleViewLiveListing = useCallback(
    async (submission: Submission) => {
      if (!user?.id) return;

      if (submission.listingSource === 'live' && submission.offeringId) {
        const { data: off, error: oErr } = await supabase
          .from('business_offerings')
          .select(OFFERING_LIVE_COLS)
          .eq('id', submission.offeringId)
          .maybeSingle();
        if (oErr || !off) {
          console.error('[MySubmissions] view live offering:', oErr);
          toast.error(
            language === 'en'
              ? 'Could not open listing. Refresh and try again.'
              : 'Impossible d’ouvrir l’annonce.',
          );
          return;
        }
        const profileId = String((off as Record<string, unknown>).business_id ?? '').trim();
        const { data: prof, error: pErr } = await supabase
          .from('businesses')
          .select(PROFILE_LIVE_COLS)
          .eq('id', profileId)
          .maybeSingle();
        if (pErr || !prof) {
          console.error('[MySubmissions] view live profile:', pErr);
          toast.error(
            language === 'en'
              ? 'Could not open listing. Refresh and try again.'
              : 'Impossible d’ouvrir l’annonce.',
          );
          return;
        }
        setSelectedBusiness(
          mapJoinedOfferingToBusiness(
            off as Record<string, unknown>,
            prof as Record<string, unknown>,
            SUPABASE_URL,
          ),
        );
        setCurrentView('business-detail');
        return;
      }

      const norm = (s: string) => s.trim().toLowerCase();
      const targetName = norm(submission.name);
      const linkProfileId = submission.business_id ? String(submission.business_id) : '';

      const pickOfferingRow = (rows: Record<string, unknown>[]) => {
        const byTitle = rows.find(
          (r) => norm(String((r.title as string) || '')) === targetName,
        );
        return byTitle || rows[0];
      };

      // Approved live data: edge (service role) first, then direct PostgREST fallback.
      if (submission.status === 'approved') {
        type LiveItem = {
          offering: Record<string, unknown>;
          business: Record<string, unknown>;
        };
        const { data: edgeData, error: edgeErr } = await supabase.functions.invoke(
          'manage-business',
          {
            body: {
              action: 'get_owner_offerings_live',
              userId: user.id,
              ...(linkProfileId ? { businessId: linkProfileId } : {}),
            },
          },
        );
        const edgePayload = edgeData as
          | { success?: boolean; items?: LiveItem[]; error?: string }
          | null
          | undefined;
        if (edgeErr) {
          console.error('[MySubmissions] get_owner_offerings_live:', edgeErr, edgeData);
        } else if (
          edgePayload?.success &&
          Array.isArray(edgePayload.items) &&
          edgePayload.items.length > 0
        ) {
          const items = edgePayload.items.filter((x) => x?.offering && x?.business);
          if (items.length > 0) {
            const byTitle = items.find(
              (x) => norm(String((x.offering.title as string) || '')) === targetName,
            );
            const pick = byTitle || items[0];
            setSelectedBusiness(
              mapJoinedOfferingToBusiness(pick.offering, pick.business, SUPABASE_URL),
            );
            setCurrentView('business-detail');
            return;
          }
        }

        let offRows: Record<string, unknown>[] | null = null;
        let loadError: unknown = null;

        if (linkProfileId) {
          const { data, error } = await supabase
            .from('business_offerings')
            .select(OFFERING_LIVE_COLS)
            .eq('business_id', linkProfileId)
            .order('created_at', { ascending: false });
          if (error) loadError = error;
          else if (data?.length) offRows = data as Record<string, unknown>[];
        }

        if ((!offRows || offRows.length === 0) && user.id) {
          const { data: profiles, error: profErr } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_id', user.id);
          if (profErr) {
            loadError = profErr;
          } else {
            const ids = (profiles || [])
              .map((p: { id: string }) => p.id)
              .filter(Boolean);
            if (ids.length > 0) {
              const { data, error } = await supabase
                .from('business_offerings')
                .select(OFFERING_LIVE_COLS)
                .in('business_id', ids)
                .order('created_at', { ascending: false });
              if (error) loadError = error;
              else if (data?.length) {
                offRows = data as Record<string, unknown>[];
                loadError = null;
              }
            }
          }
        }

        if (loadError) {
          console.error('[MySubmissions] load offering for live view:', loadError);
        }
        if ((!offRows || offRows.length === 0) && loadError) {
          toast.error(
            language === 'en'
              ? 'Could not load listing details. If this persists, check database access policies.'
              : 'Impossible de charger les détails de l’annonce.',
          );
        }

        if (offRows && offRows.length > 0) {
          const chosen = pickOfferingRow(offRows);
          if (
            offRows.length === 1 &&
            norm(String((chosen.title as string) || '')) !== targetName &&
            targetName.length > 0
          ) {
            toast.error(
              language === 'en'
                ? `Live deal "${submission.name}" wasn't found for this business yet. Ask admin to re-approve using the updated approvals flow.`
                : language === 'fr'
                  ? `L’offre « ${submission.name} » n’est pas encore en ligne. Demandez à l’admin de ré-approuver.`
                  : `Dil "${submission.name}" i no stap laef yet. Askem admin blong re-apruvum.`,
            );
          }
          const profileId = String(chosen.business_id ?? '').trim();
          if (profileId) {
            const { data: prof, error: profFetchErr } = await supabase
              .from('businesses')
              .select(PROFILE_LIVE_COLS)
              .eq('id', profileId)
              .maybeSingle();
            if (profFetchErr) {
              console.error('[MySubmissions] profile for live view:', profFetchErr);
              toast.error(
                language === 'en'
                  ? 'Could not load listing details. If this persists, check database access policies.'
                  : 'Impossible de charger les détails de l’annonce.',
              );
            } else if (prof) {
              setSelectedBusiness(
                mapJoinedOfferingToBusiness(
                  chosen,
                  prof as Record<string, unknown>,
                  SUPABASE_URL,
                ),
              );
              setCurrentView('business-detail');
              return;
            }
          }
        }
      }

      const ownerListings = dbBusinesses.filter((b) => b.ownerId === user.id);
      let biz: Business | undefined = ownerListings.find((b) => norm(b.name) === targetName);
      if (!biz && linkProfileId) {
        biz = ownerListings.find((b) => b.profileBusinessId === linkProfileId);
      }

      if (!biz) {
        const { data: rows, error } = await supabase.from('businesses').select('*').eq('owner_id', user.id);
        if (error) {
          console.error('[MySubmissions] businesses lookup:', error);
          toast.error(
            language === 'en'
              ? 'Could not load your listing. Please try again.'
              : 'Impossible de charger votre annonce.',
          );
          return;
        }
        const row = (rows || []).find((r: Record<string, unknown>) => norm(String(r.name ?? '')) === targetName);
        if (row) {
          biz = mapDbRowToBusiness(row);
        }
      }

      if (!biz) {
        toast.error(
          language === 'en'
            ? 'Live listing not found. If you were just approved, refresh the page or open your listing from Explore Deals.'
            : 'Annonce introuvable. Actualisez la page ou ouvrez-la depuis les offres.',
        );
        return;
      }

      setSelectedBusiness(biz);
      setCurrentView('business-detail');
    },
    [user, dbBusinesses, language, setSelectedBusiness, setCurrentView],
  );

  // Load pending rows + active live offerings (Explore) into one list
  const loadSubmissions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let pendingRows: Submission[] = [];

    const applyMerged = (pending: Submission[], live: Submission[]) => {
      const merged = mergePendingAndLiveRows(pending, live);
      setSubmissions(merged);
      if (!initialLoadDone.current) {
        const statusMap = new Map<string, string>();
        merged.forEach((b) => {
          if (!b.id.startsWith('live:')) {
            statusMap.set(b.id, b.status);
          }
        });
        previousStatusesRef.current = statusMap;
        initialLoadDone.current = true;
      }
    };

    try {
      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: { action: 'get_pending', userId: user.id },
      });

      if (Array.isArray(data?.businesses)) {
        pendingRows = data.businesses as Submission[];
      } else {
        const { data: directData, error: directError } = await supabase
          .from('pending_businesses')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false });

        if (!directError && directData) {
          pendingRows = directData as Submission[];
        }
      }
      if (error) {
        console.warn('[MySubmissions] get_pending invoke:', error.message || error);
      }

      const liveRows = await fetchLiveSubmissionsForOwner(user.id);
      applyMerged(pendingRows, liveRows);
    } catch (err) {
      console.error('Failed to load submissions:', err);
      try {
        const { data, error } = await supabase
          .from('pending_businesses')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false });
        pendingRows = !error && data ? (data as Submission[]) : [];
        const liveRows = await fetchLiveSubmissionsForOwner(user.id);
        applyMerged(pendingRows, liveRows);
      } catch (e) {
        console.error('Direct query also failed:', e);
        setSubmissions([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Real-time subscription for status changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('my-submissions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pending_businesses',
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          const oldStatus = previousStatusesRef.current.get(updated.id);

          // Update the submission in state
          setSubmissions(prev =>
            prev.map(s =>
              s.id === updated.id
                ? {
                    ...s,
                    status: updated.status,
                    admin_notes: updated.admin_notes,
                    reviewed_at: updated.reviewed_at,
                  }
                : s
            )
          );

          // Check if status actually changed
          if (oldStatus && oldStatus !== updated.status) {
            // Mark as unseen
            setUnseenChanges(prev => {
              const next = new Set(prev);
              next.add(updated.id);
              return next;
            });

            // Show toast notification
            if (updated.status === 'approved') {
              toast.success(
                language === 'en'
                  ? `"${updated.name}" has been approved! It's now live.`
                  : language === 'fr'
                  ? `"${updated.name}" a été approuvé ! Il est maintenant en ligne.`
                  : `"${updated.name}" i bin apruvum! I stap laef nao.`,
                {
                  duration: 8000,
                  icon: <CheckCircle className="w-5 h-5 text-green-500" />,
                }
              );
            } else if (updated.status === 'rejected') {
              toast.error(
                language === 'en'
                  ? `"${updated.name}" was not approved. Check admin notes for details.`
                  : language === 'fr'
                  ? `"${updated.name}" n'a pas été approuvé. Consultez les notes de l'admin.`
                  : `"${updated.name}" i no bin apruvum. Jekem admin notes.`,
                {
                  duration: 8000,
                  icon: <XCircle className="w-5 h-5 text-red-500" />,
                }
              );
            }

            // Update previous status
            previousStatusesRef.current.set(updated.id, updated.status);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pending_businesses',
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const newSub = payload.new as Submission;
          setSubmissions(prev => {
            if (prev.some(s => s.id === newSub.id)) return prev;
            return [newSub, ...prev];
          });
          previousStatusesRef.current.set(newSub.id, newSub.status);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'pending_businesses',
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const oldRow = payload.old as { id?: string } | null;
          if (oldRow?.id) {
            previousStatusesRef.current.delete(oldRow.id);
            setUnseenChanges((prev) => {
              const next = new Set(prev);
              next.delete(oldRow.id);
              return next;
            });
          }
          void loadSubmissions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, language, loadSubmissions]);

  // Notify parent of unseen changes count
  useEffect(() => {
    onNewStatusChange?.(unseenChanges.size);
  }, [unseenChanges, onNewStatusChange]);

  const markAsSeen = (id: string) => {
    setUnseenChanges(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const markAllSeen = () => {
    setUnseenChanges(new Set());
  };

  // Filter submissions
  const filteredSubmissions = submissions.filter(s => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const pendingCount = submissions.filter(s => s.status === 'pending').length;
  const approvedCount = submissions.filter(s => s.status === 'approved').length;
  const rejectedCount = submissions.filter(s => s.status === 'rejected').length;

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved':
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-500" />,
          label: language === 'en' ? 'Approved' : language === 'fr' ? 'Approuvé' : 'Apruvum',
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          badge: 'bg-green-100 text-green-700 border-green-200',
          dot: 'bg-green-500',
        };
      case 'rejected':
        return {
          icon: <XCircle className="w-5 h-5 text-red-500" />,
          label: language === 'en' ? 'Not Approved' : language === 'fr' ? 'Refusé' : 'No Apruvum',
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          badge: 'bg-red-100 text-red-700 border-red-200',
          dot: 'bg-red-500',
        };
      default:
        return {
          icon: <Clock className="w-5 h-5 text-yellow-500" />,
          label: language === 'en' ? 'Under Review' : language === 'fr' ? 'En cours de révision' : 'Stap Lukluk',
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',
          dot: 'bg-yellow-500',
        };
    }
  };

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      dining: 'Dining',
      activities: 'Activities',
      tours: 'Tours',
      shopping: 'Shopping',
      spa: 'Spa & Wellness',
      accommodation: 'Accommodation',
    };
    return labels[cat] || cat;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeSince = (dateStr: string) => {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return language === 'en' ? 'Just now' : language === 'fr' ? 'À l\'instant' : 'Jas nao';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-teal-500 animate-spin mb-4" />
        <p className="text-sm text-gray-500 font-medium">
          {language === 'en' ? 'Loading your submissions...' : language === 'fr' ? 'Chargement de vos soumissions...' : 'Lodem ol sabmisen blong yu...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                {language === 'en' ? 'My Submissions' : language === 'fr' ? 'Mes Soumissions' : 'Ol Sabmisen Blong Mi'}
                {unseenChanges.size > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-bold animate-pulse">
                    <BellRing className="w-3 h-3" />
                    {unseenChanges.size} new
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500">
                {language === 'en'
                  ? 'Track the status of all your business listing submissions'
                  : language === 'fr'
                  ? 'Suivez le statut de toutes vos soumissions'
                  : 'Lukluk status blong ol sabmisen blong yu'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unseenChanges.size > 0 && (
              <button
                onClick={markAllSeen}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 text-gray-600 text-xs font-medium hover:bg-gray-100 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                {language === 'en' ? 'Mark all read' : 'Tout lu'}
              </button>
            )}
            <button
              onClick={loadSubmissions}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {language === 'en' ? 'Refresh' : language === 'fr' ? 'Actualiser' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setFilter('all')}
            className={`p-3 rounded-xl border transition-all text-left ${
              filter === 'all'
                ? 'border-teal-300 bg-teal-50 ring-2 ring-teal-200'
                : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{submissions.length}</p>
            <p className="text-xs text-gray-500 font-medium">
              {language === 'en' ? 'Total' : language === 'fr' ? 'Total' : 'Evriwan'}
            </p>
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`p-3 rounded-xl border transition-all text-left ${
              filter === 'pending'
                ? 'border-yellow-300 bg-yellow-50 ring-2 ring-yellow-200'
                : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
            <p className="text-xs text-gray-500 font-medium">
              {language === 'en' ? 'Pending' : language === 'fr' ? 'En attente' : 'Weit'}
            </p>
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`p-3 rounded-xl border transition-all text-left ${
              filter === 'approved'
                ? 'border-green-300 bg-green-50 ring-2 ring-green-200'
                : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
            <p className="text-xs text-gray-500 font-medium">
              {language === 'en' ? 'Approved' : language === 'fr' ? 'Approuvé' : 'Apruvum'}
            </p>
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`p-3 rounded-xl border transition-all text-left ${
              filter === 'rejected'
                ? 'border-red-300 bg-red-50 ring-2 ring-red-200'
                : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
            <p className="text-xs text-gray-500 font-medium">
              {language === 'en' ? 'Not Approved' : language === 'fr' ? 'Refusé' : 'No Apruvum'}
            </p>
          </button>
        </div>
      </div>

      {/* Real-time indicator */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <p className="text-xs text-gray-400 font-medium">
          {language === 'en'
            ? 'Live updates enabled — status changes appear instantly'
            : language === 'fr'
            ? 'Mises à jour en direct — les changements apparaissent instantanément'
            : 'Laef update i stap — status change i soa kwiktaem'}
        </p>
      </div>

      {/* Submissions List */}
      {filteredSubmissions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-50 flex items-center justify-center">
            <Store className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {filter === 'all'
              ? (language === 'en' ? 'No Submissions Yet' : language === 'fr' ? 'Aucune soumission' : 'No gat sabmisen yet')
              : (language === 'en' ? `No ${filter} submissions` : `Aucune soumission ${filter}`)}
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            {filter === 'all'
              ? (language === 'en'
                  ? 'Submit your first business listing to get started!'
                  : language === 'fr'
                  ? 'Soumettez votre première entreprise pour commencer !'
                  : 'Sabmitem faswan bisnis blong yu blong statem!')
              : (language === 'en' ? 'Try a different filter to see more results.' : 'Essayez un autre filtre.')}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => {
                // Navigate to the submit tab in the dashboard
                const event = new CustomEvent('switch-dashboard-tab', { detail: 'submit' });
                window.dispatchEvent(event);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200"
            >
              <Store className="w-5 h-5" />
              {language === 'en'
                ? 'Submit a business listing'
                : language === 'fr'
                  ? 'Soumettre une fiche commerciale'
                  : 'Sabmitem wan business listing'}
            </button>
          )}
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              {language === 'en' ? 'Show All' : 'Afficher tout'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map((submission) => {
            const config = getStatusConfig(submission.status);
            const isExpanded = expandedId === submission.id;
            const isUnseen = unseenChanges.has(submission.id);

            return (
              <div
                key={submission.id}
                className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                  isUnseen
                    ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-indigo-100'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                {/* Unseen notification bar */}
                {isUnseen && (
                  <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                      <BellRing className="w-4 h-4" />
                      <span className="text-xs font-bold">
                        {language === 'en' ? 'Status Updated!' : language === 'fr' ? 'Statut mis à jour !' : 'Status i jenj!'}
                      </span>
                      <span className="text-xs text-white/80">
                        {submission.status === 'approved'
                          ? (language === 'en' ? 'Your listing has been approved!' : 'Votre annonce a été approuvée !')
                          : (language === 'en' ? 'Your listing was reviewed.' : 'Votre annonce a été examinée.')}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsSeen(submission.id);
                      }}
                      className="p-1 rounded-md hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Main card content */}
                <button
                  onClick={() => {
                    setExpandedId(isExpanded ? null : submission.id);
                    if (isUnseen) markAsSeen(submission.id);
                  }}
                  className="w-full p-4 sm:p-5 flex items-center gap-4 text-left"
                >
                  {/* Image thumbnail */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                    {submission.image ? (
                      <img
                        src={submission.image}
                        alt={submission.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Store className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                        {submission.name}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      {submission.listingSource === 'live' && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 font-semibold capitalize">
                          {language === 'en' ? 'Live on Explore' : language === 'fr' ? 'En ligne' : 'Laef long Explore'}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-gray-100 font-medium capitalize">
                        {getCategoryLabel(submission.category)}
                      </span>
                      {submission.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {submission.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {getTimeSince(submission.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${config.badge}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${config.dot} ${submission.status === 'pending' ? 'animate-pulse' : ''}`} />
                      {config.label}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 sm:px-5 pb-5">
                    {/* Status Timeline */}
                    <div className="py-4">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                        {language === 'en' ? 'Status Timeline' : language === 'fr' ? 'Chronologie' : 'Taemlaen'}
                      </h4>
                      <div className="relative pl-6 space-y-4">
                        {/* Submitted */}
                        <div className="relative">
                          <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                          <div className="absolute -left-[14px] top-5 w-0.5 h-full bg-gray-200" />
                          <p className="text-sm font-semibold text-gray-900">
                            {language === 'en' ? 'Submitted' : language === 'fr' ? 'Soumis' : 'Sabmitem'}
                          </p>
                          <p className="text-xs text-gray-400">{formatDate(submission.created_at)}</p>
                        </div>

                        {/* Under Review */}
                        <div className="relative">
                          <div className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                            submission.status === 'pending' ? 'bg-yellow-400 animate-pulse' : 'bg-yellow-400'
                          }`}>
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                          {(submission.status === 'approved' || submission.status === 'rejected') && (
                            <div className="absolute -left-[14px] top-5 w-0.5 h-full bg-gray-200" />
                          )}
                          <p className="text-sm font-semibold text-gray-900">
                            {language === 'en' ? 'Under Review' : language === 'fr' ? 'En cours de révision' : 'Stap Lukluk'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {submission.status === 'pending'
                              ? (language === 'en' ? 'Currently being reviewed by our team' : 'En cours de révision par notre équipe')
                              : (language === 'en' ? 'Review completed' : 'Révision terminée')}
                          </p>
                        </div>

                        {/* Decision (if made) */}
                        {(submission.status === 'approved' || submission.status === 'rejected') && (
                          <div className="relative">
                            <div className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                              submission.status === 'approved' ? 'bg-green-500' : 'bg-red-500'
                            }`}>
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            </div>
                            <p className="text-sm font-semibold text-gray-900">
                              {submission.status === 'approved'
                                ? (language === 'en' ? 'Approved & Live' : language === 'fr' ? 'Approuvé et en ligne' : 'Apruvum & Laef')
                                : (language === 'en' ? 'Not Approved' : language === 'fr' ? 'Non approuvé' : 'No Apruvum')}
                            </p>
                            <p className="text-xs text-gray-400">
                              {submission.reviewed_at ? formatDate(submission.reviewed_at) : ''}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Admin Notes */}
                    {submission.admin_notes && (
                      <div className={`rounded-xl p-4 mb-4 ${
                        submission.status === 'approved'
                          ? 'bg-green-50 border border-green-200'
                          : submission.status === 'rejected'
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-yellow-50 border border-yellow-200'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <ShieldCheck className={`w-4 h-4 ${
                            submission.status === 'approved' ? 'text-green-600' :
                            submission.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'
                          }`} />
                          <h4 className={`text-sm font-bold ${
                            submission.status === 'approved' ? 'text-green-800' :
                            submission.status === 'rejected' ? 'text-red-800' : 'text-yellow-800'
                          }`}>
                            {language === 'en' ? 'Admin Notes' : language === 'fr' ? 'Notes de l\'admin' : 'Admin Notes'}
                          </h4>
                        </div>
                        <p className={`text-sm ${
                          submission.status === 'approved' ? 'text-green-700' :
                          submission.status === 'rejected' ? 'text-red-700' : 'text-yellow-700'
                        }`}>
                          {submission.admin_notes}
                        </p>
                      </div>
                    )}

                    {/* Submission Details */}
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {language === 'en' ? 'Submission Details' : language === 'fr' ? 'Détails de la soumission' : 'Ol Ditel'}
                      </h4>

                      {submission.description && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-0.5">
                            {language === 'en' ? 'Description' : 'Description'}
                          </p>
                          {looksLikeRichDescriptionHtml(submission.description) ? (
                            <div
                              className={`${PROSE_CLASSES} text-sm text-gray-700`}
                              dangerouslySetInnerHTML={{
                                __html: sanitizeBusinessDescriptionHtml(submission.description),
                              }}
                            />
                          ) : (
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{submission.description}</p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {submission.discount && (
                          <div className="flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5 text-orange-500" />
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium">Discount</p>
                              <p className="text-xs font-semibold text-gray-700">{submission.discount}</p>
                            </div>
                          </div>
                        )}
                        {(submission.original_price > 0 || submission.deal_price > 0) && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-3.5 h-3.5 text-green-500" />
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium">Price</p>
                              <p className="text-xs font-semibold text-gray-700">
                                <span className="line-through text-gray-400">${submission.original_price}</span>
                                {' '}
                                <span className="text-green-600">${submission.deal_price}</span>
                              </p>
                            </div>
                          </div>
                        )}
                        {submission.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-blue-500" />
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium">Phone</p>
                              <p className="text-xs font-semibold text-gray-700">{submission.phone}</p>
                            </div>
                          </div>
                        )}
                        {submission.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-purple-500" />
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium">Email</p>
                              <p className="text-xs font-semibold text-gray-700">{submission.email}</p>
                            </div>
                          </div>
                        )}
                        {submission.hours && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-teal-500" />
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium">Hours</p>
                              <p className="text-xs font-semibold text-gray-700">{submission.hours}</p>
                            </div>
                          </div>
                        )}
                        {submission.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-red-500" />
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium">Location</p>
                              <p className="text-xs font-semibold text-gray-700">{submission.location}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons based on status */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleWithdrawSubmission(submission);
                        }}
                        disabled={withdrawingId === submission.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {withdrawingId === submission.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        {submission.listingSource === 'live'
                          ? language === 'en'
                            ? 'Hide from Explore'
                            : language === 'fr'
                              ? 'Masquer sur Explore'
                              : 'Haed long Explore'
                          : language === 'en'
                            ? 'Delete submission'
                            : language === 'fr'
                              ? 'Supprimer la soumission'
                              : 'Raetem sabmisen'}
                      </button>
                      {submission.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => void handleViewLiveListing(submission)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {language === 'en' ? 'View Live Listing' : 'Voir l\'annonce'}
                        </button>
                      )}
                      {submission.status === 'rejected' && (
                        <button
                          onClick={() => {
                            const event = new CustomEvent('switch-dashboard-tab', {
                              detail: { tab: 'submit', submission },
                            });
                            window.dispatchEvent(event);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold hover:bg-orange-100 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          {language === 'en' ? 'Edit & Resubmit' : language === 'fr' ? 'Modifier et resoumettre' : 'Editim mo Sabmitem bakegen'}
                        </button>
                      )}
                      {submission.status === 'pending' && (
                        <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-yellow-50 text-yellow-700 text-xs font-medium">
                          <Info className="w-3.5 h-3.5" />
                          {language === 'en'
                            ? 'Our team typically reviews within 24 hours'
                            : language === 'fr'
                            ? 'Notre équipe examine généralement dans les 24 heures'
                            : 'Tim blong mifala i lukluk insaed 24 aoa'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Helpful info card */}
      {submissions.length > 0 && (
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl border border-teal-200 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-teal-800">
                {language === 'en' ? 'How the Review Process Works' : language === 'fr' ? 'Comment fonctionne le processus' : 'Olsem wanem proses i wok'}
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-teal-700">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-200 text-teal-800 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                  {language === 'en'
                    ? 'You submit your business listing with all the details'
                    : 'Vous soumettez votre annonce avec tous les détails'}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-200 text-teal-800 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                  {language === 'en'
                    ? 'Our admin team reviews your submission (usually within 24 hours)'
                    : 'Notre équipe examine votre soumission (généralement dans les 24 heures)'}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-200 text-teal-800 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                  {language === 'en'
                    ? 'You\'ll see the status update here instantly when a decision is made'
                    : 'Vous verrez la mise à jour du statut ici instantanément'}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-200 text-teal-800 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">4</span>
                  {language === 'en'
                    ? 'Approved listings go live immediately for tourists to discover'
                    : 'Les annonces approuvées sont publiées immédiatement'}
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MySubmissions;

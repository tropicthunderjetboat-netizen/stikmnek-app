import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle, Clock, Calendar, Tag, ArrowRight,
  RefreshCw, X, ChevronDown, ChevronUp, Loader2, Store, EyeOff
} from 'lucide-react';
import DealReactivateControl from './DealReactivateControl';

interface ExpiringDeal {
  id: string;
  businessId: string;
  name: string;
  discount: string;
  original_price: number;
  deal_price: number;
  discount_valid_until: string;
  category: string;
  image: string;
  daysRemaining: number;
  expired: boolean;
}

interface DealExpiryWarningBannerProps {
  userId: string;
  onUpdateDeal: (businessId: string) => void;
}

const DealExpiryWarningBanner: React.FC<DealExpiryWarningBannerProps> = ({
  userId,
  onUpdateDeal,
}) => {
  const [expiringDeals, setExpiringDeals] = useState<ExpiringDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('deal-expiry-dismissed');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only keep dismissals from today
        const today = new Date().toISOString().split('T')[0];
        if (parsed.date === today) {
          return new Set(parsed.ids || []);
        }
      }
    } catch {}
    return new Set();
  });
  const [collapsed, setCollapsed] = useState(false);

  const fetchExpiringDeals = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      const now = new Date();
      const sevenDaysFromNow = new Date(now);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      // Per-deal dates on business_offerings; resolve profile ids first (avoid
      // `.eq('businesses.owner_id', …)` — not reliable in PostgREST).
      const { data: profiles, error: pe } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', userId);

      if (pe) {
        console.error('[DealExpiryWarning] businesses query:', pe);
        setLoading(false);
        return;
      }

      const profileIds = (profiles || []).map((p: { id: string }) => p.id).filter(Boolean);
      if (profileIds.length === 0) {
        setExpiringDeals([]);
        setLoading(false);
        return;
      }

      // Include already-expired deals (no lower bound) so owners can reactivate them —
      // expired deals are hidden from tourists until turned back on.
      const { data, error } = await supabase
        .from('business_offerings')
        .select(`
          id, business_id, title, discount, original_price, deal_price, discount_valid_until, image,
          businesses!inner ( owner_id, category, name )
        `)
        .in('business_id', profileIds)
        .not('discount_valid_until', 'is', null)
        .lte('discount_valid_until', sevenDaysFromNow.toISOString().split('T')[0]);

      if (error) {
        console.error('[DealExpiryWarning] Query error:', error);
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const todayStr = now.toISOString().split('T')[0];
        const deals: ExpiringDeal[] = data.map((row: Record<string, unknown>) => {
          const b = row.businesses as Record<string, unknown> | undefined;
          const untilStr = String(row.discount_valid_until).slice(0, 10);
          const expiryDate = new Date(String(row.discount_valid_until) + 'T23:59:59');
          const diffMs = expiryDate.getTime() - now.getTime();
          const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          const title = String(row.title || '').trim();
          const venue = String(b?.name || '').trim();
          const displayName = title || venue || 'Listing';

          return {
            id: String(row.id),
            businessId: String(row.business_id ?? ''),
            name: displayName,
            discount: String(row.discount ?? ''),
            original_price: Number(row.original_price) || 0,
            deal_price: Number(row.deal_price) || 0,
            discount_valid_until: String(row.discount_valid_until),
            category: String(b?.category ?? ''),
            image: String(row.image ?? ''),
            daysRemaining,
            expired: untilStr < todayStr,
          };
        });

        // Sort by days remaining (most urgent first)
        deals.sort((a, b) => a.daysRemaining - b.daysRemaining);
        setExpiringDeals(deals);
      } else {
        setExpiringDeals([]);
      }
    } catch (err) {
      console.error('[DealExpiryWarning] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchExpiringDeals();
  }, [fetchExpiringDeals]);

  const handleDismiss = (dealId: string) => {
    const newDismissed = new Set(dismissed);
    newDismissed.add(dealId);
    setDismissed(newDismissed);
    try {
      localStorage.setItem('deal-expiry-dismissed', JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        ids: Array.from(newDismissed),
      }));
    } catch {}
  };

  const handleDismissAll = () => {
    // Only dismiss soon-to-expire deals; expired ones stay visible until reactivated.
    const allIds = new Set(expiringDeals.filter(d => !d.expired).map(d => d.id));
    setDismissed(allIds);
    try {
      localStorage.setItem('deal-expiry-dismissed', JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        ids: Array.from(allIds),
      }));
    } catch {}
  };

  // Filter out dismissed deals
  const visibleDeals = expiringDeals.filter(d => !dismissed.has(d.id));
  const expiredDeals = visibleDeals.filter(d => d.expired);
  const soonDeals = visibleDeals.filter(d => !d.expired);

  // Don't render if loading or no visible deals
  if (loading) return null;
  if (visibleDeals.length === 0) return null;

  const urgentDeals = soonDeals.filter(d => d.daysRemaining <= 1);
  const warningDeals = soonDeals.filter(d => d.daysRemaining > 1);
  const hasUrgent = urgentDeals.length > 0;

  const formatExpiryDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysLabel = (days: number) => {
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `${days} days left`;
  };

  return (
    <div className="mb-6 space-y-3">
      {/* ── Expired (hidden) deals — need reactivation ── */}
      {expiredDeals.length > 0 && (
        <div className="rounded-2xl border border-gray-300 bg-gradient-to-r from-gray-50 to-slate-50 shadow-lg shadow-gray-100/50 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
            <div className="w-11 h-11 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0 shadow-inner">
              <EyeOff className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-800 flex items-center gap-2">
                Expired Deals — Hidden from Tourists
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                  {expiredDeals.length} deal{expiredDeals.length > 1 ? 's' : ''}
                </span>
              </h3>
              <p className="text-xs mt-0.5 text-gray-500">
                These deals are off and no longer shown. Set a new expiry date and turn them back on.
              </p>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {expiredDeals.map(deal => (
              <div
                key={deal.id}
                className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {deal.image ? (
                  <img src={deal.image} alt={deal.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Store className="w-6 h-6 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{deal.name}</h4>
                    {deal.category && (
                      <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] text-gray-500 font-medium capitalize">
                        {deal.category}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-[10px] text-red-700 font-bold uppercase">
                      Expired
                    </span>
                  </div>
                  {deal.discount && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 mt-1">
                      <Tag className="w-3 h-3 text-gray-400" />
                      {deal.discount}
                    </span>
                  )}
                </div>
                <div className="sm:max-w-xs w-full">
                  <DealReactivateControl
                    businessId={deal.businessId}
                    offeringId={deal.id}
                    currentValidUntil={deal.discount_valid_until}
                    onReactivated={() => fetchExpiringDeals()}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header Bar */}
      {soonDeals.length > 0 && (
      <div
        className={`rounded-2xl border overflow-hidden transition-all ${
          hasUrgent
            ? 'bg-gradient-to-r from-red-50 via-red-50 to-orange-50 border-red-200 shadow-lg shadow-red-100/50'
            : 'bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border-amber-200 shadow-lg shadow-amber-100/50'
        }`}
      >
        {/* Banner Header */}
        <div
          className="flex items-center justify-between px-5 py-4 cursor-pointer"
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
              hasUrgent
                ? 'bg-red-100 shadow-inner'
                : 'bg-amber-100 shadow-inner'
            }`}>
              <AlertTriangle className={`w-6 h-6 ${hasUrgent ? 'text-red-600' : 'text-amber-600'}`} />
            </div>
            <div>
              <h3 className={`text-sm font-extrabold flex items-center gap-2 ${
                hasUrgent ? 'text-red-800' : 'text-amber-800'
              }`}>
                {hasUrgent ? 'Urgent: Deals Expiring Soon!' : 'Deal Expiry Warning'}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  hasUrgent
                    ? 'bg-red-200 text-red-800 animate-pulse'
                    : 'bg-amber-200 text-amber-800'
                }`}>
                  {soonDeals.length} deal{soonDeals.length > 1 ? 's' : ''}
                </span>
              </h3>
              <p className={`text-xs mt-0.5 ${hasUrgent ? 'text-red-600' : 'text-amber-600'}`}>
                {hasUrgent
                  ? `${urgentDeals.length} deal${urgentDeals.length > 1 ? 's' : ''} expiring within 24 hours — update now to keep attracting tourists`
                  : `${warningDeals.length} deal${warningDeals.length > 1 ? 's' : ''} expiring within 7 days — plan your next promotion`
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetchExpiringDeals();
              }}
              className={`p-1.5 rounded-lg transition-colors ${
                hasUrgent
                  ? 'text-red-400 hover:text-red-600 hover:bg-red-100'
                  : 'text-amber-400 hover:text-amber-600 hover:bg-amber-100'
              }`}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {soonDeals.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismissAll();
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  hasUrgent
                    ? 'text-red-500 hover:text-red-700 hover:bg-red-100'
                    : 'text-amber-500 hover:text-amber-700 hover:bg-amber-100'
                }`}
              >
                Dismiss All
              </button>
            )}
            {collapsed ? (
              <ChevronDown className={`w-5 h-5 ${hasUrgent ? 'text-red-400' : 'text-amber-400'}`} />
            ) : (
              <ChevronUp className={`w-5 h-5 ${hasUrgent ? 'text-red-400' : 'text-amber-400'}`} />
            )}
          </div>
        </div>

        {/* Deal Cards */}
        {!collapsed && (
          <div className="px-5 pb-5 space-y-3">
            {/* Urgent Deals (Red) */}
            {urgentDeals.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                variant="urgent"
                onUpdate={() => onUpdateDeal(deal.id)}
                onDismiss={() => handleDismiss(deal.id)}
                formatExpiryDate={formatExpiryDate}
                getDaysLabel={getDaysLabel}
              />
            ))}

            {/* Warning Deals (Amber) */}
            {warningDeals.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                variant="warning"
                onUpdate={() => onUpdateDeal(deal.id)}
                onDismiss={() => handleDismiss(deal.id)}
                formatExpiryDate={formatExpiryDate}
                getDaysLabel={getDaysLabel}
              />
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

// ─── Individual Deal Card ───
interface DealCardProps {
  deal: ExpiringDeal;
  variant: 'urgent' | 'warning';
  onUpdate: () => void;
  onDismiss: () => void;
  formatExpiryDate: (date: string) => string;
  getDaysLabel: (days: number) => string;
}

const DealCard: React.FC<DealCardProps> = ({
  deal,
  variant,
  onUpdate,
  onDismiss,
  formatExpiryDate,
  getDaysLabel,
}) => {
  const isUrgent = variant === 'urgent';

  return (
    <div className={`rounded-xl border overflow-hidden transition-all hover:shadow-md ${
      isUrgent
        ? 'bg-white border-red-200 hover:border-red-300'
        : 'bg-white border-amber-200 hover:border-amber-300'
    }`}>
      <div className="flex flex-col sm:flex-row">
        {/* Business Image */}
        <div className="sm:w-28 sm:h-auto h-24 flex-shrink-0 relative overflow-hidden">
          {deal.image ? (
            <img
              src={deal.image}
              alt={deal.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${
              isUrgent ? 'bg-red-50' : 'bg-amber-50'
            }`}>
              <Store className={`w-8 h-8 ${isUrgent ? 'text-red-200' : 'text-amber-200'}`} />
            </div>
          )}
          {/* Urgency Badge Overlay */}
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-sm ${
            isUrgent
              ? 'bg-red-600 text-white'
              : 'bg-amber-500 text-white'
          }`}>
            {isUrgent ? (
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                URGENT
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                WARNING
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Business Name & Category */}
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className="text-sm font-bold text-gray-900 truncate">{deal.name}</h4>
                <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] text-gray-500 font-medium capitalize flex-shrink-0">
                  {deal.category}
                </span>
              </div>

              {/* Deal Details Row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-2.5">
                {/* Current Discount */}
                {deal.discount && (
                  <div className="flex items-center gap-1.5">
                    <Tag className={`w-3.5 h-3.5 ${isUrgent ? 'text-red-500' : 'text-amber-500'}`} />
                    <span className="text-xs font-semibold text-gray-700">{deal.discount}</span>
                  </div>
                )}

                {/* Price */}
                {deal.deal_price > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 line-through">VT {deal.original_price.toLocaleString()}</span>
                    <span className={`text-xs font-bold ${isUrgent ? 'text-red-600' : 'text-amber-600'}`}>
                      VT {deal.deal_price.toLocaleString()}
                    </span>
                  </div>
                )}

                {/* Expiry Date */}
                <div className="flex items-center gap-1.5">
                  <Calendar className={`w-3.5 h-3.5 ${isUrgent ? 'text-red-400' : 'text-amber-400'}`} />
                  <span className="text-xs text-gray-500">
                    {formatExpiryDate(deal.discount_valid_until)}
                  </span>
                </div>
              </div>

              {/* Days Remaining Badge */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                  isUrgent
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-amber-100 text-amber-700 border border-amber-200'
                }`}>
                  <Clock className="w-3 h-3" />
                  {getDaysLabel(deal.daysRemaining)}
                </span>

                {/* Progress bar showing urgency */}
                <div className="flex-1 max-w-[120px] hidden sm:block">
                  <div className={`h-1.5 rounded-full overflow-hidden ${
                    isUrgent ? 'bg-red-100' : 'bg-amber-100'
                  }`}>
                    <div
                      className={`h-full rounded-full transition-all ${
                        isUrgent
                          ? 'bg-red-500'
                          : deal.daysRemaining <= 3
                            ? 'bg-amber-500'
                            : 'bg-amber-400'
                      }`}
                      style={{ width: `${Math.max(5, ((7 - deal.daysRemaining) / 7) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                onClick={onUpdate}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md ${
                  isUrgent
                    ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'
                    : 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-200'
                }`}
              >
                Update Deal
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDismiss}
                className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                  isUrgent
                    ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                    : 'text-amber-400 hover:text-amber-600 hover:bg-amber-50'
                }`}
              >
                <X className="w-3 h-3" />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealExpiryWarningBanner;

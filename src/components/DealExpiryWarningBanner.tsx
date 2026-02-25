import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle, Clock, Calendar, Tag, ArrowRight,
  RefreshCw, X, ChevronDown, ChevronUp, Loader2, Store
} from 'lucide-react';

interface ExpiringDeal {
  id: string;
  name: string;
  discount: string;
  original_price: number;
  deal_price: number;
  discount_valid_until: string;
  category: string;
  image: string;
  daysRemaining: number;
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

      // Query businesses owned by this user with discount_valid_until within 7 days
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, discount, original_price, deal_price, discount_valid_until, category, image')
        .eq('owner_id', userId)
        .not('discount_valid_until', 'is', null)
        .lte('discount_valid_until', sevenDaysFromNow.toISOString().split('T')[0])
        .gte('discount_valid_until', now.toISOString().split('T')[0]);

      if (error) {
        console.error('[DealExpiryWarning] Query error:', error);
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const deals: ExpiringDeal[] = data.map((b: any) => {
          const expiryDate = new Date(b.discount_valid_until + 'T23:59:59');
          const diffMs = expiryDate.getTime() - now.getTime();
          const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

          return {
            id: b.id,
            name: b.name,
            discount: b.discount || '',
            original_price: Number(b.original_price) || 0,
            deal_price: Number(b.deal_price) || 0,
            discount_valid_until: b.discount_valid_until,
            category: b.category || '',
            image: b.image || '',
            daysRemaining,
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
    const allIds = new Set(expiringDeals.map(d => d.id));
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

  // Don't render if loading or no visible deals
  if (loading) return null;
  if (visibleDeals.length === 0) return null;

  const urgentDeals = visibleDeals.filter(d => d.daysRemaining <= 1);
  const warningDeals = visibleDeals.filter(d => d.daysRemaining > 1);
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
      {/* Header Bar */}
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
                  {visibleDeals.length} deal{visibleDeals.length > 1 ? 's' : ''}
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
            {visibleDeals.length > 1 && (
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

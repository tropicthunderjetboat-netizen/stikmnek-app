import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext, type ViewMode } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { Bell, X, Check, CheckCheck, Ticket, Heart, Star, TrendingUp, Gift, Users, AlertCircle, Clock, ChevronRight } from 'lucide-react';

/** Keeps runtime validation in sync with `ViewMode` in AppContext. */
const VIEW_MODES = [
  'home',
  'deals',
  'map',
  'passes',
  'dashboard',
  'admin',
  'business-detail',
  'checkout',
  'payment-confirmation',
  'business-dashboard',
  'help',
  'faq',
  'business-guide',
  'business-new',
  'complete-profile',
  'complete-business-profile',
] as const satisfies readonly ViewMode[];

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value);
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link_view?: ViewMode;
  link_business_id?: string;
  is_read: boolean;
  created_at: string;
}

function notificationFromRow(row: Record<string, unknown>): Notification {
  const linkRaw = row.link_view;
  return {
    id: String(row.id ?? ''),
    type: String(row.type ?? ''),
    title: String(row.title ?? ''),
    message: String(row.message ?? ''),
    link_view: isViewMode(linkRaw) ? linkRaw : undefined,
    link_business_id:
      row.link_business_id != null && row.link_business_id !== ''
        ? String(row.link_business_id)
        : undefined,
    is_read: Boolean(row.is_read),
    created_at: String(row.created_at ?? ''),
  };
}

const NotificationCenter: React.FC = () => {
  const { user, setCurrentView, setSelectedBusiness, dbBusinesses } = useAppContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setNotifications((data ?? []).map((row) => notificationFromRow(row as Record<string, unknown>)));
    } catch (err) {
      console.error('Failed to load notifications:', err);
      // Generate some sample notifications for demo
      setNotifications(generateSampleNotifications());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        const n = notificationFromRow(payload.new as Record<string, unknown>);
        setNotifications((prev) => [n, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    if (user) {
      try {
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
      } catch (err) {
        console.error('Failed to mark all as read:', err);
      }
    }
  };

  const handleNotificationClick = (n: Notification) => {
    markAsRead(n.id);
    if (n.link_view) {
      if (n.link_business_id) {
        const bid = n.link_business_id;
        const biz = dbBusinesses.find(
          (b) => b.id === bid || b.profileBusinessId === bid,
        );
        if (biz) setSelectedBusiness(biz);
      }
      setCurrentView(n.link_view);
    }
    setOpen(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'deal': return <Ticket className="w-4 h-4 text-teal-500" />;
      case 'pass_expiry': return <Clock className="w-4 h-4 text-orange-500" />;
      case 'review': return <Star className="w-4 h-4 text-yellow-500" />;
      case 'savings': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'referral': return <Gift className="w-4 h-4 text-purple-500" />;
      case 'social': return <Users className="w-4 h-4 text-blue-500" />;
      case 'favorite': return <Heart className="w-4 h-4 text-red-500" />;
      case 'alert': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  const timeAgo = (date: string) => {
    const now = new Date();
    const d = new Date(date);
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const generateSampleNotifications = (): Notification[] => {
    if (!user) return [];
    const now = new Date();
    return [
      { id: 'n1', type: 'deal', title: 'New Deal Near You!', message: 'Blue Lagoon Snorkeling just added a 35% OFF deal. Check it out!', link_view: 'deals', is_read: false, created_at: new Date(now.getTime() - 30 * 60000).toISOString() },
      { id: 'n2', type: 'savings', title: 'Savings Milestone!', message: 'You\'ve saved over 5,000 VT with StikmNek. Keep exploring!', link_view: 'dashboard', is_read: false, created_at: new Date(now.getTime() - 2 * 3600000).toISOString() },
      { id: 'n3', type: 'pass_expiry', title: 'Pass Expiring Soon', message: 'Your pass expires in 3 days. Renew to keep saving!', link_view: 'passes', is_read: false, created_at: new Date(now.getTime() - 5 * 3600000).toISOString() },
      { id: 'n4', type: 'review', title: 'Business Responded', message: 'Waterfront Bar & Grill responded to your review. See what they said!', link_view: 'business-detail', link_business_id: 'b1', is_read: true, created_at: new Date(now.getTime() - 12 * 3600000).toISOString() },
      { id: 'n5', type: 'referral', title: 'Referral Bonus!', message: 'Your friend just signed up! You earned a bonus reward.', link_view: 'dashboard', is_read: true, created_at: new Date(now.getTime() - 24 * 3600000).toISOString() },
      { id: 'n6', type: 'social', title: 'Trending Deal', message: 'Tanna Volcano Day Trip is trending with 50+ redemptions today!', link_view: 'deals', is_read: true, created_at: new Date(now.getTime() - 36 * 3600000).toISOString() },
      { id: 'n7', type: 'favorite', title: 'Favorite Updated', message: 'Erakor Island Spa updated their discount to 30% OFF!', link_view: 'business-detail', link_business_id: 'b13', is_read: true, created_at: new Date(now.getTime() - 48 * 3600000).toISOString() },
    ];
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-teal-600 hover:bg-teal-100 transition-colors"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-[420px] divide-y divide-gray-50">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-gray-400">Loading notifications...</p>
              </div>
            ) : notifications.length > 0 ? (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors ${
                    !n.is_read ? 'bg-teal-50/30' : ''
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    !n.is_read ? 'bg-teal-100' : 'bg-gray-100'
                  }`}>
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold truncate ${!n.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <div className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 mt-2 flex-shrink-0" />
                </button>
              ))
            ) : (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications yet</p>
                <p className="text-xs text-gray-300 mt-1">We'll notify you about deals and updates</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-2.5">
              <button
                onClick={() => { setCurrentView('dashboard'); setOpen(false); }}
                className="w-full text-center text-xs font-semibold text-teal-600 hover:text-teal-700 py-1"
              >
                View All Notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;

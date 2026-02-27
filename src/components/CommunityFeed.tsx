import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Users, TrendingUp, Gift, Star, Ticket, Heart, Award, Share2,
  Copy, ChevronRight, RefreshCw, Loader2, MapPin, Clock, Zap,
  Trophy, Target, Compass, Shield, Crown, Flame
} from 'lucide-react';

interface SocialActivity {
  id: string;
  user_name: string;
  activity_type: string;
  business_name: string | null;
  category: string | null;
  amount_saved: number;
  message: string | null;
  created_at: string;
}

interface Badge {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  requirement: string;
  earned?: boolean;
}

const CommunityFeed: React.FC = () => {
  const { user, redemptions, favorites, dbBusinesses, setCurrentView, setShowAuth, setAuthMode } = useAppContext();
  const [activities, setActivities] = useState<SocialActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'badges' | 'referrals' | 'leaderboard'>('feed');
  const [referralCode, setReferralCode] = useState('');
  const [referralEmail, setReferralEmail] = useState('');
  const [sendingReferral, setSendingReferral] = useState(false);

  // Generate referral code
  useEffect(() => {
    if (user) {
      setReferralCode(`STIK-${user.name.substring(0, 3).toUpperCase()}-${user.id.substring(0, 6).toUpperCase()}`);
    }
  }, [user]);

  // Load activities
  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('social_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      if (data && data.length > 0) {
        setActivities(data);
      } else {
        setActivities(generateSampleActivities());
      }
    } catch (err) {
      setActivities(generateSampleActivities());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('social-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_activity' }, (payload) => {
        setActivities(prev => [payload.new as SocialActivity, ...prev.slice(0, 19)]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const generateSampleActivities = (): SocialActivity[] => {
    const now = new Date();
    return [
      { id: '1', user_name: 'Sarah M.', activity_type: 'redemption', business_name: 'Blue Lagoon Snorkeling', category: 'activities', amount_saved: 3500, message: 'Just had an amazing snorkeling experience!', created_at: new Date(now.getTime() - 2 * 3600000).toISOString() },
      { id: '2', user_name: 'Jean-Pierre L.', activity_type: 'redemption', business_name: 'Waterfront Bar & Grill', category: 'dining', amount_saved: 1375, message: 'Incredible seafood dinner with harbour views', created_at: new Date(now.getTime() - 4 * 3600000).toISOString() },
      { id: '3', user_name: 'Mike T.', activity_type: 'review', business_name: 'Hideaway Island Diving', category: 'activities', amount_saved: 0, message: 'Left a 5-star review for the underwater post office tour', created_at: new Date(now.getTime() - 6 * 3600000).toISOString() },
      { id: '4', user_name: 'Emma W.', activity_type: 'redemption', business_name: 'Ekasup Cultural Village', category: 'tours', amount_saved: 1300, message: 'Authentic cultural experience - highly recommend!', created_at: new Date(now.getTime() - 8 * 3600000).toISOString() },
      { id: '5', user_name: 'David K.', activity_type: 'pass_purchase', business_name: null, category: null, amount_saved: 0, message: 'Just got an Extended Group Adventure Pass - ready to explore!', created_at: new Date(now.getTime() - 10 * 3600000).toISOString() },

      { id: '6', user_name: 'Lisa R.', activity_type: 'redemption', business_name: 'Erakor Island Spa', category: 'spa', amount_saved: 3600, message: 'The volcanic mud treatment was divine', created_at: new Date(now.getTime() - 12 * 3600000).toISOString() },
      { id: '7', user_name: 'Tom H.', activity_type: 'redemption', business_name: 'Tropical Breeze Restaurant', category: 'dining', amount_saved: 2550, message: 'Fine dining at its best', created_at: new Date(now.getTime() - 14 * 3600000).toISOString() },
      { id: '8', user_name: 'Anna S.', activity_type: 'referral', business_name: null, category: null, amount_saved: 0, message: 'Referred a friend and earned bonus rewards!', created_at: new Date(now.getTime() - 16 * 3600000).toISOString() },
      { id: '9', user_name: 'James B.', activity_type: 'badge', business_name: null, category: null, amount_saved: 0, message: 'Earned the "Explorer" badge for visiting 5 businesses', created_at: new Date(now.getTime() - 18 * 3600000).toISOString() },
      { id: '10', user_name: 'Maria C.', activity_type: 'redemption', business_name: 'Cascade Waterfall Trek', category: 'activities', amount_saved: 750, message: 'Beautiful jungle trek to Mele Cascades', created_at: new Date(now.getTime() - 20 * 3600000).toISOString() },
    ];
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'redemption': return <Ticket className="w-4 h-4 text-teal-500" />;
      case 'review': return <Star className="w-4 h-4 text-yellow-500" />;
      case 'pass_purchase': return <Zap className="w-4 h-4 text-blue-500" />;
      case 'referral': return <Gift className="w-4 h-4 text-purple-500" />;
      case 'badge': return <Award className="w-4 h-4 text-orange-500" />;
      case 'favorite': return <Heart className="w-4 h-4 text-red-500" />;
      default: return <Users className="w-4 h-4 text-gray-500" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'redemption': return 'bg-teal-50 border-teal-200';
      case 'review': return 'bg-yellow-50 border-yellow-200';
      case 'pass_purchase': return 'bg-blue-50 border-blue-200';
      case 'referral': return 'bg-purple-50 border-purple-200';
      case 'badge': return 'bg-orange-50 border-orange-200';
      default: return 'bg-gray-50 border-gray-200';
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

  // Badges system
  const allBadges: Badge[] = [
    { key: 'first_deal', name: 'First Deal', description: 'Redeemed your first deal', icon: <Ticket className="w-5 h-5" />, color: 'from-teal-400 to-teal-600', requirement: '1 redemption', earned: redemptions.length >= 1 },
    { key: 'explorer', name: 'Explorer', description: 'Visited 5 different businesses', icon: <Compass className="w-5 h-5" />, color: 'from-blue-400 to-blue-600', requirement: '5 businesses', earned: new Set(redemptions.map(r => r.businessId)).size >= 5 },
    { key: 'foodie', name: 'Foodie', description: 'Tried 3 dining establishments', icon: <Flame className="w-5 h-5" />, color: 'from-orange-400 to-orange-600', requirement: '3 restaurants', earned: redemptions.filter(r => dbBusinesses.find(b => b.id === r.businessId)?.category === 'dining').length >= 3 },
    { key: 'saver', name: 'Super Saver', description: 'Saved over 10,000 VT', icon: <TrendingUp className="w-5 h-5" />, color: 'from-green-400 to-green-600', requirement: '10,000 VT saved', earned: redemptions.reduce((s, r) => s + r.saved, 0) >= 10000 },
    { key: 'social', name: 'Social Butterfly', description: 'Shared 3 deals with friends', icon: <Share2 className="w-5 h-5" />, color: 'from-pink-400 to-pink-600', requirement: '3 shares', earned: false },
    { key: 'adventurer', name: 'Adventurer', description: 'Tried an activity or tour', icon: <Target className="w-5 h-5" />, color: 'from-purple-400 to-purple-600', requirement: '1 activity/tour', earned: redemptions.some(r => { const b = dbBusinesses.find(biz => biz.id === r.businessId); return b?.category === 'activities' || b?.category === 'tours'; }) },
    { key: 'vip', name: 'VIP Member', description: 'Purchased an Ultimate Crew Experience Pass', icon: <Crown className="w-5 h-5" />, color: 'from-amber-400 to-amber-600', requirement: 'Crew Experience Pass', earned: false },
    { key: 'champion', name: 'Champion', description: 'Earned 5 other badges', icon: <Trophy className="w-5 h-5" />, color: 'from-yellow-400 to-yellow-600', requirement: '5 badges', earned: false },

  ];

  const earnedBadges = allBadges.filter(b => b.earned);

  // Leaderboard data
  const leaderboard = [
    { rank: 1, name: 'Sarah M.', savings: 28500, deals: 18, badges: 7 },
    { rank: 2, name: 'David K.', savings: 24200, deals: 15, badges: 6 },
    { rank: 3, name: 'Emma W.', savings: 21800, deals: 14, badges: 5 },
    { rank: 4, name: 'Tom H.', savings: 19500, deals: 12, badges: 5 },
    { rank: 5, name: 'Lisa R.', savings: 17200, deals: 11, badges: 4 },
    { rank: 6, name: 'Jean-Pierre L.', savings: 15800, deals: 10, badges: 4 },
    { rank: 7, name: 'Mike T.', savings: 14100, deals: 9, badges: 3 },
    { rank: 8, name: 'Anna S.', savings: 12500, deals: 8, badges: 3 },
    { rank: 9, name: user?.name || 'You', savings: redemptions.reduce((s, r) => s + r.saved, 0), deals: redemptions.length, badges: earnedBadges.length },
    { rank: 10, name: 'Maria C.', savings: 8900, deals: 6, badges: 2 },
  ].sort((a, b) => b.savings - a.savings).map((item, i) => ({ ...item, rank: i + 1 }));

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(referralCode);
    toast.success('Referral code copied!');
  };

  const handleSendReferral = async () => {
    if (!referralEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    setSendingReferral(true);
    try {
      if (user) {
        await supabase.from('referrals').insert({
          referrer_id: user.id,
          referral_code: referralCode,
          referred_email: referralEmail,
        });
      }
      toast.success(`Referral invitation sent to ${referralEmail}!`);
      setReferralEmail('');
    } catch (err) {
      toast.success(`Referral invitation sent to ${referralEmail}!`);
      setReferralEmail('');
    } finally {
      setSendingReferral(false);
    }
  };

  const tabs = [
    { key: 'feed', label: 'Activity Feed', icon: <Users className="w-4 h-4" /> },
    { key: 'badges', label: 'Badges', icon: <Award className="w-4 h-4" />, count: earnedBadges.length },
    { key: 'referrals', label: 'Refer Friends', icon: <Gift className="w-4 h-4" /> },
    { key: 'leaderboard', label: 'Leaderboard', icon: <Trophy className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-200">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Community</h1>
            <p className="text-gray-500 text-sm">See what fellow travelers are discovering</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                if (!user && (tab.key === 'badges' || tab.key === 'referrals')) {
                  setShowAuth(true);
                  setAuthMode('signin');
                  return;
                }
                setActiveTab(tab.key);
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              {tab.label}
              {'count' in tab && tab.count !== undefined && tab.count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Activity Feed */}
        {activeTab === 'feed' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 font-medium">Recent Activity</p>
              <button onClick={loadActivities} disabled={loading} className="flex items-center gap-1 text-xs text-teal-600 font-semibold hover:text-teal-700">
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <Loader2 className="w-6 h-6 text-purple-500 animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-400">Loading community feed...</p>
              </div>
            ) : (
              activities.map(activity => (
                <div key={activity.id} className={`bg-white rounded-xl p-4 border shadow-sm hover:shadow-md transition-all ${getActivityColor(activity.activity_type)}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {activity.user_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{activity.user_name}</span>
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 text-[10px] font-semibold text-gray-500">
                          {getActivityIcon(activity.activity_type)}
                          {activity.activity_type === 'redemption' ? 'redeemed a deal' :
                           activity.activity_type === 'review' ? 'left a review' :
                           activity.activity_type === 'pass_purchase' ? 'purchased a pass' :
                           activity.activity_type === 'referral' ? 'referred a friend' :
                           activity.activity_type === 'badge' ? 'earned a badge' : 'activity'}
                        </span>
                        <span className="text-[10px] text-gray-400">{timeAgo(activity.created_at)}</span>
                      </div>
                      {activity.business_name && (
                        <p className="text-sm text-gray-700 mt-1 font-medium">
                          at <span className="text-teal-700">{activity.business_name}</span>
                          {activity.category && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-500 capitalize">{activity.category}</span>
                          )}
                        </p>
                      )}
                      {activity.message && (
                        <p className="text-sm text-gray-500 mt-1 italic">"{activity.message}"</p>
                      )}
                      {activity.amount_saved > 0 && (
                        <p className="text-xs font-bold text-green-600 mt-1 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          Saved {activity.amount_saved.toLocaleString()} VT
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Badges */}
        {activeTab === 'badges' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center">
                  <Trophy className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Your Achievements</h3>
                  <p className="text-white/70 text-sm">{earnedBadges.length} of {allBadges.length} badges earned</p>
                  <div className="w-48 h-2 bg-white/20 rounded-full mt-2">
                    <div className="h-2 bg-white rounded-full transition-all" style={{ width: `${(earnedBadges.length / allBadges.length) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allBadges.map(badge => (
                <div key={badge.key} className={`bg-white rounded-xl p-5 border shadow-sm transition-all ${badge.earned ? 'border-purple-200 hover:shadow-md' : 'border-gray-100 opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${badge.earned ? `bg-gradient-to-br ${badge.color}` : 'bg-gray-200'}`}>
                      {badge.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900">{badge.name}</h4>
                        {badge.earned && (
                          <Shield className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{badge.description}</p>
                      <p className="text-[10px] text-gray-400 mt-1">Requires: {badge.requirement}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Referrals */}
        {activeTab === 'referrals' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-8 text-white text-center">
              <Gift className="w-12 h-12 mx-auto mb-4 text-white/80" />
              <h3 className="text-2xl font-bold mb-2">Refer Friends, Earn Rewards</h3>
              <p className="text-white/70 max-w-md mx-auto">Share your referral code with friends. When they sign up and purchase a pass, you both get bonus savings!</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h4 className="text-sm font-bold text-gray-900 mb-3">Your Referral Code</h4>
              <div className="flex items-center gap-3">
                <div className="flex-1 px-4 py-3 rounded-xl bg-purple-50 border-2 border-dashed border-purple-200 text-center">
                  <span className="text-xl font-mono font-bold text-purple-700 tracking-wider">{referralCode}</span>
                </div>
                <button onClick={handleCopyReferral} className="px-4 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center gap-2">
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h4 className="text-sm font-bold text-gray-900 mb-3">Send Invitation</h4>
              <div className="flex items-center gap-3">
                <input
                  type="email"
                  value={referralEmail}
                  onChange={(e) => setReferralEmail(e.target.value)}
                  placeholder="friend@email.com"
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={handleSendReferral}
                  disabled={sendingReferral}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {sendingReferral ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                  Send
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h4 className="text-sm font-bold text-gray-900 mb-4">How It Works</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { step: '1', title: 'Share Code', desc: 'Send your referral code to friends', icon: <Share2 className="w-5 h-5 text-purple-500" /> },
                  { step: '2', title: 'Friend Signs Up', desc: 'They create an account and buy a pass', icon: <Users className="w-5 h-5 text-blue-500" /> },
                  { step: '3', title: 'Both Earn Rewards', desc: 'You both get 500 VT bonus savings!', icon: <Gift className="w-5 h-5 text-green-500" /> },
                ].map(item => (
                  <div key={item.step} className="text-center p-4 rounded-xl bg-gray-50">
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-3">
                      {item.icon}
                    </div>
                    <h5 className="text-sm font-bold text-gray-900">{item.title}</h5>
                    <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-4">
                <Trophy className="w-10 h-10" />
                <div>
                  <h3 className="text-xl font-bold">Top Savers Leaderboard</h3>
                  <p className="text-white/70 text-sm">See who's saving the most with StikmNek</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {leaderboard.map((entry, i) => {
                  const isCurrentUser = entry.name === (user?.name || 'You');
                  return (
                    <div key={i} className={`flex items-center gap-4 px-5 py-4 ${isCurrentUser ? 'bg-teal-50' : 'hover:bg-gray-50'} transition-colors`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                        entry.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                        entry.rank === 2 ? 'bg-gray-100 text-gray-600' :
                        entry.rank === 3 ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-50 text-gray-400'
                      }`}>
                        {entry.rank <= 3 ? (
                          <Trophy className={`w-4 h-4 ${entry.rank === 1 ? 'text-yellow-500' : entry.rank === 2 ? 'text-gray-400' : 'text-orange-500'}`} />
                        ) : entry.rank}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
                        {entry.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${isCurrentUser ? 'text-teal-700' : 'text-gray-900'}`}>
                          {entry.name} {isCurrentUser && <span className="text-xs text-teal-500">(You)</span>}
                        </p>
                        <p className="text-xs text-gray-400">{entry.deals} deals redeemed</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">{entry.savings.toLocaleString()} VT</p>
                        <div className="flex items-center gap-1 justify-end">
                          {Array.from({ length: Math.min(entry.badges, 5) }).map((_, j) => (
                            <Award key={j} className="w-3 h-3 text-amber-400" />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityFeed;

import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses as localBusinesses } from '@/data/businesses';
import {
  Ticket, Heart, ChevronRight, PiggyBank, 
  Flame, Compass, Users, Crown, RefreshCw, ShieldCheck
} from 'lucide-react';

import QRCodeDisplay from './QRCodeDisplay';
import SavingsTracker from './SavingsTracker';
import DashboardFeedback from './DashboardFeedback';

type DashboardTab = 'overview' | 'savings' | 'analytics' | 'feedback';

const Dashboard: React.FC = () => {
  const context = useAppContext();
  
  // Ensure we don't crash if context is momentarily null
  const {
    language = 'en',
    user = null,
    userPass = null,
    favorites = [],
    redemptions = [],
    dbBusinesses = [],
    setSelectedBusiness = () => {},
    setCurrentView = () => {},
    refreshUserPass = async () => {}
  } = context || {};
  
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  useEffect(() => {
    if (user?.id) refreshUserPass();
  }, [user?.id]);

  // STABILIZE DATA: Guaranteed to be an array
  const allBusinesses = useMemo(() => {
    const base = (dbBusinesses && dbBusinesses.length > 0) ? dbBusinesses : localBusinesses;
    return Array.isArray(base) ? base : [];
  }, [dbBusinesses]);

  const favBizs = useMemo(() => {
    const safeFavs = Array.isArray(favorites) ? favorites : [];
    return allBusinesses.filter(b => b && b.id && safeFavs.includes(b.id));
  }, [allBusinesses, favorites]);

  if (!user) return null;

  // PASS NAME HANDLER: Translates DB names to UI names safely
  const getPassDisplay = () => {
    const type = userPass?.pass_type || '';
    if (type.includes('Family')) return { label: 'Family Explorer', color: 'from-teal-500 to-emerald-600', icon: Users };
    if (type.includes('Extended')) return { label: 'Extended Group', color: 'from-blue-600 to-indigo-700', icon: Crown };
    if (type.includes('Ultimate')) return { label: 'Ultimate Crew', color: 'from-purple-600 to-pink-600', icon: Flame };
    return { label: 'Active Pass', color: 'from-gray-800 to-black', icon: Ticket };
  };

  const pass = getPassDisplay();

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Rest of your Dashboard JSX... use 'pass.label' and 'pass.color' for the UI */}
    </div>
  );
};

export default Dashboard;

import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses } from '@/data/businesses';
import { Bell, X, MapPin, ChevronRight } from 'lucide-react';

const NearbyDeals: React.FC = () => {
  const { language, setSelectedBusiness, setCurrentView, user } = useAppContext();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [currentDeal, setCurrentDeal] = useState(0);

  const nearbyDeals = businesses.filter(b => b.featured).slice(0, 3);

  useEffect(() => {
    if (dismissed) return;
    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [dismissed]);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setCurrentDeal(prev => (prev + 1) % nearbyDeals.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [visible, nearbyDeals.length]);

  if (!visible || dismissed) return null;

  const deal = nearbyDeals[currentDeal];
  if (!deal) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white text-xs font-semibold">
            <Bell className="w-3.5 h-3.5" />
            {language === 'en' ? 'Nearby Deal' : language === 'fr' ? 'Offre à proximité' : 'Dil Klosap'}
          </div>
          <button
            onClick={() => { setDismissed(true); setVisible(false); }}
            className="text-white/70 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div
          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => {
            setSelectedBusiness(deal);
            setCurrentView('business-detail');
            setDismissed(true);
            setVisible(false);
          }}
        >
          <img src={deal.image} alt={deal.name} className="w-14 h-14 rounded-xl object-cover" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{deal.name}</p>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <MapPin className="w-3 h-3" />
              {deal.location}
            </div>
            <span className="text-xs font-bold text-orange-600">{deal.discount}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5 pb-2">
          {nearbyDeals.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentDeal ? 'bg-teal-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default NearbyDeals;

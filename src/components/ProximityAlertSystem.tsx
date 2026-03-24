import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses as localBusinesses, Business } from '@/data/businesses';
import { haversineDistance, formatDistance, estimateWalkingTime } from '@/hooks/useGeolocation';
import { MapPin, X, ChevronRight, Navigation, Tag, Footprints, Bell, BellOff } from 'lucide-react';
import { formatVT } from '@/lib/utils';
import { effectiveBusinessCoords } from '@/lib/urlHelpers';

const PROXIMITY_RADIUS = 200; // meters
const ALERT_DISPLAY_DURATION = 8000; // ms
const CHECK_COOLDOWN = 5000; // ms between checks

interface ProximityAlert {
  id: string;
  business: Business;
  distance: number;
  timestamp: number;
}

const ProximityAlertSystem: React.FC = () => {
  const {
    userLocation,
    dbBusinesses,
    proximityAlertsEnabled,
    notifiedBusinessIds,
    markBusinessNotified,
    setSelectedBusiness,
    setCurrentView,
    language,
  } = useAppContext();

  const [activeAlerts, setActiveAlerts] = useState<ProximityAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const lastCheckRef = useRef<number>(0);
  const alertTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;

  // Check proximity to businesses when location updates
  const checkProximity = useCallback(() => {
    if (!userLocation || !proximityAlertsEnabled) return;

    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_COOLDOWN) return;
    lastCheckRef.current = now;

    const newAlerts: ProximityAlert[] = [];

    allBusinesses.forEach((business) => {
      // Skip if already notified or dismissed in this session
      if (notifiedBusinessIds.has(business.id)) return;
      if (dismissedAlerts.has(business.id)) return;
      const c = effectiveBusinessCoords(business);
      if (!c) return;

      const distance = haversineDistance(
        userLocation.lat,
        userLocation.lng,
        c.lat,
        c.lng
      );

      if (distance <= PROXIMITY_RADIUS) {
        newAlerts.push({
          id: `alert-${business.id}-${now}`,
          business,
          distance,
          timestamp: now,
        });
      }
    });

    if (newAlerts.length > 0) {
      // Only show up to 3 alerts at a time to avoid overwhelming
      const alertsToShow = newAlerts.slice(0, 3);

      setActiveAlerts((prev) => {
        // Avoid duplicates
        const existingIds = new Set(prev.map((a) => a.business.id));
        const filtered = alertsToShow.filter((a) => !existingIds.has(a.business.id));
        return [...prev, ...filtered];
      });

      // Mark these businesses as notified
      alertsToShow.forEach((alert) => {
        markBusinessNotified(alert.business.id);

        // Auto-dismiss after duration
        const timeout = setTimeout(() => {
          setActiveAlerts((prev) => prev.filter((a) => a.business.id !== alert.business.id));
        }, ALERT_DISPLAY_DURATION);

        alertTimeoutsRef.current.set(alert.business.id, timeout);
      });
    }
  }, [userLocation, proximityAlertsEnabled, allBusinesses, notifiedBusinessIds, dismissedAlerts, markBusinessNotified]);

  // Run proximity check whenever location updates
  useEffect(() => {
    checkProximity();
  }, [checkProximity]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      alertTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  const handleDismiss = useCallback((businessId: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.business.id !== businessId));
    setDismissedAlerts((prev) => new Set(prev).add(businessId));
    const timeout = alertTimeoutsRef.current.get(businessId);
    if (timeout) {
      clearTimeout(timeout);
      alertTimeoutsRef.current.delete(businessId);
    }
  }, []);

  const handleViewDeal = useCallback((business: Business) => {
    setSelectedBusiness(business);
    setCurrentView('business-detail');
    // Dismiss the alert
    handleDismiss(business.id);
  }, [setSelectedBusiness, setCurrentView, handleDismiss]);

  if (!proximityAlertsEnabled || activeAlerts.length === 0) return null;

  const labels = {
    nearbyDeal: language === 'en' ? 'Deal Nearby!' : language === 'fr' ? 'Offre à proximité !' : 'Dil klosap!',
    awayFromYou: language === 'en' ? 'away' : language === 'fr' ? 'de distance' : 'longwe',
    viewDeal: language === 'en' ? 'View Deal' : language === 'fr' ? 'Voir l\'offre' : 'Lukim Dil',
    walkingTime: language === 'en' ? 'walk' : language === 'fr' ? 'à pied' : 'wokbaot',
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[60] flex flex-col gap-3 sm:max-w-sm pointer-events-none">
      {activeAlerts.map((alert, index) => (
        <div
          key={alert.id}
          className="pointer-events-auto animate-slide-up"
          style={{
            animationDelay: `${index * 150}ms`,
            animationFillMode: 'both',
          }}
        >
          <div className="relative bg-white rounded-2xl shadow-2xl shadow-black/15 border border-gray-100 overflow-hidden">
            {/* Top accent bar */}
            <div className="h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-400" />

            {/* Close button */}
            <button
              onClick={() => handleDismiss(alert.business.id)}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors z-10"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="p-4">
              {/* Header badge */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-100">
                  <div className="relative">
                    <Navigation className="w-3.5 h-3.5 text-teal-600" />
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-500 animate-ping" />
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-500" />
                  </div>
                  <span className="text-xs font-bold text-teal-700">{labels.nearbyDeal}</span>
                </div>
                <span className="text-[11px] text-gray-400 font-medium">
                  {formatDistance(alert.distance)} {labels.awayFromYou}
                </span>
              </div>

              {/* Business info */}
              <div className="flex gap-3">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src={alert.business.image}
                    alt={alert.business.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-900 text-sm leading-tight truncate pr-6">
                    {alert.business.name}
                  </h4>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-bold">
                      <Tag className="w-2.5 h-2.5" />
                      {alert.business.discount}
                    </span>
                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />
                      {alert.business.location}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-teal-700">
                        {formatVT(alert.business.dealPrice)}
                      </span>
                      <span className="text-[10px] text-gray-400 line-through">
                        {formatVT(alert.business.originalPrice)}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                      <Footprints className="w-3 h-3" />
                      {estimateWalkingTime(alert.distance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action button */}
              <button
                onClick={() => handleViewDeal(alert.business)}
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-semibold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-md shadow-teal-200/50 active:scale-[0.98]"
              >
                {labels.viewDeal}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar for auto-dismiss */}
            <div className="h-0.5 bg-gray-100">
              <div
                className="h-full bg-teal-500 animate-shrink-width"
                style={{ animationDuration: `${ALERT_DISPLAY_DURATION}ms` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProximityAlertSystem;

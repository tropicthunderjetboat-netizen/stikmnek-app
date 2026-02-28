import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { businesses as localBusinesses, Business } from '@/data/businesses';
import { Navigation, Loader2, AlertCircle, Heart, Layers } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

// ... (keep your categoryColors and icon factory code exactly as it is) ...

const MapController: React.FC<{
  target: [number, number];
  zoom: number;
  flyToUser: boolean;
  onFlyComplete: () => void;
}> = ({ target, zoom, flyToUser, onFlyComplete }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (flyToUser) {
      map.flyTo(target, zoom, { duration: 1.2 });
      onFlyComplete();
    }
  }, [target, zoom, flyToUser, map, onFlyComplete]);
  return null;
};

const MapView: React.FC = () => {
  const {
    language, setSelectedBusiness, setCurrentView, dbBusinesses,
    userLocation, locationLoading, locationError, requestUserLocation, getDistanceTo,
    favorites, toggleFavorite,
  } = useAppContext();

  const [radiusFilter, setRadiusFilter] = useState('all');
  const [flyToUser, setFlyToUser] = useState(false);
  const [tileLayer, setTileLayer] = useState('streets');

  const defaultCenter: [number, number] = [-17.735, 168.312];
  
  // FIX: Create a truly safe target that is always an array of numbers
  const safeTarget: [number, number] = userLocation 
    ? [userLocation.lat, userLocation.lng] 
    : defaultCenter;

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;

  // Render a simple loading state if we're waiting on critical data to prevent the crash
  if (locationLoading && !userLocation) {
    return (
      <div className="h-[500px] flex items-center justify-center bg-gray-50 rounded-2xl">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <section className="py-16 bg-white" id="map">
      <div className="max-w-7xl mx-auto px-4">
        <button onClick={() => { requestUserLocation(); setFlyToUser(true); }} className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl">
          <Navigation className="w-4 h-4" /> Find Me
        </button>

        <div className="relative rounded-2xl overflow-hidden shadow-xl h-[500px]">
          <MapContainer center={defaultCenter} zoom={12} className="w-full h-full" zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            <MapController 
              target={safeTarget} 
              zoom={radiusFilter === 'all' ? 12 : 15} 
              flyToUser={flyToUser} 
              onFlyComplete={() => setFlyToUser(false)} 
            />

            {/* FIX: Removed the extra brackets [safeTarget] that caused the crash */}
            {userLocation && (
              <>
                <Marker position={safeTarget} icon={userLocationIcon} />
                {radiusFilter !== 'all' && (
                  <Circle center={safeTarget} radius={Number(radiusFilter)} pathOptions={{ color: '#3B82F6' }} />
                )}
              </>
            )}

            <MarkerClusterGroup>
              {allBusinesses.map(biz => (
                <Marker 
                  key={biz.id} 
                  position={[biz.lat, biz.lng]} 
                  eventHandlers={{ click: () => setSelectedBusiness(biz) }} 
                />
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        </div>
      </div>
    </section>
  );
};

export default MapView;
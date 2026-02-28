import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { businesses as localBusinesses, Business } from '@/data/businesses';

import {
  MapPin, Star, X, Phone, Clock, ExternalLink, Navigation,
  Loader2, AlertCircle, Car, Footprints, Layers, Heart,
} from 'lucide-react';

import { formatDistance, estimateWalkingTime, estimateDrivingTime } from '@/hooks/useGeolocation';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

type RadiusFilter = 'all' | 500 | 1000 | 5000;

// ─── Category colors ───
const categoryColors: Record<string, string> = {
  dining: '#FF6B35',
  activities: '#0EA5E9',
  tours: '#8B5CF6',
  shopping: '#EC4899',
  spa: '#10B981',
  accommodation: '#F59E0B',
};

// ─── Custom colored marker icon factory ───
const createCategoryIcon = (category: string, featured: boolean) => {
  const color = categoryColors[category] || '#6B7280';
  const size = featured ? 38 : 30;
  const innerSize = featured ? 14 : 10;

  return L.divIcon({
    className: 'custom-marker-icon',
    html: `
      <div style="position: relative; width: ${size}px; height: ${size + 10}px;">
        ${featured ? `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: ${size + 16}px; height: ${size + 16}px; border-radius: 50%; background: ${color}20; animation: pulse-ring 2s ease-out infinite;"></div>` : ''}
        <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: ${size}px; height: ${size}px; background: ${color}; border: 3px solid white; border-radius: 50% 50% 50% 0; transform: translateX(-50%) rotate(-45deg); box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
          <div style="width: ${innerSize}px; height: ${innerSize}px; background: white; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.9;"></div>
        </div>
      </div>`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 6],
    popupAnchor: [0, -(size + 4)],
  });
};

// ─── Blue dot icon for user location ───
const userLocationIcon = L.divIcon({
  className: 'user-location-icon',
  html: `<div style="position: relative; width: 24px; height: 24px;"><div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 14px; height: 14px; border-radius: 50%; background: #3B82F6; border: 3px solid white; box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);"></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// ─── Custom cluster icon factory ───
const createClusterCustomIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const size = count >= 20 ? 56 : count >= 10 ? 48 : 40;
  return L.divIcon({
    html: `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: #0d9488; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700;">${count}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(size, size),
    iconAnchor: [size / 2, size / 2],
  });
};

// ─── Map Controller ───
const MapController: React.FC<{
  target: [number, number];
  zoom: number;
  flyToUser: boolean;
  onFlyComplete: () => void;
}> = ({ target, zoom, flyToUser, onFlyComplete }) => {
  const map = useMap();
  const prevZoomRef = useRef(zoom);

  useEffect(() => {
    if (!map) return;
    try {
      if (flyToUser) {
        map.flyTo(target, zoom, { duration: 1.2 });
        onFlyComplete();
      } else if (zoom !== prevZoomRef.current) {
        map.flyTo(target, zoom, { duration: 0.8 });
      }
    } catch (e) { console.warn(e); }
    prevZoomRef.current = zoom;
  }, [target, zoom, flyToUser, map, onFlyComplete]);

  return null;
};

const tileLayers = {
  streets: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OSM' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri' },
  topo: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenTopoMap' },
};

type TileLayerKey = keyof typeof tileLayers;

// ─── Main MapView Component ───
const MapView: React.FC = () => {
  const {
    language, setSelectedBusiness, setCurrentView, dbBusinesses,
    userLocation, locationLoading, locationError, requestUserLocation, getDistanceTo,
    favorites, toggleFavorite,
  } = useAppContext();

  const [selectedMapBiz, setSelectedMapBiz] = useState<Business | null>(null);
  const [radiusFilter, setRadiusFilter] = useState<RadiusFilter>('all');
  const [flyToUser, setFlyToUser] = useState(false);
  const [tileLayer, setTileLayer] = useState<TileLayerKey>('streets');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;

  // ─── Safe Target Calculation ───
  const defaultCenter: [number, number] = [-17.735, 168.312];
  const safeTarget: [number, number] = [
    userLocation?.lat ?? defaultCenter[0],
    userLocation?.lng ?? defaultCenter[1]
  ];

  const filteredBusinesses = useMemo(() => {
    let result = allBusinesses;
    if (showFavoritesOnly) result = result.filter(biz => favorites.includes(biz.id));
    if (radiusFilter !== 'all' && userLocation) {
      result = result.filter(biz => {
        const dist = getDistanceTo(biz.lat, biz.lng);
        return dist !== null && dist <= radiusFilter;
      });
    }
    return result;
  }, [allBusinesses, radiusFilter, userLocation, getDistanceTo, showFavoritesOnly, favorites]);

  const mapZoom = radiusFilter === 500 ? 16 : radiusFilter === 1000 ? 15 : radiusFilter === 5000 ? 13 : 12;

  const handleLocateMe = () => {
    requestUserLocation();
    setFlyToUser(true);
  };

  return (
    <section className="py-16 bg-white" id="map">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <button onClick={handleLocateMe} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">
            {locationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            {locationLoading ? 'Finding you...' : 'Find My Location'}
          </button>
        </div>

        <div className="relative rounded-2xl overflow-hidden shadow-xl border border-gray-200">
          <MapContainer
            center={safeTarget}
            zoom={mapZoom}
            className="w-full h-[500px]"
            zoomControl={false}
          >
            <TileLayer url={tileLayers[tileLayer].url} attribution={tileLayers[tileLayer].attribution} />
            
            <MapController
              target={safeTarget}
              zoom={mapZoom}
              flyToUser={flyToUser}
              onFlyComplete={() => setFlyToUser(false)}
            />

            {userLocation && radiusFilter !== 'all' && (
              <Circle center={safeTarget} radius={radiusFilter} pathOptions={{ color: '#3B82F6', fillOpacity: 0.1 }} />
            )}

            {userLocation && (
              <Marker position={safeTarget} icon={userLocationIcon} />
            )}

            <MarkerClusterGroup iconCreateFunction={createClusterCustomIcon}>
              {filteredBusinesses.map(biz => (
                <Marker 
                  key={biz.id} 
                  position={[biz.lat, biz.lng]} 
                  icon={createCategoryIcon(biz.category, biz.featured)}
                  eventHandlers={{ click: () => setSelectedMapBiz(biz) }}
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
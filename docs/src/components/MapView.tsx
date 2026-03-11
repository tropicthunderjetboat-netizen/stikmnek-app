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
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size + 10}px;
      ">
        ${featured ? `<div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: ${size + 16}px;
          height: ${size + 16}px;
          border-radius: 50%;
          background: ${color}20;
          animation: pulse-ring 2s ease-out infinite;
        "></div>` : ''}
        <div style="
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: translateX(-50%) rotate(-45deg);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">
          <div style="
            width: ${innerSize}px;
            height: ${innerSize}px;
            background: white;
            border-radius: 50%;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.9;
          "></div>
        </div>
        <div style="
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: ${size * 0.5}px;
          height: 4px;
          background: rgba(0,0,0,0.15);
          border-radius: 50%;
          filter: blur(1px);
        "></div>
      </div>
    `,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 6],
    popupAnchor: [0, -(size + 4)],
  });
};

// ─── Blue dot icon for user location ───
const userLocationIcon = L.divIcon({
  className: 'user-location-icon',
  html: `
    <div style="position: relative; width: 24px; height: 24px;">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.15);
        animation: user-pulse 2s ease-in-out infinite;
      "></div>
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.25);
        animation: user-pulse-inner 2s ease-in-out infinite;
      "></div>
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #3B82F6;
        border: 3px solid white;
        box-shadow: 0 0 8px rgba(59, 130, 246, 0.6), 0 2px 4px rgba(0,0,0,0.2);
      "></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// ─── Custom cluster icon factory ───
const createClusterCustomIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  let size = 40;
  let bgColor = '#0d9488';
  let fontSize = 14;

  if (count >= 20) {
    size = 56;
    bgColor = '#7c3aed';
    fontSize = 16;
  } else if (count >= 10) {
    size = 48;
    bgColor = '#2563eb';
    fontSize = 15;
  }

  return L.divIcon({
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${bgColor};
        border: 3px solid white;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 700;
        font-size: ${fontSize}px;
        font-family: system-ui, -apple-system, sans-serif;
      ">${count}</div>
    `,
    className: 'custom-cluster-icon',
    iconSize: L.point(size, size),
    iconAnchor: [size / 2, size / 2],
  });
};

// ─── Map Controller: handles fly-to and zoom changes ───
const MapController: React.FC<{
  center: [number, number];
  zoom: number;
  userLocation: { lat: number; lng: number } | null;
  flyToUser: boolean;
  onFlyComplete: () => void;
}> = ({ center, zoom, userLocation, flyToUser, onFlyComplete }) => {
  const map = useMap();
  const prevZoomRef = useRef(zoom);

  useEffect(() => {
    // Validate userLocation before using it — prevents latLngToPoint crash
    const validUserPos = userLocation
      && typeof userLocation.lat === 'number'
      && typeof userLocation.lng === 'number'
      && isFinite(userLocation.lat)
      && isFinite(userLocation.lng)
      ? [userLocation.lat, userLocation.lng] as [number, number]
      : null;

    if (flyToUser && validUserPos) {
      map.flyTo(validUserPos, zoom, { duration: 1.2 });
      onFlyComplete();
    } else if (zoom !== prevZoomRef.current) {
      const target = validUserPos ?? center;
      map.flyTo(target, zoom, { duration: 0.8 });
    }
    prevZoomRef.current = zoom;
  }, [center, zoom, userLocation, flyToUser, map, onFlyComplete]);

  return null;
};



// ─── Tile layer options ───
const tileLayers = {
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com">Esri</a> &mdash; Earthstar Geographics',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
  },
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

  // Filter businesses by radius and favorites
  const filteredBusinesses = useMemo(() => {
    let result = allBusinesses;

    // Apply favorites filter
    if (showFavoritesOnly) {
      result = result.filter(biz => favorites.includes(biz.id));
    }

    // Apply radius filter
    if (radiusFilter !== 'all' && userLocation) {
      result = result.filter(biz => {
        const dist = getDistanceTo(biz.lat, biz.lng);
        return dist !== null && dist <= radiusFilter;
      });
    }

    return result;
  }, [allBusinesses, radiusFilter, userLocation, getDistanceTo, showFavoritesOnly, favorites]);


  // Map center and zoom based on user location and radius
  const defaultCenter: [number, number] = [-17.735, 168.312];
  const mapCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : defaultCenter;

  const getZoomForRadius = (radius: RadiusFilter): number => {
    if (radius === 500) return 16;
    if (radius === 1000) return 15;
    if (radius === 5000) return 13;
    return 12;
  };

  const mapZoom = getZoomForRadius(radiusFilter);

  const handleViewDeal = (biz: Business) => {
    setSelectedBusiness(biz);
    setCurrentView('business-detail');
  };

  const handleLocateMe = () => {
    requestUserLocation();
    setFlyToUser(true);
  };

  // Trigger fly-to when user location first arrives
  const prevUserLocationRef = useRef(userLocation);
  useEffect(() => {
    if (userLocation && !prevUserLocationRef.current) {
      setFlyToUser(true);
    }
    prevUserLocationRef.current = userLocation;
  }, [userLocation]);

  const radiusOptions: { value: RadiusFilter; label: string }[] = [
    { value: 'all', label: language === 'en' ? 'All' : 'Tout' },
    { value: 500, label: '500m' },
    { value: 1000, label: '1km' },
    { value: 5000, label: '5km' },
  ];

  const currentTile = tileLayers[tileLayer];

  return (
    <section className="py-16 bg-white" id="map">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            {t('map.title', language)}
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">{t('map.subtitle', language)}</p>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {/* Locate Me Button */}
          <button
            onClick={handleLocateMe}
            disabled={locationLoading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              userLocation
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                : locationLoading
                ? 'bg-blue-100 text-blue-600 cursor-wait'
                : 'bg-white text-blue-600 border-2 border-blue-200 hover:bg-blue-50 hover:border-blue-300'
            }`}
          >
            {locationLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
            {locationLoading
              ? (language === 'en' ? 'Finding you...' : 'Recherche...')
              : userLocation
              ? (language === 'en' ? 'Location Active' : 'Position active')
              : (language === 'en' ? 'Find My Location' : 'Ma position')
            }
          </button>

          {/* Radius Filter */}
          <div className="flex items-center gap-1.5 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 pl-2 pr-1 uppercase tracking-wider">
              {language === 'en' ? 'Radius' : 'Rayon'}:
            </span>
            {radiusOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  if (opt.value !== 'all' && !userLocation) {
                    requestUserLocation();
                  }
                  setRadiusFilter(opt.value);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  radiusFilter === opt.value
                    ? 'bg-teal-600 text-white shadow-md shadow-teal-200'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Favorites Filter Toggle */}
          <button
            onClick={() => setShowFavoritesOnly(prev => !prev)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              showFavoritesOnly
                ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-200'
                : 'bg-white text-gray-600 border-2 border-gray-200 hover:border-red-300 hover:text-red-500 hover:bg-red-50'
            }`}
            title={language === 'en' ? 'Show favorites only' : 'Afficher les favoris uniquement'}
          >
            <Heart className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
            {showFavoritesOnly
              ? (language === 'en' ? 'Favorites Only' : 'Favoris uniquement')
              : (language === 'en' ? 'Show Favorites' : 'Voir favoris')
            }
            {favorites.length > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                showFavoritesOnly
                  ? 'bg-white/20 text-white'
                  : 'bg-red-100 text-red-600'
              }`}>
                {favorites.length}
              </span>
            )}
          </button>

          {/* Results Count */}
          <div className="text-sm text-gray-500">
            <span className="font-semibold text-gray-700">{filteredBusinesses.length}</span>{' '}
            {language === 'en' ? 'deals' : 'offres'}
            {showFavoritesOnly && (
              <span className="text-red-500 ml-1">
                {language === 'en' ? '(favorites)' : '(favoris)'}
              </span>
            )}
            {radiusFilter !== 'all' && userLocation && (
              <span className="text-teal-600 ml-1">
                {language === 'en'
                  ? `within ${radiusFilter >= 1000 ? `${radiusFilter / 1000}km` : `${radiusFilter}m`}`
                  : `dans ${radiusFilter >= 1000 ? `${radiusFilter / 1000}km` : `${radiusFilter}m`}`
                }
              </span>
            )}
          </div>

        </div>

        {/* Location Error */}
        {locationError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{locationError}</span>
            <button onClick={handleLocateMe} className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 underline">
              {language === 'en' ? 'Try Again' : 'Réessayer'}
            </button>
          </div>
        )}

        {/* Leaflet Map */}
        <div className="relative rounded-2xl overflow-hidden shadow-xl border border-gray-200">
          {/* Legend Overlay */}
          <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-100">
            <p className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">
              {language === 'en' ? 'Legend' : 'Légende'}
            </p>
            <div className="space-y-1.5">
              {Object.entries(categoryColors).map(([cat, color]) => (
                <div key={cat} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-gray-600 capitalize">{cat}</span>
                </div>
              ))}
              {userLocation && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-1">
                  <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-200" />
                  <span className="text-xs text-blue-600 font-medium">
                    {language === 'en' ? 'You' : 'Vous'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Layer Switcher */}
          <div className="absolute top-4 right-4 z-[1000]">
            <button
              onClick={() => setShowLayerPicker(!showLayerPicker)}
              className="w-10 h-10 bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
              title={language === 'en' ? 'Change map style' : 'Changer le style'}
            >
              <Layers className="w-5 h-5 text-gray-600" />
            </button>
            {showLayerPicker && (
              <div className="absolute top-12 right-0 bg-white rounded-xl shadow-xl border border-gray-200 p-2 min-w-[140px]">
                {(Object.keys(tileLayers) as TileLayerKey[]).map(key => (
                  <button
                    key={key}
                    onClick={() => { setTileLayer(key); setShowLayerPicker(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                      tileLayer === key
                        ? 'bg-teal-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {key === 'streets' ? (language === 'en' ? 'Streets' : 'Rues')
                      : key === 'satellite' ? 'Satellite'
                      : key === 'topo' ? (language === 'en' ? 'Topographic' : 'Topographique')
                      : key}
                  </button>
                ))}
              </div>
            )}
          </div>

          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            scrollWheelZoom={true}
            className="w-full h-[400px] sm:h-[500px] lg:h-[600px]"
            zoomControl={false}
            style={{ background: '#e8f4f8' }}
          >
            <TileLayer
              key={tileLayer}
              url={currentTile.url}
              attribution={currentTile.attribution}
              maxZoom={19}
            />

            {/* Map controller for fly-to behavior */}
            <MapController
              center={mapCenter}
              zoom={mapZoom}
              userLocation={userLocation}
              flyToUser={flyToUser}
              onFlyComplete={() => setFlyToUser(false)}
            />

            {/* Radius circle */}
            {userLocation && radiusFilter !== 'all' && (
              <Circle
                center={[userLocation.lat, userLocation.lng]}
                radius={radiusFilter}
                pathOptions={{
                  color: 'rgba(59, 130, 246, 0.4)',
                  fillColor: 'rgba(59, 130, 246, 0.08)',
                  fillOpacity: 0.3,
                  weight: 2,
                  dashArray: '8, 4',
                }}
              />
            )}

            {/* User location blue dot */}
            {userLocation && (
              <Marker
                position={[userLocation.lat, userLocation.lng]}
                icon={userLocationIcon}
                zIndexOffset={1000}
              >
                <Popup className="user-location-popup">
                  <div className="text-center p-1">
                    <p className="font-bold text-blue-600 text-sm">
                      {language === 'en' ? 'You are here' : 'Vous êtes ici'}
                    </p>
                    {userLocation.accuracy && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {language === 'en' ? 'Accuracy' : 'Précision'}: ~{Math.round(userLocation.accuracy)}m
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Business markers with clustering */}
            <MarkerClusterGroup
              chunkedLoading
              iconCreateFunction={createClusterCustomIcon}
              maxClusterRadius={60}
              spiderfyOnMaxZoom={true}
              showCoverageOnHover={false}
              zoomToBoundsOnClick={true}
              disableClusteringAtZoom={16}
            >
              {filteredBusinesses.map(biz => {
                const dist = getDistanceTo(biz.lat, biz.lng);
                const isFav = favorites.includes(biz.id);
                return (
                  <Marker
                    key={biz.id}
                    position={[biz.lat, biz.lng]}
                    icon={createCategoryIcon(biz.category, biz.featured)}
                    eventHandlers={{
                      click: () => setSelectedMapBiz(biz),
                    }}
                  >
                    <Popup maxWidth={280} minWidth={220} className="business-popup">
                      <div className="p-0">
                        <div className="relative">
                          <img
                            src={biz.image}
                            alt={biz.name}
                            className="w-full h-28 object-cover rounded-t-lg"
                            loading="lazy"
                          />
                          {/* Favorite heart button on popup image */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(biz.id); }}
                            className={`absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-md ${
                              isFav
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-white/90 text-gray-500 hover:bg-white hover:text-red-500'
                            }`}
                            title={isFav
                              ? (language === 'en' ? 'Remove from favorites' : 'Retirer des favoris')
                              : (language === 'en' ? 'Save to favorites' : 'Ajouter aux favoris')
                            }
                          >
                            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                          <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold">
                            {biz.discount}
                          </div>
                          {dist !== null && (
                            <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-blue-600/90 text-white text-xs font-bold">
                              {formatDistance(dist)}
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <div className="flex items-start justify-between mb-1.5">
                            <h3 className="font-bold text-gray-900 text-sm leading-tight pr-2">{biz.name}</h3>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                              <span className="text-xs font-semibold">{biz.rating}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{biz.location}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-baseline gap-1">
                              <span className="text-base font-bold text-teal-700">${biz.dealPrice}</span>
                              <span className="text-xs text-gray-400 line-through">${biz.originalPrice}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(biz.id); }}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                  isFav
                                    ? 'bg-red-50 text-red-500 hover:bg-red-100'
                                    : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500'
                                }`}
                                title={isFav
                                  ? (language === 'en' ? 'Remove from favorites' : 'Retirer des favoris')
                                  : (language === 'en' ? 'Save to favorites' : 'Ajouter aux favoris')
                                }
                              >
                                <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleViewDeal(biz); }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors"
                              >
                                {t('biz.viewdeal', language)}
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

            </MarkerClusterGroup>
          </MapContainer>

          {/* Selected Business Detail Card (bottom overlay) */}
          {selectedMapBiz && (() => {
            const isSelectedFav = favorites.includes(selectedMapBiz.id);
            return (
            <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-[1000]">
              <div className="relative">
                <img src={selectedMapBiz.image} alt={selectedMapBiz.name} className="w-full h-36 object-cover" />
                {/* Close button */}
                <button
                  onClick={() => setSelectedMapBiz(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                {/* Favorite heart button on detail card image */}
                <button
                  onClick={() => toggleFavorite(selectedMapBiz.id)}
                  className={`absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    isSelectedFav
                      ? 'bg-red-500 text-white hover:bg-red-600 scale-110'
                      : 'bg-white/90 text-gray-500 hover:bg-white hover:text-red-500'
                  }`}
                  title={isSelectedFav
                    ? (language === 'en' ? 'Remove from favorites' : 'Retirer des favoris')
                    : (language === 'en' ? 'Save to favorites' : 'Ajouter aux favoris')
                  }
                >
                  <Heart className={`w-4 h-4 ${isSelectedFav ? 'fill-current' : ''}`} />
                </button>
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold">
                  {selectedMapBiz.discount}
                </div>
                {userLocation && (() => {
                  const dist = getDistanceTo(selectedMapBiz.lat, selectedMapBiz.lng);
                  return dist !== null ? (
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-blue-600/90 text-white text-xs font-bold flex items-center gap-1">
                      <Navigation className="w-3 h-3" />
                      {formatDistance(dist)}
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-gray-900">{selectedMapBiz.name}</h3>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span className="text-sm font-semibold">{selectedMapBiz.rating}</span>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-gray-500 mb-3">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />{selectedMapBiz.location}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />{selectedMapBiz.hours}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />{selectedMapBiz.phone}
                  </div>
                </div>

                {/* Walking / Driving Time Estimates */}
                {userLocation && (() => {
                  const dist = getDistanceTo(selectedMapBiz.lat, selectedMapBiz.lng);
                  if (dist === null) return null;
                  return (
                    <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-blue-50 border border-blue-100">
                      <div className="flex items-center gap-1.5 text-xs text-blue-700">
                        <Footprints className="w-3.5 h-3.5" />
                        <span className="font-medium">{estimateWalkingTime(dist)}</span>
                      </div>
                      <div className="w-px h-4 bg-blue-200" />
                      <div className="flex items-center gap-1.5 text-xs text-blue-700">
                        <Car className="w-3.5 h-3.5" />
                        <span className="font-medium">{estimateDrivingTime(dist)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-teal-700">${selectedMapBiz.dealPrice}</span>
                    <span className="text-sm text-gray-400 line-through">${selectedMapBiz.originalPrice}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Favorite button in action row */}
                    <button
                      onClick={() => toggleFavorite(selectedMapBiz.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isSelectedFav
                          ? 'bg-red-50 text-red-500 border border-red-200 hover:bg-red-100'
                          : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isSelectedFav ? 'fill-current' : ''}`} />
                      {isSelectedFav
                        ? (language === 'en' ? 'Saved' : 'Sauvé')
                        : (language === 'en' ? 'Save' : 'Sauver')
                      }
                    </button>
                    <button
                      onClick={() => handleViewDeal(selectedMapBiz)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors"
                    >
                      {t('biz.viewdeal', language)}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

        </div>

        {/* No Results Message - Favorites filter */}
        {showFavoritesOnly && filteredBusinesses.length === 0 && (
          <div className="mt-6 text-center py-8 bg-red-50/50 rounded-xl border border-red-100">
            <Heart className="w-10 h-10 text-red-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {language === 'en'
                ? 'No favorite businesses yet. Save some deals to see them here!'
                : 'Aucun favori pour le moment. Sauvegardez des offres pour les voir ici !'
              }
            </p>
            <button
              onClick={() => setShowFavoritesOnly(false)}
              className="mt-3 px-5 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
            >
              {language === 'en' ? 'Show All Deals' : 'Afficher tout'}
            </button>
          </div>
        )}

        {/* No Results Message - Radius filter */}
        {!showFavoritesOnly && userLocation && radiusFilter !== 'all' && filteredBusinesses.length === 0 && (
          <div className="mt-6 text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
            <Navigation className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {language === 'en'
                ? `No deals found within ${radiusFilter >= 1000 ? `${radiusFilter / 1000}km` : `${radiusFilter}m`}. Try a larger radius.`
                : `Aucune offre trouvée dans ${radiusFilter >= 1000 ? `${radiusFilter / 1000}km` : `${radiusFilter}m`}.`
              }
            </p>
            <button
              onClick={() => setRadiusFilter('all')}
              className="mt-3 px-5 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
            >
              {language === 'en' ? 'Show All Deals' : 'Afficher tout'}
            </button>
          </div>
        )}

      </div>

      {/* Global styles for Leaflet custom elements */}
      <style>{`
        .custom-marker-icon,
        .user-location-icon,
        .custom-cluster-icon {
          background: transparent !important;
          border: none !important;
        }

        @keyframes user-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
          50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.2; }
        }

        @keyframes user-pulse-inner {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.4; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.1; }
        }

        @keyframes pulse-ring {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
          50% { transform: translate(-50%, -50%) scale(1.4); opacity: 0.1; }
        }

        .leaflet-popup-content-wrapper {
          padding: 0 !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
        }

        .leaflet-popup-content {
          margin: 0 !important;
          min-width: 220px;
        }

        .leaflet-popup-tip {
          box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
        }

        .business-popup .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
        }

        .user-location-popup .leaflet-popup-content-wrapper {
          border-radius: 10px !important;
        }

        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.15) !important;
          border-radius: 12px !important;
          overflow: hidden;
        }

        .leaflet-control-zoom a {
          width: 36px !important;
          height: 36px !important;
          line-height: 36px !important;
          font-size: 18px !important;
          color: #374151 !important;
          border-bottom-color: #e5e7eb !important;
        }

        .leaflet-control-zoom a:hover {
          background: #f3f4f6 !important;
        }

        .leaflet-container {
          font-family: system-ui, -apple-system, sans-serif;
        }
      `}</style>
    </section>
  );
};

export default MapView;

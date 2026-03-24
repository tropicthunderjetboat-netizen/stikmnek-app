import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { MapPin, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_MAP_CENTER,
  googleMapsUrlFromLatLng,
  parseLatLngFromMapUrl,
} from '@/lib/urlHelpers';

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapFlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 15, { duration: 0.35 });
  }, [lat, lng, map]);
  return null;
}

interface LocationMapPickerProps {
  mapUrl: string;
  onMapUrlChange: (url: string) => void;
  language?: string;
}

/**
 * Tap the map to drop a pin; we save a standard Google Maps link from the coordinates.
 * Optional text field for pasting a share link (short links, etc.).
 */
const LocationMapPicker: React.FC<LocationMapPickerProps> = ({
  mapUrl,
  onMapUrlChange,
  language = 'en',
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const parsed = useMemo(() => parseLatLngFromMapUrl(mapUrl), [mapUrl]);
  const center: [number, number] = parsed ? [parsed.lat, parsed.lng] : DEFAULT_MAP_CENTER;

  const pinIcon = useMemo(
    () =>
      L.divIcon({
        className: 'location-picker-pin',
        html: `<div style="width:22px;height:22px;background:#7c3aed;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.25);"></div>`,
        iconSize: [26, 32],
        iconAnchor: [13, 30],
      }),
    []
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error(
        language === 'en'
          ? 'Location is not available in this browser.'
          : 'La géolocalisation n\u2019est pas disponible.'
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        onMapUrlChange(googleMapsUrlFromLatLng(latitude, longitude));
      },
      () => {
        toast.error(
          language === 'en'
            ? 'Could not get your location. Tap the map instead.'
            : 'Impossible d\u2019obtenir votre position. Touchez la carte.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const t =
    language === 'en'
      ? {
          title: 'Business location on map',
          hint: 'Tap the map to drop a pin where your business is. We turn that into a Google Maps link for tourists.',
          useLoc: 'Use my location',
          optional: 'Or paste a Google Maps link',
          optionalHelp: 'Only if you already have a share link from the Google Maps app.',
          clear: 'Clear',
        }
      : language === 'fr'
      ? {
          title: 'Emplacement sur la carte',
          hint: 'Touchez la carte pour placer une épingle. Nous créons un lien Google Maps pour les touristes.',
          useLoc: 'Ma position',
          optional: 'Ou collez un lien Google Maps',
          optionalHelp: 'Si vous avez déjà un lien de partage depuis lapplication.',
          clear: 'Effacer',
        }
      : {
          title: 'Ples long map',
          hint: 'Tap map blong putum pin long bisnis blong yu.',
          useLoc: 'Yu lo kesen',
          optional: 'O paste link blong Google Maps',
          optionalHelp: 'Sapos yu gat link long app.',
          clear: 'Klia',
        };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
        <MapPin className="w-3 h-3 text-red-500" />
        {t.title}
      </label>
      <p className="text-[10px] text-gray-500 mb-2">{t.hint}</p>

      {!mounted ? (
        <div className="w-full h-[200px] rounded-xl bg-gray-100 border border-gray-200 animate-pulse" />
      ) : (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <MapContainer
            center={center}
            zoom={parsed ? 15 : 12}
            scrollWheelZoom
            className="w-full h-[200px] z-0"
            style={{ background: '#e8f4f8' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={19}
            />
            {parsed && (
              <>
                <Marker position={[parsed.lat, parsed.lng]} icon={pinIcon} />
                <MapFlyTo lat={parsed.lat} lng={parsed.lng} />
              </>
            )}
            <MapClickHandler
              onPick={(lat, lng) => onMapUrlChange(googleMapsUrlFromLatLng(lat, lng))}
            />
          </MapContainer>
          <button
            type="button"
            onClick={useMyLocation}
            className="absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/95 border border-gray-200 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <Crosshair className="w-3.5 h-3.5 text-purple-600" />
            {t.useLoc}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-gray-500">{t.optional}</label>
        <input
          type="text"
          value={mapUrl}
          onChange={(e) => onMapUrlChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
          placeholder="https://maps.google.com/..."
        />
        <div className="flex justify-between items-start gap-2">
          <p className="text-[10px] text-gray-400 flex-1">{t.optionalHelp}</p>
          {mapUrl ? (
            <button
              type="button"
              onClick={() => onMapUrlChange('')}
              className="text-[10px] text-purple-600 hover:underline shrink-0"
            >
              {t.clear}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default LocationMapPicker;

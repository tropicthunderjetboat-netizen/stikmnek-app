import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { ExternalLink, MapPin } from 'lucide-react';
import { googleMapsExternalOpenUrl } from '@/lib/urlHelpers';

interface BusinessDetailMapProps {
  lat: number;
  lng: number;
  /** Owner-saved Google Maps URL, if any (preferred for "open in Google Maps"). */
  savedMapUrl?: string | null;
  language: string;
}

const BusinessDetailMap: React.FC<BusinessDetailMapProps> = ({
  lat,
  lng,
  savedMapUrl,
  language,
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const openHref = useMemo(
    () =>
      googleMapsExternalOpenUrl({
        lat,
        lng,
        savedMapUrl: savedMapUrl || null,
      }),
    [savedMapUrl, lat, lng],
  );

  const pinIcon = useMemo(
    () =>
      L.divIcon({
        className: 'business-detail-map-pin',
        html: `<div style="width:22px;height:22px;background:#0d9488;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.25);"></div>`,
        iconSize: [26, 32],
        iconAnchor: [13, 30],
      }),
    [],
  );

  const t =
    language === 'fr'
      ? { location: 'Emplacement', open: 'Voir sur Google Maps' }
      : language === 'bi'
        ? { location: 'Ples', open: 'Lukim long Google Maps' }
        : { location: 'Location', open: 'View on Google Maps' };

  return (
    <div className="rounded-xl border border-teal-100 overflow-hidden bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-teal-50 bg-teal-50/50">
        <MapPin className="w-4 h-4 text-teal-600 shrink-0" />
        <span className="text-xs font-semibold text-teal-900">{t.location}</span>
      </div>
      {!mounted ? (
        <div className="w-full h-[180px] bg-gray-100 animate-pulse" />
      ) : (
        <MapContainer
          center={[lat, lng]}
          zoom={15}
          scrollWheelZoom={false}
          dragging
          className="w-full h-[180px] z-0"
          style={{ background: '#e8f4f8' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />
          <Marker position={[lat, lng]} icon={pinIcon} />
        </MapContainer>
      )}
      <div className="p-2 border-t border-gray-100 bg-white">
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {t.open}
        </a>
      </div>
    </div>
  );
};

export default BusinessDetailMap;

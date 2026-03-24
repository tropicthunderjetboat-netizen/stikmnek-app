/** Vanuatu / Port Vila — matches main map default */
export const DEFAULT_MAP_CENTER: [number, number] = [-17.735, 168.312];

/**
 * Opens Google Maps with a clear pin at the coordinates.
 * Prefer this over `?q=lat,lng`, which often opens zoomed out with no obvious marker.
 * @see https://developers.google.com/maps/documentation/urls/get-started#search-action
 */
export function googleMapsUrlFromLatLng(lat: number, lng: number): string {
  const query = `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Best-effort parse of coordinates from common Google Maps URL shapes */
export interface BusinessLikeForMap {
  lat?: number;
  lng?: number;
  mapUrl?: string | null;
  map_url?: string | null;
}

/**
 * Prefer coordinates parsed from owner-set `map_url` (Google Maps link);
 * otherwise fall back to DB `lat`/`lng` when non-zero.
 */
export function effectiveBusinessCoords(biz: BusinessLikeForMap): { lat: number; lng: number } | null {
  const url = (biz.mapUrl ?? biz.map_url ?? '').trim();
  const parsed = url ? parseLatLngFromMapUrl(url) : null;
  if (parsed) return parsed;
  const lat = Number(biz.lat);
  const lng = Number(biz.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return { lat, lng };
  }
  return null;
}

export function parseLatLngFromMapUrl(url: string): { lat: number; lng: number } | null {
  if (!url?.trim()) return null;
  const s = url.trim();
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      for (const key of ['q', 'query'] as const) {
        const v = u.searchParams.get(key);
        if (!v) continue;
        let decoded = v.replace(/\+/g, ' ').trim();
        try {
          decoded = decodeURIComponent(decoded);
        } catch {
          /* keep decoded as-is */
        }
        const coordOnly = decoded.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
        if (coordOnly) {
          const lat = parseFloat(coordOnly[1]);
          const lng = parseFloat(coordOnly[2]);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
        }
      }
      const ll = u.searchParams.get('ll');
      if (ll) {
        const parts = ll.split(',').map((p) => parseFloat(p.trim()));
        if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
          return { lat: parts[0], lng: parts[1] };
        }
      }
    }

    const atMatch = s.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,|$)/);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    }
    const qMatch = s.match(/[?&](?:q|query)=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) {
      const lat = parseFloat(qMatch[1]);
      const lng = parseFloat(qMatch[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    }
    const llMatch = s.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) {
      const lat = parseFloat(llMatch[1]);
      const lng = parseFloat(llMatch[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * URL for "Open in Google Maps" from a listing: keep rich place/short links; upgrade plain coord links.
 */
export function googleMapsExternalOpenUrl(args: {
  lat: number;
  lng: number;
  savedMapUrl?: string | null;
}): string {
  const raw = (args.savedMapUrl || '').trim();
  if (!raw) {
    return googleMapsUrlFromLatLng(args.lat, args.lng);
  }

  let host = '';
  try {
    host = new URL(raw).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return googleMapsUrlFromLatLng(args.lat, args.lng);
  }

  const isGoogleMaps =
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host === 'maps.google.com' ||
    host === 'goo.gl' ||
    host === 'maps.app.goo.gl';

  if (!isGoogleMaps) {
    return raw;
  }

  if (host === 'goo.gl' || host === 'maps.app.goo.gl') {
    return raw;
  }

  const lower = raw.toLowerCase();
  if (
    lower.includes('/place/') ||
    lower.includes('place_id=') ||
    lower.includes('query_place_id=') ||
    lower.includes('cid=') ||
    lower.includes('ftid=')
  ) {
    return raw;
  }

  const parsed = parseLatLngFromMapUrl(raw);
  if (parsed) {
    return googleMapsUrlFromLatLng(parsed.lat, parsed.lng);
  }

  return raw;
}

export function displayWebsiteForInput(stored: string | null | undefined): string {
  if (!stored) return '';
  return stored.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function normalizeWebsiteForStorage(input: string): string | null {
  const t = input.trim().replace(/^\/+/, '');
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname) return null;
    return u.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

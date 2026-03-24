/** Vanuatu / Port Vila — matches main map default */
export const DEFAULT_MAP_CENTER: [number, number] = [-17.735, 168.312];

export function googleMapsUrlFromLatLng(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Best-effort parse of coordinates from common Google Maps URL shapes */
export function parseLatLngFromMapUrl(url: string): { lat: number; lng: number } | null {
  if (!url?.trim()) return null;
  const s = url.trim();
  try {
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

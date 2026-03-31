/**
 * Geolocation types and distance helpers (MapView, BusinessGrid, AppContext).
 */

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

/**
 * Haversine formula: calculates distance between two lat/lng points in meters
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  if (meters < 10000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters / 1000)}km`;
}

/**
 * Estimate walking time (average 5 km/h = ~83m/min)
 */
export function estimateWalkingTime(meters: number): string {
  const minutes = Math.round(meters / 83);
  if (minutes < 1) return '< 1 min walk';
  if (minutes < 60) return `${minutes} min walk`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h walk`;
  return `${hours}h ${mins}m walk`;
}

/**
 * Estimate driving time (average 30 km/h in town = 500m/min)
 */
export function estimateDrivingTime(meters: number): string {
  const minutes = Math.round(meters / 500);
  if (minutes < 1) return '< 1 min drive';
  if (minutes < 60) return `${minutes} min drive`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h drive`;
  return `${hours}h ${mins}m drive`;
}

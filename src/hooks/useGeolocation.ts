import { useState, useEffect, useCallback, useRef } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface GeolocationState {
  position: GeoPosition | null;
  loading: boolean;
  error: string | null;
  permissionState: 'prompt' | 'granted' | 'denied' | 'unsupported' | null;
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

/**
 * Custom hook for real GPS geolocation
 */
export function useGeolocation(autoRequest = false) {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    loading: false,
    error: null,
    permissionState: null,
  });
  const watchIdRef = useRef<number | null>(null);

  // Check permission state
  useEffect(() => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, permissionState: 'unsupported' }));
      return;
    }
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setState(prev => ({ ...prev, permissionState: result.state as any }));
        result.onchange = () => {
          setState(prev => ({ ...prev, permissionState: result.state as any }));
        };
      }).catch(() => {
        // permissions API not supported, leave as null
      });
    }
  }, []);

  // Auto-request if permission already granted
  useEffect(() => {
    if (autoRequest && state.permissionState === 'granted') {
      requestLocation();
    }
  }, [autoRequest, state.permissionState]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocation is not supported by your browser',
        permissionState: 'unsupported',
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState(prev => ({
          ...prev,
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          },
          loading: false,
          error: null,
          permissionState: 'granted',
        }));
      },
      (err) => {
        let errorMsg = 'Unable to get your location';
        if (err.code === 1) errorMsg = 'Location permission denied';
        if (err.code === 2) errorMsg = 'Location unavailable';
        if (err.code === 3) errorMsg = 'Location request timed out';
        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMsg,
          permissionState: err.code === 1 ? 'denied' : prev.permissionState,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );

    // Start watching for updates
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState(prev => ({
          ...prev,
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          },
          loading: false,
          error: null,
          permissionState: 'granted',
        }));
      },
      () => {
        // Silently ignore watch errors if we already have a position
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  }, []);

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const getDistanceTo = useCallback((lat: number, lng: number): number | null => {
    if (!state.position) return null;
    return haversineDistance(state.position.lat, state.position.lng, lat, lng);
  }, [state.position]);

  return {
    ...state,
    requestLocation,
    getDistanceTo,
  };
}

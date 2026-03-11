# Diagnostic Report — Critical Orange Screen Crash

**Prepared for: Gemini AI**
**Date: 2026-02-28**
**Errors:**
1. `TypeError: Cannot read properties of null (reading 'lat')` → crashes in Leaflet's `latLngToPoint`
2. `401 (Unauthorized)` from Supabase REST API

---

## 1. ROOT CAUSE OF THE `reading 'lat'` CRASH

### The Problem

The variable `userLocation` (type `GeoPosition | null`) starts as `null` and is only populated **after** the user grants geolocation permission. Multiple Leaflet components (`MapContainer`, `Marker`, `Circle`) receive coordinates derived from `userLocation`. While the code has `{userLocation && ...}` guards in the JSX, there is a **critical unguarded path** inside the `MapController` sub-component and a **defensive gap** in how `mapCenter` is consumed by Leaflet's internal rendering pipeline.

### Exact Crash Lines (MapView.tsx)

#### PRIMARY CRASH SITE — Line 266–268 (mapCenter computation)

```tsx
// Line 265-268
const defaultCenter: [number, number] = [-17.735, 168.312];
const mapCenter: [number, number] = userLocation
  ? [userLocation.lat, userLocation.lng]   // ← CRASH if userLocation is truthy but .lat is null/undefined
  : defaultCenter;
```

**Why this crashes:** `mapCenter` is passed to `<MapContainer center={mapCenter}>` on line 484. The `MapContainer` component passes this to Leaflet's `L.map()` constructor, which internally calls `latLngToPoint()`. If `userLocation` is a truthy object but its `.lat` or `.lng` properties are `null`/`undefined`/`NaN`, Leaflet crashes.

**When does `userLocation` have null properties?** When the Supabase 401 error triggers a cascade of re-renders during the auth state resolution, React can briefly set `userLocation` to a partially-constructed object before the geolocation callback completes. This is a race condition between the auth state machine and the geolocation API.

#### SECONDARY CRASH SITE — Lines 196 & 199 (MapController useEffect)

```tsx
// Line 194-203 — MapController component
useEffect(() => {
  if (flyToUser && userLocation) {
    map.flyTo([userLocation.lat, userLocation.lng], zoom, { duration: 1.2 });  // Line 196
    onFlyComplete();
  } else if (zoom !== prevZoomRef.current) {
    const target = userLocation
      ? [userLocation.lat, userLocation.lng] as [number, number]               // Line 199
      : center;
    map.flyTo(target, zoom, { duration: 0.8 });
  }
  prevZoomRef.current = zoom;
}, [center, zoom, userLocation, flyToUser, map, onFlyComplete]);
```

**Why this crashes:** The `useEffect` dependency array includes `userLocation`. When `userLocation` transitions from `null` → `{lat, lng}`, the effect fires. If `flyToUser` was set to `true` before the location arrived (line 286: `setFlyToUser(true)` is called in `handleLocateMe` *before* the geolocation callback resolves), there is a window where `flyToUser` is `true` but `userLocation` is still `null`. The guard `flyToUser && userLocation` should catch this — BUT if `userLocation` is a truthy object with null properties (race condition), the guard passes and `map.flyTo([null, null])` crashes Leaflet.

#### TERTIARY CRASH SITES — Lines 510 & 525 (Circle and Marker)

```tsx
// Line 508-511
{userLocation && radiusFilter !== 'all' && (
  <Circle
    center={[userLocation.lat, userLocation.lng]}   // Line 510
    radius={radiusFilter}
```

```tsx
// Line 523-525
{userLocation && (
  <Marker
    position={[userLocation.lat, userLocation.lng]}  // Line 525
    icon={userLocationIcon}
```

These are guarded by `{userLocation && ...}` so they only crash if `userLocation` is truthy but has null properties (same race condition).

---

## 2. THE 401 UNAUTHORIZED ERROR

### Root Cause

The file `src/lib/supabase.ts` **hardcodes** the Supabase URL and anon key on lines 11–12:

```tsx
// src/lib/supabase.ts — Lines 11-12
const supabaseUrl = 'https://hbaflbmfptobyfqbudrt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

The user has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in Vercel environment variables, but **the code never reads them**. The hardcoded anon key is used for all API calls.

The 401 occurs because:
1. **RLS policies** on tables like `businesses`, `user_profiles`, `reviews` may require an authenticated JWT, not just the anon key
2. **The anon key may have been rotated** in the Supabase dashboard, making the hardcoded key stale
3. **PostgREST** returns 401 when the JWT (anon or user) doesn't satisfy the RLS policy for the requested operation

### How the 401 Relates to the `lat` Crash

The causal chain is:

```
401 from Supabase
  → loadBusinesses() catches error (AppContext.tsx line 246)
  → dbBusinesses stays as [] (empty array)
  → App falls back to localBusinesses (MapView.tsx line 241)
  → localBusinesses have valid coordinates → map renders OK initially

BUT ALSO:

401 from Supabase
  → resolveRole() DB query fails (AppContext.tsx line 397-401)
  → handleAuthenticatedUser() enters error/retry path
  → Multiple rapid re-renders of AppContext provider
  → userLocation state can briefly be in an inconsistent state
  → MapView re-renders with stale/partial userLocation
  → Leaflet's latLngToPoint receives null → CRASH
```

The 401 doesn't directly cause the `lat` crash, but it **destabilizes the auth state machine**, which triggers rapid re-renders that expose the race condition in the geolocation → map rendering pipeline.

---

## 3. FILES THAT NEED FIXES

| File | What to Fix |
|------|------------|
| `src/lib/supabase.ts` (lines 11–12) | Use `VITE_` env vars instead of hardcoded credentials |
| `src/components/MapView.tsx` (lines 266–268) | Add defensive validation for `userLocation.lat`/`.lng` |
| `src/components/MapView.tsx` (lines 196, 199) | Add null-safe property checks in MapController |
| `src/components/MapView.tsx` (lines 510, 525) | Add extra validation before passing to Leaflet components |
| `src/contexts/AppContext.tsx` (line 179) | Add validation that geolocation coords are finite numbers |

---

## 4. CORRECTED CODE

### Fix 1: `src/lib/supabase.ts` — Use Environment Variables (Lines 11–12)

**BEFORE:**
```tsx
const supabaseUrl = 'https://hbaflbmfptobyfqbudrt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**AFTER:**
```tsx
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hbaflbmfptobyfqbudrt.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYWZsYm1mcHRvYnlmcWJ1ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTMwMTIsImV4cCI6MjA4NzI4OTAxMn0.Ukdx0PKI6cpoEdKGcV4LgcgumkhDIfiIXbmVMgbqKL0';
```

This ensures Vercel's env vars are used in production while keeping the hardcoded values as local dev fallbacks.

### Fix 2: `src/components/MapView.tsx` — Safe `userLocation` Helper

Add this helper function at the top of the `MapView` component (after line 240, before line 241):

```tsx
// Safe helper: returns validated [lat, lng] or null
const safeUserLatLng = (loc: typeof userLocation): [number, number] | null => {
  if (!loc) return null;
  if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  if (!isFinite(loc.lat) || !isFinite(loc.lng)) return null;
  return [loc.lat, loc.lng];
};
```

### Fix 3: `src/components/MapView.tsx` — Safe `mapCenter` (Lines 265–268)

**BEFORE:**
```tsx
const defaultCenter: [number, number] = [-17.735, 168.312];
const mapCenter: [number, number] = userLocation
  ? [userLocation.lat, userLocation.lng]
  : defaultCenter;
```

**AFTER:**
```tsx
const defaultCenter: [number, number] = [-17.735, 168.312];
const mapCenter: [number, number] = safeUserLatLng(userLocation) ?? defaultCenter;
```

### Fix 4: `src/components/MapView.tsx` — Safe MapController (Lines 194–203)

**BEFORE:**
```tsx
useEffect(() => {
  if (flyToUser && userLocation) {
    map.flyTo([userLocation.lat, userLocation.lng], zoom, { duration: 1.2 });
    onFlyComplete();
  } else if (zoom !== prevZoomRef.current) {
    const target = userLocation ? [userLocation.lat, userLocation.lng] as [number, number] : center;
    map.flyTo(target, zoom, { duration: 0.8 });
  }
  prevZoomRef.current = zoom;
}, [center, zoom, userLocation, flyToUser, map, onFlyComplete]);
```

**AFTER:**
```tsx
useEffect(() => {
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
```

### Fix 5: `src/components/MapView.tsx` — Safe Circle & Marker (Lines 508–541)

**BEFORE:**
```tsx
{userLocation && radiusFilter !== 'all' && (
  <Circle center={[userLocation.lat, userLocation.lng]} ... />
)}

{userLocation && (
  <Marker position={[userLocation.lat, userLocation.lng]} ... />
)}
```

**AFTER:**
```tsx
{safeUserLatLng(userLocation) && radiusFilter !== 'all' && (
  <Circle center={safeUserLatLng(userLocation)!} ... />
)}

{safeUserLatLng(userLocation) && (
  <Marker position={safeUserLatLng(userLocation)!} ... />
)}
```

### Fix 6: `src/contexts/AppContext.tsx` — Validate Geolocation Coords (Line 179)

**BEFORE:**
```tsx
setUserLocation({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
  timestamp: pos.timestamp,
});
```

**AFTER:**
```tsx
const lat = pos.coords.latitude;
const lng = pos.coords.longitude;
// Guard against NaN/Infinity from buggy geolocation implementations
if (typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng)) {
  setUserLocation({
    lat,
    lng,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp,
  });
} else {
  console.warn('[Geolocation] Invalid coordinates received:', lat, lng);
  setLocationError('Invalid location data received');
  setLocationLoading(false);
}
```

---

## 5. SUMMARY

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `Cannot read 'lat' of null` | `userLocation` is null or has null properties when Leaflet components render. Race condition between auth state machine re-renders and geolocation callback. | Add `safeUserLatLng()` validation helper; guard all Leaflet position props; validate geolocation coords at source. |
| `401 Unauthorized` | `src/lib/supabase.ts` hardcodes the anon key instead of reading `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from Vercel env vars. The hardcoded key may be stale or RLS policies block anon access. | Change lines 11–12 to use `import.meta.env.VITE_SUPABASE_URL` with hardcoded fallback. |
| Auth hang (related) | The 401 destabilizes `resolveRole()` → `handleAuthenticatedUser()` retry loop, causing rapid re-renders that expose the `userLocation` race condition. | Fixing the 401 (env vars) will stabilize auth, which reduces the re-render storm that triggers the lat crash. |

### Priority Order for Fixes
1. **Fix `supabase.ts` env vars** (stops the 401 → stabilizes auth → reduces re-renders)
2. **Add `safeUserLatLng()` to MapView.tsx** (prevents the crash even if race condition occurs)
3. **Validate geolocation coords in AppContext.tsx** (defense in depth at the source)

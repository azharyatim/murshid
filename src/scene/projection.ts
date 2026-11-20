// The regional map projection. Mirrors scripts/region-projection.mjs: keep the
// two in step. Metres east (x) and south (z) of an origin between Makkah and Madinah.

export const REGION_ORIGIN = { lat: 22.95, lon: 39.72 };
const M_PER_LAT = 110574;
const M_PER_LON = Math.cos((REGION_ORIGIN.lat * Math.PI) / 180) * 111320;

export function regionXZ(lat: number, lon: number): [number, number] {
  return [(lon - REGION_ORIGIN.lon) * M_PER_LON, -(lat - REGION_ORIGIN.lat) * M_PER_LAT];
}

/** Great-circle distance in metres (haversine, mean Earth radius). */
export function distanceMetres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

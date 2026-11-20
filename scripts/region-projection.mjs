// The regional map projection, shared by the bake script and the app
// (src/scene/projection.ts mirrors these numbers). A simple local projection:
// metres east and south of an origin between Makkah and Madinah. Over this area
// (about 400 km) its distances are within about 1.5% of true distances, which is
// fine for drawing the map; walking distances are computed separately, on the
// ellipsoid-free haversine formula in the app.
export const REGION_ORIGIN = { lat: 22.95, lon: 39.72, note: 'between Makkah and Madinah' };
const M_PER_LAT = 110574;
const M_PER_LON = Math.cos((REGION_ORIGIN.lat * Math.PI) / 180) * 111320;

/** [x, z] in metres from the regional origin: x = east, z = south. */
export function regionXZ(lat, lon) {
  return [(lon - REGION_ORIGIN.lon) * M_PER_LON, -(lat - REGION_ORIGIN.lat) * M_PER_LAT];
}

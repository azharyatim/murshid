// Map projection shared by the baking script and the app.
//
// Mercator, scaled so that one metre on the map is about one real metre at
// latitude 23 N, halfway between Makkah and Madinah. Shapes are right
// everywhere; distances are within about 1% at either city.
// Output is metres from the Kaabah: x = east, z = south (the scene's axes).

export const KAABAH = { lat: 21.4225, lon: 39.8262 };
/** Approximate centre of Masjid an-Nabawi. Not surveyed; check before relying on it. */
export const NABAWI = { lat: 24.4672, lon: 39.6111 };

const R = 6378137;
const K = Math.cos((23 * Math.PI) / 180);
const rad = (d: number) => (d * Math.PI) / 180;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
const unmerc = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

export function project(lat: number, lon: number): [number, number] {
  return [R * K * rad(lon - KAABAH.lon), -R * K * (merc(lat) - merc(KAABAH.lat))];
}

export function unproject(x: number, z: number): { lat: number; lon: number } {
  return {
    lat: unmerc(-z / (R * K) + merc(KAABAH.lat)),
    lon: KAABAH.lon + (((x / (R * K)) * 180) / Math.PI),
  };
}

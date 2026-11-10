// Fetches OpenStreetMap buildings and roads around a point from Overpass and
// saves the raw response. Run at build time only; the app never calls Overpass.
// Usage: node scripts/fetch-osm.mjs <name> <lat> <lon> <radiusMetres>
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [name, lat, lon, radius] = process.argv.slice(2);
if (!name || !lat || !lon || !radius) {
  console.error('usage: fetch-osm.mjs <name> <lat> <lon> <radius>');
  process.exit(1);
}
const q = `[out:json][timeout:90];
(
  way["building"](around:${radius},${lat},${lon});
  relation["building"](around:${radius},${lat},${lon});
  way["highway"](around:${radius},${lat},${lon});
);
out body geom;`;
// curl is used because it honours the session's HTTPS proxy settings.
// The main server is tried first, then a public mirror of the same service.
const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
let out;
for (const url of endpoints) {
  try {
    out = execFileSync('curl', ['-sS', '--fail', '-m', '120', '--data-urlencode', `data=${q}`, url],
      { maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('fetched from', url);
    break;
  } catch (e) {
    console.warn('failed:', url, String(e.stderr || e.message).trim().split('\n').pop());
  }
}
if (!out) { console.error('no Overpass endpoint reachable'); process.exit(1); }
const json = JSON.parse(out.toString());
json.murshid = { name, lat: +lat, lon: +lon, radius: +radius, fetched: new Date().toISOString() };
writeFileSync(`data/raw/${name}.json`, JSON.stringify(json));
console.log(name, 'elements:', json.elements.length);

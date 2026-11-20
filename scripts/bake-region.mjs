// Converts the regional Overpass export (data/raw/region.json) into the compact
// file the app loads (public/data/region.json): main roads, railway, the sea,
// city names and the positions of named features. Run at build time only.
// Usage: node scripts/bake-region.mjs
//
// Coordinates are metres from a regional origin between Makkah and Madinah:
// x = east, z = south. The cities' own 3D files keep their own local origins;
// the app places them using their origin's latitude and longitude.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { REGION_ORIGIN, regionXZ } from './region-projection.mjs';

const raw = JSON.parse(readFileSync('data/raw/region.json', 'utf8'));
const els = raw.elements;
const r0 = (v) => Math.round(v);
const toXZ = (p) => regionXZ(p.lat, p.lon).map(r0);

/** Douglas-Peucker simplification of [x, z] points, tolerance in metres. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Roads and railway, simplified to about 15 m.
const ROAD_CLASS = { motorway: 'major', trunk: 'major', primary: 'minor' };
const roads = [];
const rail = [];
for (const e of els) {
  const t = e.tags ?? {};
  if (e.type !== 'way' || !e.geometry) continue;
  if (t.tunnel && t.tunnel !== 'no') continue;
  const pts = simplify(e.geometry.map(toXZ), 15);
  if (pts.length < 2) continue;
  if (ROAD_CLASS[t.highway]) roads.push({ c: ROAD_CLASS[t.highway], pts: pts.flat() });
  else if (t.railway === 'rail') rail.push(pts.flat());
}

// The sea. OpenStreetMap draws the coastline with the land on its left. Here
// (the Red Sea's eastern shore) the main coastline runs north to south, so the
// sea is closed off along the west edge of the area. Closed rings are islands.
const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
const segs = els.filter((e) => e.tags?.natural === 'coastline' && e.geometry).map((e) => e.geometry.slice());
const chains = [];
while (segs.length) {
  let chain = segs.shift();
  let grown = true;
  while (grown) {
    grown = false;
    for (let i = 0; i < segs.length; i++) {
      if (key(segs[i][0]) === key(chain[chain.length - 1])) chain = chain.concat(segs[i].slice(1));
      else if (key(segs[i][segs[i].length - 1]) === key(chain[0])) chain = segs[i].concat(chain.slice(1));
      else continue;
      segs.splice(i, 1);
      grown = true;
      break;
    }
  }
  chains.push(chain);
}
const closed = chains.filter((c) => key(c[0]) === key(c[c.length - 1]));
const open = chains.filter((c) => key(c[0]) !== key(c[c.length - 1])).sort((a, b) => b.length - a.length);
const shore = open[0];
let sea = null;
if (shore) {
  const pts = simplify(shore.map(toXZ), 30);
  const westX = r0(Math.min(...pts.map((p) => p[0])) - 150000);
  const first = pts[0];
  const last = pts[pts.length - 1];
  // Extend past both ends so the sea reaches beyond the area shown.
  sea = [[first[0], first[1] - 150000], ...pts, [last[0], last[1] + 150000], [westX, last[1] + 150000], [westX, first[1] - 150000]].flat();
}
const islands = closed.map((c) => simplify(c.map(toXZ), 30).flat()).filter((r) => r.length >= 6);

// City names and named features (positions only; descriptions live in the app's place list).
const cities = [];
const towns = [];
const features = [];
for (const e of els) {
  const t = e.tags ?? {};
  const c = e.center ?? (e.lat !== undefined ? { lat: e.lat, lon: e.lon } : null);
  if (!c) continue;
  const item = { osm: `${e.type}/${e.id}`, name: t.name, nameEn: t['name:en'], lat: c.lat, lon: c.lon, pos: toXZ(c) };
  if (t.place === 'city') cities.push(item);
  else if (t.place === 'town') towns.push(item);
  else if (!t.highway && !t.railway && t.natural !== 'coastline') features.push(item);
}

const out = {
  source: 'OpenStreetMap contributors, ODbL',
  osmTimestamp: raw.osm3s?.timestamp_osm_base,
  origin: REGION_ORIGIN,
  roads,
  rail,
  sea,
  islands,
  cities,
  towns,
  features,
};
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/region.json', JSON.stringify(out));
console.log(
  `region: ${roads.length} roads, ${rail.length} railway lines, ${open.length} open coastline chains (longest ${shore?.length ?? 0} points), ${islands.length} islands, ${cities.length} cities, ${towns.length} towns, ${features.length} features`,
);
for (const f of [...cities, ...towns.filter((t) => /badr/i.test(t.nameEn ?? '')), ...features]) console.log(' ', f.osm, f.nameEn ?? f.name, f.lat.toFixed(5), f.lon.toFixed(5), f.pos.join(','));

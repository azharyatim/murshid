// Converts a raw Overpass export (data/raw/<name>.json) into the compact city
// file the app loads (public/data/<name>.json). Run at build time only.
// Usage: node scripts/bake-osm.mjs makkah-haram
//
// Coordinates become metres from the centre of the Kaabah's OpenStreetMap
// footprint: x = east, z = south. Heights come from the `height` tag, then
// `building:levels`, and otherwise are ESTIMATED; estimated buildings carry
// `est: 1` so the app can say so.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const name = process.argv[2];
if (!name) {
  console.error('usage: bake-osm.mjs <name>');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(`data/raw/${name}.json`, 'utf8'));
const els = raw.elements;

const KAABAH_WAY = 103914569; // OSM way for the Kaabah
const HARAM_RELATION = 1472531; // OSM multipolygon for Masjid al-Haram
const MASA_NAME = "Sa'i / Al Masa'a Safa - Marwa";
const MAQAM_NAME = 'Maqam Ibrahim';
// Wikidata ids of features inside the mataf: Maqam Ibrahim, Hijr Isma'il.
const HARAM_FEATURES = ['Q3696312', 'Q2080761'];

const kaabah = els.find((e) => e.type === 'way' && e.id === KAABAH_WAY);
if (!kaabah) throw new Error('Kaabah footprint not found in the export');
const kRing = kaabah.geometry.slice(0, -1);
const lat0 = kRing.reduce((s, p) => s + p.lat, 0) / kRing.length;
const lon0 = kRing.reduce((s, p) => s + p.lon, 0) / kRing.length;
const mPerLon = Math.cos((lat0 * Math.PI) / 180) * 111320;
const mPerLat = 110574;
const r1 = (v) => Math.round(v * 10) / 10;
const toXZ = (p) => [r1((p.lon - lon0) * mPerLon), r1(-(p.lat - lat0) * mPerLat)];

const num = (v) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(v ?? '');
  return m ? parseFloat(m[1]) : null;
};

// Estimates for buildings with no height or levels tag. Labelled in the app.
const LEVEL_HEIGHT = 3.5;
const ESTIMATE = { roof: 6, house: 8, construction: 12, default: 24 };

function heightOf(tags) {
  const h = num(tags.height);
  if (h !== null) return { h, est: false };
  const lv = num(tags['building:levels']);
  if (lv !== null) return { h: lv * LEVEL_HEIGHT + (num(tags['roof:levels']) ?? 0) * LEVEL_HEIGHT, est: false };
  return { h: ESTIMATE[tags.building] ?? ESTIMATE.default, est: true };
}
function minHeightOf(tags) {
  const m = num(tags.min_height);
  if (m !== null) return m;
  const lv = num(tags['building:min_level']);
  return lv !== null ? lv * LEVEL_HEIGHT : 0;
}

/** Joins way segments into closed rings by matching end points. */
function assemble(segments) {
  const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const left = segments.map((s) => s.slice());
  const rings = [];
  while (left.length) {
    let ring = left.shift();
    let grown = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grown) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        const end = key(ring[ring.length - 1]);
        if (key(s[0]) === end) ring = ring.concat(s.slice(1));
        else if (key(s[s.length - 1]) === end) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (key(ring[0]) === key(ring[ring.length - 1]) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

const flat = (ring) => ring.slice(0, -1).flatMap(toXZ);

/** True if point p lies inside the ring (both in lat/lon). */
function inside(p, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) hit = !hit;
  }
  return hit;
}

// A height above this on a whole multipolygon is the tallest tower of a
// complex (the Clock Towers are tagged 601 m), not the height of every part.
// Such footprints get an estimated podium height unless building parts replace them.
const COMPLEX_HEIGHT = 300;

/** Outer and inner rings (lat/lon) of a way or multipolygon. */
function ringsOf(e) {
  if (e.type === 'way') return { outer: e.geometry.length >= 4 ? [e.geometry] : [], inner: [] };
  return {
    outer: assemble(e.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry)),
    inner: assemble(e.members.filter((m) => m.role === 'inner' && m.geometry).map((m) => m.geometry)),
  };
}
const centre = (ring) => ({
  lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length,
  lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length,
});

// 1. Building outlines.
const footprints = [];
// The Kaabah is drawn separately; listed here only so parts inside it are ignored.
footprints.push({ simple: true, hidden: true, outer: kaabah.geometry, holes: [] });
for (const e of els) {
  const t = e.tags ?? {};
  if (!t.building || e.id === KAABAH_WAY) continue;
  let { h, est } = heightOf(t);
  if (e.type === 'relation' && h > COMPLEX_HEIGHT) {
    h = ESTIMATE.default;
    est = true;
  }
  const { outer, inner } = ringsOf(e);
  // Maqam Ibrahim and the Hijr Isma'il wall are drawn as part of the mosque, not as city buildings.
  const special = HARAM_FEATURES.includes(t.wikidata);
  const kind = e.id === HARAM_RELATION || special ? 'haram' : t.building === 'roof' ? 'roof' : 'building';
  for (const o of outer) {
    // `simple`: kept as plain massing even if detailed parts exist inside it.
    footprints.push({ kind, h, est, min: minHeightOf(t), outer: o, holes: inner.filter((r) => inside(r[0], o)), simple: special });
  }
}

// 2. Building parts (optional second export, data/raw/<name>-parts.json).
// Following the usual OpenStreetMap 3D rule, an outline that contains parts is
// replaced by its parts, which carry their own heights (towers, spires, domes).
const parts = [];
const partsFile = `data/raw/${name}-parts.json`;
if (existsSync(partsFile)) {
  for (const e of JSON.parse(readFileSync(partsFile, 'utf8')).elements) {
    const t = e.tags ?? {};
    if (!t['building:part']) continue;
    const { outer, inner } = ringsOf(e);
    for (const o of outer) {
      const c = centre(o.slice(0, -1));
      const host = footprints.find((f) => inside(c, f.outer) && !f.holes.some((hole) => inside(c, hole)));
      if (host?.simple) continue;
      if (host) host.replaced = true;
      // A ring-shaped part (such as a gallery around the mataf) has its centre in
      // the courtyard, so also count it as the mosque if it lies within the outline.
      const inHaram = host?.kind === 'haram' || footprints.some((f) => f.kind === 'haram' && !f.simple && inside(c, f.outer));
      const { h, est } = heightOf(t);
      parts.push({
        kind: inHaram ? 'haram' : 'building',
        h,
        est,
        min: minHeightOf(t),
        outer: o,
        holes: inner.filter((r) => inside(r[0], o)),
      });
    }
  }
}

const buildings = [];
let estimated = 0;
for (const f of [...footprints.filter((f) => !f.replaced && !f.hidden), ...parts]) {
  if (f.h <= f.min) continue;
  const b = { kind: f.kind, h: r1(f.h), rings: [flat(f.outer), ...f.holes.map(flat)] };
  if (f.min > 0) b.min = r1(f.min);
  if (f.est) {
    b.est = 1;
    estimated++;
  }
  buildings.push(b);
}
const replacedCount = footprints.filter((f) => f.replaced).length;

// Roads: widths in metres by type, roughly; drawn as flat ribbons.
const ROAD_WIDTH = {
  motorway: 14, trunk: 12, primary: 11, secondary: 9, tertiary: 8, motorway_link: 7, trunk_link: 7,
  primary_link: 7, residential: 6, unclassified: 6, service: 4, pedestrian: 6, footway: 2.5, steps: 2.5,
};
const roads = [];
for (const e of els) {
  const t = e.tags ?? {};
  if (e.type !== 'way' || !t.highway || !(t.highway in ROAD_WIDTH)) continue;
  if (t.tunnel && t.tunnel !== 'no') continue; // underground, not visible
  if (t.indoor === 'yes') continue;
  roads.push({ w: ROAD_WIDTH[t.highway], pts: e.geometry.flatMap(toXZ) });
}

// Landmarks taken from the map: the Kaabah outline, Maqam Ibrahim and the
// two ends of the Mas'a walkway (Safa at the south end, Marwa at the north).
const masa = els.find((e) => e.tags?.['name:en'] === MASA_NAME);
const maqam = els.find((e) => e.tags?.['name:en'] === MAQAM_NAME);
const centroid = (g) => {
  const pts = g.slice(0, -1).map(toXZ);
  return [r1(pts.reduce((s, p) => s + p[0], 0) / pts.length), r1(pts.reduce((s, p) => s + p[1], 0) / pts.length)];
};
const landmarks = { kaabah: flat(kaabah.geometry), kaabahHeight: num(kaabah.tags.height) ?? 15 };
// The open courtyard around the Kaabah (the mataf): the hole in the mosque outline.
const haramRel = els.find((e) => e.type === 'relation' && e.id === HARAM_RELATION);
const matafRing = haramRel && assemble(haramRel.members.filter((m) => m.role === 'inner' && m.geometry).map((m) => m.geometry))[0];
if (matafRing) landmarks.mataf = flat(matafRing);
if (maqam) landmarks.maqam = centroid(maqam.geometry);
if (masa) {
  const pts = masa.geometry.map(toXZ);
  landmarks.safa = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  landmarks.marwa = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
}

const out = {
  source: 'OpenStreetMap contributors, ODbL',
  osmTimestamp: raw.osm3s?.timestamp_osm_base,
  origin: { lat: lat0, lon: lon0, note: 'centre of the Kaabah footprint' },
  landmarks,
  buildings,
  roads,
};
mkdirSync('public/data', { recursive: true });
writeFileSync(`public/data/${name}.json`, JSON.stringify(out));
console.log(`${name}: ${buildings.length} shapes (${parts.length} detailed parts replacing ${replacedCount} outlines; ${estimated} with estimated height), ${roads.length} roads`);
console.log('landmarks', JSON.stringify({ ...landmarks, kaabah: undefined }));

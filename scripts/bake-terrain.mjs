// Bakes real elevation (Copernicus DEM GLO-30) into small files for the
// Papercut look. Run at build time only; the app never calls a map server.
//
//   node scripts/bake-terrain.mjs
//
// Needs network access to copernicus-dem-30m.s3.amazonaws.com the first time.
// Tiles are cached in data/raw/copernicus (gitignored). Output goes to
// public/data/: terrain-region.bin, terrain-makkah.bin, terrain-madinah.bin
// and terrain-meta.json.
//
// What is stored: not metres above sea level but a "paper height" t in 0..1
// (one byte, 0..255), derived from HEIGHT ABOVE THE LOCAL VALLEY FLOOR. That is
// what lets Makkah (about 280 m) and Madinah (about 620 m) both sit on the
// lowest paper layer, as the design asks. The app cuts t into 12 layers.
//
// Copernicus GLO-30 is a surface model: it includes buildings and tree tops, so
// dense areas are slightly bumpy. A light blur hides most of it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fromFile } from 'geotiff';

// --- projection (keep in step with src/scene/geo.ts) ---
const R = 6378137, K = Math.cos((23 * Math.PI) / 180), rad = (d) => (d * Math.PI) / 180;
const KAABAH = { lat: 21.4225, lon: 39.8262 };
const NABAWI = { lat: 24.4672, lon: 39.6111 };
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
const unmerc = (y) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
const project = (lat, lon) => [R * K * rad(lon - KAABAH.lon), -R * K * (merc(lat) - merc(KAABAH.lat))];
const unproject = (x, z) => ({ lat: unmerc(-z / (R * K) + merc(KAABAH.lat)), lon: KAABAH.lon + ((x / (R * K)) * 180) / Math.PI });

// --- region and patches ---
const REGION = { lat0: 21.0, lat1: 25.0, lon0: 39.0, lon1: 41.0 }; // whole degrees = whole tiles
const RW = 1408, RH = 3072; // region raster size (cells of about 145 m)
const PATCH_HALF = 4000, PN = 320; // city patch: 8 km square, 25 m cells

// --- paper layers: height above local valley floor (m) where each layer starts.
// Layer 4 of 12 (sage green) is the lowest; the app's palette has teal below it.
const EDGES = [0, 120, 200, 300, 420, 560, 740, 980, Infinity];
const LAYER0 = 4;
const SEA = 0.04; // paper height of open water: the bottom (teal) layer
function paperT(relief) {
  let i = 0;
  while (i < EDGES.length - 2 && relief >= EDGES[i + 1]) i++;
  const hi = i === EDGES.length - 2 ? EDGES[i] + 400 : EDGES[i + 1];
  const u = Math.min(1, Math.max(0, (relief - EDGES[i]) / (hi - EDGES[i])));
  return Math.min(1, (LAYER0 + i + u * 0.98) / 12);
}

// --- load tiles ---
const tiles = {};
for (let lat = REGION.lat0; lat < REGION.lat1; lat++) {
  for (let lon = REGION.lon0; lon < REGION.lon1; lon++) {
    const name = `Copernicus_DSM_COG_10_N${String(lat).padStart(2, '0')}_00_E${String(lon).padStart(3, '0')}_00_DEM`;
    const file = `data/raw/copernicus/${name}.tif`;
    if (!existsSync(file)) {
      mkdirSync('data/raw/copernicus', { recursive: true });
      console.log('downloading', name);
      execFileSync('curl', ['-sS', '--fail', '-m', '600', '-o', file, `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`], { stdio: 'inherit' });
    }
    const img = await (await fromFile(file)).getImage();
    const w = img.getWidth(), h = img.getHeight();
    const data = await img.readRasters({ interleave: true });
    tiles[`${lat},${lon}`] = { data, w, h };
    console.log(name, w, 'x', h);
  }
}
// Bilinear height in metres at a latitude/longitude.
function elev(lat, lon) {
  const tl = Math.floor(lat), tn = Math.floor(lon);
  const t = tiles[`${tl},${tn}`];
  if (!t) return 0;
  const fx = Math.min(t.w - 1.001, Math.max(0, (lon - tn) * t.w - 0.5));
  const fy = Math.min(t.h - 1.001, Math.max(0, (tl + 1 - lat) * t.h - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, d = t.data;
  const a = d[y0 * t.w + x0], b = d[y0 * t.w + x0 + 1], c = d[(y0 + 1) * t.w + x0], e = d[(y0 + 1) * t.w + x0 + 1];
  return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + e * ax) * ay;
}

// --- region grid in metres ---
const [rx0, rz0] = project(REGION.lat1, REGION.lon0); // north-west corner
const [rx1, rz1] = project(REGION.lat0, REGION.lon1); // south-east corner
const cw = (rx1 - rx0) / RW, ch = (rz1 - rz0) / RH;
console.log('region metres', Math.round(rx1 - rx0), 'x', Math.round(rz1 - rz0), 'cell', cw.toFixed(0), 'x', ch.toFixed(0));
const E = new Float32Array(RW * RH);
for (let j = 0; j < RH; j++) {
  for (let i = 0; i < RW; i++) {
    // The lowest of 25 samples in each cell: the surface model includes buildings and
    // trees, and the lowest sample is the ground between them.
    let m = Infinity;
    for (let sj = 0; sj < 5; sj++) for (let si = 0; si < 5; si++) {
      const p = unproject(rx0 + (i + (si + 0.5) / 5) * cw, rz0 + (j + (sj + 0.5) / 5) * ch);
      m = Math.min(m, elev(p.lat, p.lon));
    }
    E[j * RW + i] = m;
  }
}

// --- local valley floor: a wide minimum filter, blurred, on a coarse grid ---
const D = 8, BW = RW / D, BH = RH / D, WIN = Number(process.env.WIN ?? 8); // coarse cells of 0.8 km: 8 = about 6 km each way
const C = new Float32Array(BW * BH);
for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
  let m = Infinity;
  for (let jj = 0; jj < D; jj++) for (let ii = 0; ii < D; ii++) m = Math.min(m, E[(j * D + jj) * RW + i * D + ii]);
  C[j * BW + i] = m;
}
function minFilter(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let m = Infinity;
    for (let k = Math.max(0, i - r); k <= Math.min(w - 1, i + r); k++) m = Math.min(m, src[j * w + k]);
    tmp[j * w + i] = m;
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let m = Infinity;
    for (let k = Math.max(0, j - r); k <= Math.min(h - 1, j + r); k++) m = Math.min(m, tmp[k * w + i]);
    out[j * w + i] = m;
  }
  return out;
}
function boxBlur(src, w, h, r, passes) {
  let a = src;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, i - r); k <= Math.min(w - 1, i + r); k++) { s += a[j * w + k]; n++; }
      tmp[j * w + i] = s / n;
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, j - r); k <= Math.min(h - 1, j + r); k++) { s += tmp[k * w + i]; n++; }
      out[j * w + i] = s / n;
    }
    a = out;
  }
  return a;
}
const BASE = boxBlur(minFilter(C, BW, BH, WIN), BW, BH, 8, 2);
// Valley floor in metres at a map position (bilinear on the coarse grid).
function baseAt(x, z) {
  const fx = Math.min(BW - 1.001, Math.max(0, (x - rx0) / (cw * D) - 0.5));
  const fy = Math.min(BH - 1.001, Math.max(0, (z - rz0) / (ch * D) - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
  const g = (i, j) => BASE[j * BW + i];
  return (g(x0, y0) * (1 - ax) + g(x0 + 1, y0) * ax) * (1 - ay) + (g(x0, y0 + 1) * (1 - ax) + g(x0 + 1, y0 + 1) * ax) * ay;
}

mkdirSync('public/data', { recursive: true });
const regionT = new Uint8Array(RW * RH);
for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
  const x = rx0 + (i + 0.5) * cw, z = rz0 + (j + 0.5) * ch;
  const e = E[j * RW + i];
  regionT[j * RW + i] = Math.round((e <= 0.5 ? SEA : paperT(Math.max(0, e - baseAt(x, z)))) * 255);
}
writeFileSync('public/data/terrain-region.bin', regionT);

// --- city patches: 30 m heights, lightly blurred, same relief rule ---
function patch(name, c) {
  const [cx, cz] = project(c.lat, c.lon);
  const cell = (PATCH_HALF * 2) / PN;
  const H = new Float32Array(PN * PN);
  for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) {
    const p = unproject(cx - PATCH_HALF + (i + 0.5) * cell, cz - PATCH_HALF + (j + 0.5) * cell);
    H[j * PN + i] = elev(p.lat, p.lon);
  }
  // Remove buildings: lowest height within about 150 m, then smooth.
  const S = boxBlur(minFilter(H, PN, PN, 6), PN, PN, 2, 2);
  const out = new Uint8Array(PN * PN);
  let minR = 1e9, maxR = 0;
  for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) {
    const x = cx - PATCH_HALF + (i + 0.5) * cell, z = cz - PATCH_HALF + (j + 0.5) * cell;
    const r = Math.max(0, S[j * PN + i] - baseAt(x, z));
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    out[j * PN + i] = Math.round((S[j * PN + i] <= 0.5 ? SEA : paperT(r)) * 255);
  }
  writeFileSync(`public/data/terrain-${name}.bin`, out);
  const centreElev = elev(c.lat, c.lon);
  console.log(name, 'centre relief', Math.round(centreElev - baseAt(cx, cz)), 'm;', { x: Math.round(cx), z: Math.round(cz) }, 'centre height m', Math.round(centreElev), 'valley floor m', Math.round(baseAt(cx, cz)), 'relief range', Math.round(minR), '-', Math.round(maxR));
  return { x: cx, z: cz, half: PATCH_HALF, n: PN, centreElevation: Math.round(centreElev) };
}
const meta = {
  source: 'Copernicus DEM GLO-30 (ESA / DLR / Airbus). Contains modified Copernicus data.',
  baked: new Date().toISOString(),
  layers: 12, layer0: LAYER0, edgesMetres: EDGES.slice(0, -1),
  region: { x: rx0, z: rz0, w: rx1 - rx0, h: rz1 - rz0, nx: RW, nz: RH },
  makkah: patch('makkah', KAABAH),
  madinah: patch('madinah', NABAWI),
};
writeFileSync('public/data/terrain-meta.json', JSON.stringify(meta, null, 1));
console.log('done');

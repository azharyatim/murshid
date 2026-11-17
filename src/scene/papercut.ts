// The Papercut look (?look=papercut): colours, zoom stages and the layered-paper
// ground painter. Adapted from branch claude/hopeful-heisenberg-a1p880
// (paperPaint.ts, papercutCity.ts, PapercutScene.ts) for this prototype's own
// projection and real OpenStreetMap buildings.
//
// Ground heights are real: Copernicus DEM GLO-30, baked by scripts/bake-terrain.mjs
// into public/data/terrain-*.bin (attribution "Contains modified Copernicus data").
// Each byte is a "paper height" from HEIGHT ABOVE THE LOCAL VALLEY FLOOR, cut
// into 12 bands: 0-3 water, 4 the valley floor, 5-11 higher ground.

import { REGION_ORIGIN } from './projection';

// ---- Colours ---------------------------------------------------------------

/** The owner's colours (chosen by the owner; use exactly). */
export const PAPER_OWNER = {
  ground1: '#ECDEC4', // band 4, the valley floor (both cities sit on it)
  ground2: '#EAE6C9', // band 5
  ground3: '#E9DBA0', // band 6
  hotel: '#B7CD9B',
  shop: '#EFC086',
  home: '#F7EFE2', // also the open Mataf floor
  tower: '#60998A',
  mosque: '#E49468',
  kaabah: '#26324D',
  node: '#623C00',
};

/**
 * PLACEHOLDERS: colours the owner has not chosen, taken from the Papercut
 * build's first palette as stand-ins.
 */
export const PAPER_PLACEHOLDER = {
  higher: ['#EEC98E', '#F0B47B', '#E49469', '#DC8669', '#EECCBA'], // bands 7-11
  water: '#2F7A7C', // bands 0-3 and the map background
  greenDome: '#62A69A', // not used yet (Madinah comes in stage B)
};

export const PAPER_LAYERS = 12;
const BAND_COLOURS: string[] = [
  ...Array(4).fill(PAPER_PLACEHOLDER.water),
  PAPER_OWNER.ground1,
  PAPER_OWNER.ground2,
  PAPER_OWNER.ground3,
  ...PAPER_PLACEHOLDER.higher,
];

/** Building type (from scripts/bake-osm.mjs) to colour. */
export const PAPER_TYPE_COLOUR: Record<string, string> = {
  t: PAPER_OWNER.tower,
  h: PAPER_OWNER.hotel,
  s: PAPER_OWNER.shop,
  o: PAPER_OWNER.home,
};

// ---- Zoom stages -------------------------------------------------------------
//
// Camera distance to a city's centre, in metres. Re-derived for this scene: the
// reference used 70 km / 30 km / 2.9-1.2 km for a city about 1.5 km across;
// this prototype's real buildings cover about 1.8 km (900 m around the mosque),
// so every distance is about 1.2 times larger.
export const PAPER_STAGES = {
  patchStart: 84_000, // sharper ground patch starts to fade in
  patchFull: 26_000,
  footStart: 36_000, // flat footprints start to fade in
  footFull: 11_000,
  growStart: 3_500, // buildings start rising (3% height)...
  growEnd: 1_450, // ...and reach full height
};

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---- Projection of the baked terrain (Mercator, from the Papercut branch's geo.ts) ----

const R = 6378137;
const K = Math.cos((23 * Math.PI) / 180);
const KAABAH = { lat: 21.4225, lon: 39.8262 };
const rad = (d: number) => (d * Math.PI) / 180;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
/** The terrain files' own x (east) for a longitude, and z (south) for a latitude. */
const terrainX = (lon: number) => R * K * rad(lon - KAABAH.lon);
const terrainZ = (lat: number) => -R * K * (merc(lat) - merc(KAABAH.lat));

// This prototype's projection (src/scene/projection.ts), inverted per axis.
const M_PER_LAT = 110574;
const M_PER_LON = Math.cos((REGION_ORIGIN.lat * Math.PI) / 180) * 111320;
const lonOf = (x: number) => REGION_ORIGIN.lon + x / M_PER_LON;
const latOf = (z: number) => REGION_ORIGIN.lat - z / M_PER_LAT;

export interface TerrainGrid {
  /** Terrain-projection metres of the grid's north-west corner, and its size. */
  x: number;
  z: number;
  w: number;
  h: number;
  nx: number;
  nz: number;
  /** Latitude/longitude box of the grid (whole degrees), written by bake-terrain.mjs. */
  latlon?: { lat0: number; lat1: number; lon0: number; lon1: number };
}

/** Latitude/longitude box of the region terrain file for meta files that do not record it (the first bake, 39 to 41 E). */
export const TERRAIN_REGION_LATLON = { lat0: 21, lat1: 25, lon0: 39, lon1: 41 };

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const BANDS = BAND_COLOURS.map(hex);

function grain(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs `work` for rows 0..n-1, giving the screen back about every 8 ms so the app stays responsive. */
async function inSlices(n: number, work: (row: number) => void) {
  let t = performance.now();
  for (let r = 0; r < n; r++) {
    work(r);
    if (performance.now() - t > 8) {
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
      t = performance.now();
    }
  }
}

/**
 * Paints layered paper for a rectangle of THIS scene's world (metres from the
 * regional origin: x east, z south), sampling a baked terrain grid that uses the
 * Papercut branch's Mercator projection. Both projections keep north up, so each
 * output column maps to one grid column and each row to one grid row.
 *
 * Each band is one flat colour. Like the reference, a thin soft shadow falls on
 * the lower right of each higher layer and a faint light edge on its upper left,
 * to read as stacked card; a little grain is added.
 */
export async function paintPaper(
  heights: Uint8Array,
  grid: TerrainGrid,
  world: { x0: number; z0: number; x1: number; z1: number },
  tw: number,
  th: number,
  shadow: number,
  fade: boolean,
): Promise<HTMLCanvasElement> {
  const col = new Float32Array(tw);
  for (let px = 0; px < tw; px++) {
    const x = world.x0 + ((px + 0.5) / tw) * (world.x1 - world.x0);
    col[px] = ((terrainX(lonOf(x)) - grid.x) / grid.w) * grid.nx - 0.5;
  }
  const row = new Float32Array(th);
  for (let py = 0; py < th; py++) {
    const z = world.z0 + ((py + 0.5) / th) * (world.z1 - world.z0);
    row[py] = ((terrainZ(latOf(z)) - grid.z) / grid.h) * grid.nz - 0.5;
  }
  const { nx, nz } = grid;
  const band = new Uint8Array(tw * th);
  await inSlices(th, (py) => {
    const v = Math.min(nz - 1.001, Math.max(0, row[py]));
    const j0 = Math.floor(v);
    const fy = v - j0;
    for (let px = 0; px < tw; px++) {
      const u = Math.min(nx - 1.001, Math.max(0, col[px]));
      const i0 = Math.floor(u);
      const fx = u - i0;
      const k = j0 * nx + i0;
      const t = (heights[k] * (1 - fx) + heights[k + 1] * fx) * (1 - fy) + (heights[k + nx] * (1 - fx) + heights[k + nx + 1] * fx) * fy;
      // Outside the baked area counts as water (the map background).
      const outside = col[px] < -0.5 || col[px] > nx - 0.5 || row[py] < -0.5 || row[py] > nz - 0.5;
      band[py * tw + px] = outside ? 0 : Math.min(PAPER_LAYERS - 1, Math.floor((t / 255) * PAPER_LAYERS));
    }
  });
  const cv = document.createElement('canvas');
  cv.width = tw;
  cv.height = th;
  const cx = cv.getContext('2d')!;
  const img = cx.createImageData(tw, th);
  const d = img.data;
  const rnd = grain(3);
  const clamp = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);
  await inSlices(th, (py) => {
    for (let px = 0; px < tw; px++) {
      const id = py * tw + px;
      const b = band[id];
      const c = BANDS[b];
      let f = 1;
      for (let k = 1; k <= shadow; k++) {
        const xx = px - k;
        const yy = py - k;
        if (xx < 0 || yy < 0) break;
        if (band[yy * tw + xx] > b) {
          f = 1 - 0.36 * (1 - (k - 1) / shadow);
          break;
        }
      }
      const hi = (px > 0 && band[id - 1] < b) || (py > 0 && band[id - tw] < b) ? 0.32 : 0;
      const g = (rnd() - 0.5) * 5;
      d[id * 4] = clamp(c[0] * f * (1 - hi) + 255 * hi + g);
      d[id * 4 + 1] = clamp(c[1] * f * (1 - hi) + 255 * hi + g);
      d[id * 4 + 2] = clamp(c[2] * f * (1 - hi) + 255 * hi + g);
      let a = 255;
      if (fade) {
        const dd = Math.max(Math.abs(px - tw / 2) / (tw / 2), Math.abs(py - th / 2) / (th / 2));
        a = 255 * (1 - smoothstep(0.78, 0.98, dd));
      }
      d[id * 4 + 3] = a;
    }
  });
  cx.putImageData(img, 0, 0);
  return cv;
}

/** This scene's world rectangle for a latitude/longitude box. */
export function worldRect(box: { lat0: number; lat1: number; lon0: number; lon1: number }) {
  return {
    x0: (box.lon0 - REGION_ORIGIN.lon) * M_PER_LON,
    x1: (box.lon1 - REGION_ORIGIN.lon) * M_PER_LON,
    z0: -(box.lat1 - REGION_ORIGIN.lat) * M_PER_LAT,
    z1: -(box.lat0 - REGION_ORIGIN.lat) * M_PER_LAT,
  };
}

/**
 * Loads a baked terrain file. The heights are stored as an 8-bit greyscale PNG
 * (see scripts/terrain-to-png.mjs) because preview pages cannot serve .bin
 * files; decoded with no colour conversion so every byte comes back exactly.
 */
export async function loadTerrain(url: string): Promise<Uint8Array> {
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`could not load ${url}: ${r.status}`);
    return r.blob();
  });
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const { width: w, height: h } = bmp;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(bmp, 0, 0);
  bmp.close();
  const rgba = cx.getImageData(0, 0, w, h).data;
  cv.width = cv.height = 1; // free the decoded image
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return out;
}

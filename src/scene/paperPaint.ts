// Paints the "layered paper" ground texture from baked heights.
//
// Heights arrive as one byte per cell (0..255 = paper height 0..1, see
// scripts/bake-terrain.mjs). They are cut into 12 layers, each layer is one
// flat colour from the Papercut ramp, and three small effects give the cut-card
// look: a soft shadow on the lower right of each higher layer, a faint light
// edge on its upper left, and a little grain.

const PAPER: [number, string][] = [
  [0, '#2f7a7c'],
  [0.18, '#62a69a'],
  [0.38, '#b5cf9e'],
  [0.55, '#ecdca0'],
  [0.72, '#f0b178'],
  [0.86, '#d9795a'],
  [1, '#f7efe2'],
];
export const LAYERS = 12;

const hex = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

function ramp(t: number): [number, number, number] {
  for (let i = 1; i < PAPER.length; i++) {
    if (t <= PAPER[i][0]) {
      const [t0, c0] = PAPER[i - 1];
      const [t1, c1] = PAPER[i];
      const f = (t - t0) / (t1 - t0);
      const a = hex(c0);
      const b = hex(c1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return hex(PAPER[PAPER.length - 1][1]);
}

const LAYER_COLOURS = Array.from({ length: LAYERS }, (_, b) => ramp((b + 0.5) / LAYERS));

/** Replace the colour of chosen layers (index -> '#rrggbb'). Call before the scene is created. */
export function setLayerColours(overrides: Record<number, string>) {
  for (const [i, c] of Object.entries(overrides)) LAYER_COLOURS[Number(i)] = hex(c);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function grain(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs `work` for rows 0..n-1, handing the screen back about every 8 ms so the app stays responsive. */
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
 * @param heights nx*nz bytes, row 0 = north
 * @param tw,th   output size in pixels (any size; heights are interpolated)
 * @param shadow  width of the layer shadow in pixels
 * @param fade    fade the outer edge to transparent, for a patch laid over a wider map
 */
export async function paintPaper(
  heights: Uint8Array,
  nx: number,
  nz: number,
  tw: number,
  th: number,
  shadow: number,
  fade: boolean,
): Promise<HTMLCanvasElement> {
  const band = new Uint8Array(tw * th);
  await inSlices(th, (py) => {
    const v = (py / (th - 1)) * (nz - 1);
    const j0 = Math.min(nz - 2, Math.floor(v));
    const fy = v - j0;
    for (let px = 0; px < tw; px++) {
      const u = (px / (tw - 1)) * (nx - 1);
      const i0 = Math.min(nx - 2, Math.floor(u));
      const fx = u - i0;
      const k = j0 * nx + i0;
      const t = (heights[k] * (1 - fx) + heights[k + 1] * fx) * (1 - fy) + (heights[k + nx] * (1 - fx) + heights[k + nx + 1] * fx) * fy;
      band[py * tw + px] = Math.min(LAYERS - 1, Math.floor((t / 255) * LAYERS));
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
      const c = LAYER_COLOURS[b];
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

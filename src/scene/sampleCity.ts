// PLACEHOLDER city used until real map data is available.
// It is procedurally generated and does not match real streets. It will be
// replaced by pre-baked OpenStreetMap buildings and roads.

export interface Box {
  x: number;
  z: number;
  w: number; // size along local x
  d: number; // size along local z
  h: number;
  rot: number;
}

export interface SampleCity {
  slabs: Box[];
  buildings: Box[];
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSampleCity(radius = 1150, clearRadius = 350): SampleCity {
  const rnd = mulberry32(7);
  const cell = 74;
  const road = 15;
  const rot = 0.31;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const slabs: Box[] = [];
  const buildings: Box[] = [];
  const n = Math.ceil(radius / cell) + 1;

  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const lx = i * cell;
      const lz = j * cell;
      const x = lx * cos - lz * sin;
      const z = lx * sin + lz * cos;
      const dist = Math.hypot(x, z);
      if (dist > radius || dist < clearRadius) continue;
      // A wide avenue running towards the centre, and a second cross avenue.
      if (Math.abs(i - 1) < 1 && j > 0) continue;
      if (j === -4) continue;

      const size = cell - road;
      slabs.push({ x, z, w: size, d: size, h: 0.7, rot });
      if (rnd() < 0.07) continue; // open plaza

      // Split the block into 1 to 4 lots.
      const cols = rnd() < 0.55 ? 2 : 1;
      const rows = rnd() < 0.5 ? 2 : 1;
      const lotW = size / cols;
      const lotD = size / rows;
      const central = Math.max(0, 1 - (dist - clearRadius) / 330);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rnd() < 0.08) continue;
          const inset = 2.5 + rnd() * 3;
          const w = lotW - inset * 2;
          const d = lotD - inset * 2;
          const ox = -size / 2 + lotW * (c + 0.5);
          const oz = -size / 2 + lotD * (r + 0.5);
          let h = 9 + rnd() * 22;
          if (rnd() < 0.18 + central * 0.5) h = 40 + rnd() * (35 + central * 60);
          buildings.push({
            x: x + ox * cos - oz * sin,
            z: z + ox * sin + oz * cos,
            w,
            d,
            h,
            rot,
          });
        }
      }
    }
  }
  return { slabs, buildings };
}

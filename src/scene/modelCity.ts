// ILLUSTRATIVE city and terrain for the "model" look mockup.
//
// This is NOT real map data. It imitates the character of Makkah (a valley
// floor ringed by hills, irregular districts, small hillside houses, taller
// blocks near the mosque) so the visual treatment can be judged before real
// OpenStreetMap buildings and elevation data are available.

import type { Box } from './sampleCity';

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

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Hills as [x, z, height, spread] in metres. Positions are invented.
const HILLS: [number, number, number, number][] = [
  [700, -120, 250, 250],
  [540, -740, 200, 280],
  [-680, 500, 220, 270],
  [-840, -240, 170, 250],
  [180, 880, 190, 280],
  [-320, -960, 180, 280],
  [1150, 560, 210, 320],
  [-1250, -900, 200, 340],
];

export const TERRACE = 14; // metres per contour layer

/** Smooth ground height before terracing. */
function rawHeight(x: number, z: number) {
  const d = Math.hypot(x - 40, z + 90);
  const valley = smoothstep(360, 760, d);
  let h = 0;
  for (const [hx, hz, amp, s] of HILLS) {
    const dx = x - hx;
    const dz = z - hz;
    h += amp * Math.exp(-(dx * dx + dz * dz) / (2 * s * s));
  }
  h += 14 * Math.sin(x / 130 + 1.3) * Math.cos(z / 170) + 9 * Math.sin((x + z) / 75);
  return Math.max(0, h) * valley;
}

/** Ground height in contour layers, like a stacked site model. */
export function terrainHeight(x: number, z: number) {
  return Math.floor(rawHeight(x, z) / TERRACE) * TERRACE;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

export function generateModelCity(radius = 1500): Box[] {
  const rnd = mulberry32(11);
  const buildings: Box[] = [];

  // Roads: an uneven ring around the mosque and a few winding radials.
  const roads: [number, number][][] = [];
  const ring: [number, number][] = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = 430 + 55 * Math.sin(a * 3 + 0.7);
    ring.push([40 + Math.cos(a) * r, -90 + Math.sin(a) * r]);
  }
  roads.push(ring);
  for (const a0 of [0.35, 1.5, 2.6, 3.7, 4.6, 5.6]) {
    const line: [number, number][] = [];
    for (let k = 0; k <= 12; k++) {
      const r = 300 + k * 110;
      const a = a0 + 0.22 * Math.sin(k * 0.55 + a0 * 3);
      line.push([40 + Math.cos(a) * r, -90 + Math.sin(a) * r]);
    }
    roads.push(line);
  }
  const nearRoad = (x: number, z: number, half: number) => {
    for (const line of roads) {
      for (let i = 0; i < line.length - 1; i++) {
        if (distToSegment(x, z, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]) < half) return true;
      }
    }
    return false;
  };

  // Districts: each has its own street direction and lot size.
  const districts = Array.from({ length: 26 }, () => {
    const a = rnd() * Math.PI * 2;
    const r = 260 + Math.sqrt(rnd()) * (radius - 200);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, rot: rnd() * Math.PI, lot: 24 + rnd() * 22 };
  });
  const districtAt = (x: number, z: number) => {
    let best = 0;
    let bestD = Infinity;
    let second = Infinity;
    districts.forEach((d, i) => {
      const dd = Math.hypot(x - d.x, z - d.z);
      if (dd < bestD) {
        second = bestD;
        bestD = dd;
        best = i;
      } else if (dd < second) second = dd;
    });
    return { index: best, edge: second - bestD };
  };

  districts.forEach((d, index) => {
    const cos = Math.cos(d.rot);
    const sin = Math.sin(d.rot);
    const n = Math.ceil(620 / d.lot);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        // Every fourth row is a lane.
        if ((((j % 4) + 4) % 4) === 0) continue;
        const lx = i * d.lot;
        const lz = j * d.lot;
        const x = d.x + lx * cos - lz * sin;
        const z = d.z + lx * sin + lz * cos;
        const dist = Math.hypot(x, z);
        if (dist > radius) continue;
        // Keep the mosque, its plazas and the Mas'a clear.
        if (dist < 310) continue;
        if (x > 40 && x < 200 && z > -400 && z < 150) continue;
        const where = districtAt(x, z);
        if (where.index !== index || where.edge < 16) continue;

        const ground = rawHeight(x, z);
        const central = 1 - smoothstep(330, 640, dist);
        if (nearRoad(x, z, 15 + central * 6)) continue;
        // Thinner at the edges of the model and on the highest slopes.
        const keep = 0.9 - smoothstep(1050, radius, dist) * 0.5 - smoothstep(40, 150, ground) * 0.72;
        if (rnd() > keep) continue;

        const hillside = smoothstep(18, 70, ground);
        // Varied footprints: some square, some long and narrow.
        let w = d.lot * (0.45 + rnd() * 0.45);
        let dp = d.lot * (0.45 + rnd() * 0.45);
        let h = 6 + rnd() * rnd() * 30;
        if (hillside > 0.4) {
          // Small houses stepping up the slopes.
          w *= 0.72;
          dp *= 0.72;
          h = 5 + rnd() * 8;
        } else if (rnd() < 0.12 + central * 0.6) {
          // Taller blocks on the valley floor, tallest near the mosque.
          h = 38 + rnd() * (30 + central * 85);
          w = d.lot * 0.9;
          dp = d.lot * 0.9;
        }
        const base = terrainHeight(x, z);
        buildings.push({ x, z, w, d: dp, h: h + 4, rot: d.rot + (rnd() - 0.5) * 0.08, y: base - 4 });
      }
    }
  });
  return buildings;
}

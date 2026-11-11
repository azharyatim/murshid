import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Builds meshes from the baked OpenStreetMap file (public/data/<name>.json,
// made by scripts/bake-osm.mjs). Coordinates are metres from the Kaabah:
// x = east, z = south. Rings are flat [x, z, x, z, ...] lists.

export interface CityData {
  source: string;
  osmTimestamp?: string;
  landmarks: {
    kaabah: number[];
    kaabahHeight: number;
    mataf?: number[];
    maqam?: [number, number];
    safa?: [number, number];
    marwa?: [number, number];
  };
  buildings: { kind: 'building' | 'haram' | 'roof'; h: number; min?: number; est?: 1; rings: number[][] }[];
  roads: { w: number; pts: number[] }[];
}

export async function loadCity(name: string): Promise<CityData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!res.ok) throw new Error(`could not load city data: ${res.status}`);
  return res.json();
}

function toShape(rings: number[][]) {
  const path = (r: number[]) => {
    const pts: THREE.Vector2[] = [];
    // Shape y is minus z, so that after rotating upright north stays north.
    for (let i = 0; i < r.length; i += 2) pts.push(new THREE.Vector2(r[i], -r[i + 1]));
    return pts;
  };
  const shape = new THREE.Shape(path(rings[0]));
  rings.slice(1).forEach((r) => shape.holes.push(new THREE.Path(path(r))));
  return shape;
}

/** One extruded footprint, standing on the ground (or raised, for bridges). */
function extrude(rings: number[][], height: number, base = 0, baseShade?: number) {
  const geo = new THREE.ExtrudeGeometry(toShape(rings), { depth: Math.max(0.5, height - base), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, base, 0);
  if (baseShade !== undefined) {
    // Slightly darker at the foot of each wall, a cheap stand-in for bounced light.
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) colors.fill(p.getY(i) > base + 0.01 ? 1 : baseShade, i * 3, i * 3 + 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return geo;
}

export function buildingGeometry(data: CityData, kinds: string[], baseShade?: number) {
  const parts = data.buildings
    .filter((b) => kinds.includes(b.kind))
    .map((b) => extrude(b.rings, b.h, b.min ?? 0, baseShade));
  return parts.length ? mergeGeometries(parts) : null;
}

/** The open courtyard floor around the Kaabah, so it reads as part of the mosque. */
export function matafGeometry(data: CityData) {
  return data.landmarks.mataf ? extrude([data.landmarks.mataf], 0.4) : null;
}

/** Distance from the Kaabah to the nearest edge of the courtyard, in metres. */
export function matafClearance(data: CityData) {
  const r = data.landmarks.mataf;
  if (!r) return null;
  let best = Infinity;
  for (let i = 0; i < r.length; i += 2) {
    const j = (i + 2) % r.length;
    const [ax, az, bx, bz] = [r[i], r[i + 1], r[j], r[j + 1]];
    const t = Math.max(0, Math.min(1, -(ax * (bx - ax) + az * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
    best = Math.min(best, Math.hypot(ax + t * (bx - ax), az + t * (bz - az)));
  }
  return best;
}

export function kaabahGeometry(data: CityData) {
  return extrude([data.landmarks.kaabah], data.landmarks.kaabahHeight);
}

/** Roads as flat ribbons lying just above the ground. */
export function roadGeometry(data: CityData, y = 0.15) {
  const pos: number[] = [];
  for (const r of data.roads) {
    const half = r.w / 2;
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const [x1, z1, x2, z2] = [r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3]];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1;
      const nx = (-(z2 - z1) / len) * half;
      const nz = ((x2 - x1) / len) * half;
      // Two triangles per segment, facing up.
      pos.push(x1 + nx, y, z1 + nz, x2 + nx, y, z2 + nz, x1 - nx, y, z1 - nz);
      pos.push(x1 - nx, y, z1 - nz, x2 + nx, y, z2 + nz, x2 - nx, y, z2 - nz);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  // Make every triangle face up regardless of winding.
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return geo;
}

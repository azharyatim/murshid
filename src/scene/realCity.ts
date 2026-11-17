import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Builds meshes from the baked OpenStreetMap file (public/data/<name>.json,
// made by scripts/bake-osm.mjs). Coordinates are metres from the Kaabah:
// x = east, z = south. Rings are flat [x, z, x, z, ...] lists.

export interface CityData {
  source: string;
  osmTimestamp?: string;
  /** Latitude and longitude of the city's local origin (metres are measured from here). */
  origin: { lat: number; lon: number };
  landmarks: {
    /** Only in Makkah. */
    kaabah?: number[];
    /** Centre of Abraj al-Bait (the Clock Towers), Makkah only. */
    towers?: [number, number];
    kaabahHeight?: number;
    mataf?: number[];
    maqam?: [number, number];
    safa?: [number, number];
    marwa?: [number, number];
  };
  buildings: {
    kind: 'building' | 'haram' | 'roof';
    h: number;
    min?: number;
    est?: 1;
    rings: number[][];
    /** Type for the Papercut colours: t tower, h hotel, s shop, o home. */
    c?: 't' | 'h' | 's' | 'o';
    /** 1 when the type is a guess from height and position, not from map tags. */
    g?: 1;
  }[];
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

/**
 * Papercut look: every building and the mosque in one mesh, each building one
 * flat colour (no shading gradient), chosen by `colourOf`.
 */
export function paperBuildingGeometry(data: CityData, colourOf: (b: CityData['buildings'][number]) => string) {
  const col = new THREE.Color();
  const parts = data.buildings.map((b) => {
    const geo = extrude(b.rings, b.h, b.min ?? 0);
    col.set(colourOf(b));
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([col.r, col.g, col.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  });
  return parts.length ? mergeGeometries(parts) : null;
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
  return data.landmarks.kaabah ? extrude([data.landmarks.kaabah], data.landmarks.kaabahHeight ?? 15) : null;
}

/** The regional map (public/data/region.json, made by scripts/bake-region.mjs). */
export interface RegionPoint {
  osm: string;
  name?: string;
  nameEn?: string;
  lat: number;
  lon: number;
  pos: [number, number];
}
export interface RegionData {
  source: string;
  osmTimestamp?: string;
  roads: { c: 'major' | 'minor'; pts: number[] }[];
  rail: number[][];
  sea: number[] | null;
  islands: number[][];
  cities: RegionPoint[];
  towns: RegionPoint[];
  features: RegionPoint[];
}

export async function loadRegion(): Promise<RegionData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/region.json`);
  if (!res.ok) throw new Error(`could not load region data: ${res.status}`);
  return res.json();
}

/** Polylines as one set of line segments, lying at height y. */
export function polylineGeometry(lines: number[][], y: number) {
  const pos: number[] = [];
  for (const pts of lines) {
    for (let i = 0; i + 3 < pts.length; i += 2) pos.push(pts[i], y, pts[i + 1], pts[i + 2], y, pts[i + 3]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** A flat polygon (the sea, or an island) lying at height y. */
export function flatPolygon(ring: number[], y: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < ring.length; i += 2) pts.push(new THREE.Vector2(ring[i], -ring[i + 1]));
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
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

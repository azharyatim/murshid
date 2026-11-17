import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Pin } from './CityScene';
import { KAABAH, NABAWI, project } from './geo';
import { paintPaper } from './paperPaint';
import { ABRAJ, GREEN_DOME, KIND_COLOUR, madinahBuildings, makkahBuildings, type Building } from './papercutCity';
import { madinahLandmarks, makkahLandmarks } from './papercutLandmarks';

// The Papercut look: a true-scale map of the Makkah to Madinah region in
// layered paper. Zooming into a city turns it, in three steps, into
// 3D buildings: footprints appear, then rise. Zooming out returns to the map.
//
// Real: ground heights (Copernicus DEM, baked by scripts/bake-terrain.mjs).
// Placeholder: every building (see papercutCity.ts).

export interface PapercutLabel {
  key: string;
  text: string;
  city: 0 | 1;
  /** Metres from the city's own origin: x = east, z = south. */
  pos: [number, number];
  /** 'region' labels show on the map and fade as the city rises; 'landmark' labels do the opposite. */
  kind: 'region' | 'landmark';
  /** A landmark label only shows while the camera is closer than this (metres). */
  maxDist?: number;
}

export const PAPERCUT_LABELS: PapercutLabel[] = [
  { key: 'r-makkah', text: 'Makkah', city: 0, pos: [0, 0], kind: 'region' },
  { key: 'r-madinah', text: 'Madinah', city: 1, pos: [0, 0], kind: 'region' },
  { key: 'l-kaabah', text: 'Kaabah', city: 0, pos: [0, 0], kind: 'landmark' },
  { key: 'l-haram', text: 'Masjid al-Haram', city: 0, pos: [-150, -130], kind: 'landmark', maxDist: 1400 },
  { key: 'l-abraj', text: 'Abraj al-Bait', city: 0, pos: [ABRAJ[0], ABRAJ[1] + 30], kind: 'landmark' },
  { key: 'l-nabawi', text: 'Masjid an-Nabawi', city: 1, pos: [0, -100], kind: 'landmark' },
  { key: 'l-dome', text: 'Green Dome', city: 1, pos: [GREEN_DOME[0] + 10, GREEN_DOME[1] + 20], kind: 'landmark', maxDist: 1400 },
];

export interface PaperStage {
  loading: boolean;
  /** Which city the camera is nearest to. */
  nearest: 0 | 1;
  /** 0 = region, 1 = closest. Logarithmic, so each zoom step feels the same. */
  zoom: number;
  /** 0..1, how far the buildings of the nearest city have risen. */
  growth: number;
  legend: number;
  level: string;
}

const CITIES = [
  { name: 'Makkah', ll: KAABAH },
  { name: 'Madinah', ll: NABAWI },
].map((c) => {
  const [x, z] = project(c.ll.lat, c.ll.lon);
  return { name: c.name, x, z };
});

// Zoom thresholds, as camera distance to the city centre in metres.
// Buildings rise between GROW_START and GROW_END (the reference prototype used
// 2900 and 1200 for a city of the same size). Footprints fade in before that.
const GROW_START = 2900;
const GROW_END = 1200;
const FOOT_START = 30000;
const FOOT_FULL = 9000;
const PATCH_START = 70000; // hi-res ground fades in
const PATCH_FULL = 22000;

const MIN_DISTANCE = 120;
const MAX_DISTANCE = 1_600_000;
const NODE_COUNT = 150;
const BG = 0x2f7a7c;

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface View {
  target: THREE.Vector3;
  dist: number;
  polar: number;
  azimuth: number;
}
interface Flight {
  from: View;
  to: View;
  t: number;
  dur: number;
}
interface TawafNode {
  radius: number;
  angle: number;
  speed: number;
}
interface CityParts {
  group: THREE.Group;
  grow: THREE.Group;
  patch: THREE.Mesh;
  patchMat: THREE.MeshBasicMaterial;
  shadowPlane: THREE.Mesh;
  buildings: THREE.InstancedMesh | null;
  buildingMat: THREE.MeshLambertMaterial;
  painted: boolean;
}

export class PapercutScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 10, 1e6);
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight(0xffffff, 1.57);
  private region: THREE.Mesh | null = null;
  private regionBounds = { x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 };
  private meta: any = null;
  private cities: CityParts[] = [];
  private nodeMesh: THREE.InstancedMesh;
  private nodes: TawafNode[] = [];
  private dummy = new THREE.Object3D();
  private pins: Pin[] = [];
  private labels: { def: PapercutLabel; el: HTMLElement }[] = [];
  private flight: Flight | null = null;
  private raf = 0;
  private last = 0;
  private needsRender = true;
  private reducedMotion: boolean;
  private resizeObserver: ResizeObserver;
  private tmp = new THREE.Vector3();
  private disposed = false;
  private small: boolean;
  private dpr: number;
  private shadowSize: number;
  private texSize: number;

  private stage: PaperStage = { loading: true, nearest: 0, zoom: 0, growth: 0, legend: 0, level: 'Loading map' };
  private growth: [number, number] = [0, 0];
  private foot: [number, number] = [0, 0];
  private lastNodeGrowth = -1;
  /** Called when the zoom stage changes enough for the interface to care. */
  onStage: ((s: PaperStage) => void) | null = null;
  /** Called about once a second with the measured frame rate, only if asked for. */
  onFps: ((fps: number, note: string) => void) | null = null;
  private fpsFrames = 0;
  private fpsStart = 0;
  private slowSeconds = 0;
  private lowDetail = false;

  constructor(
    private canvas: HTMLCanvasElement,
    reducedMotion: boolean,
    /** 'auto' drops detail if the frame rate is poor; 'low' starts low; 'high' never drops (for testing). */
    private quality: 'auto' | 'low' | 'high' = 'auto',
  ) {
    this.reducedMotion = reducedMotion;
    this.small = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.small ? 1.75 : 2);
    this.shadowSize = this.small ? 1536 : 2048;
    this.texSize = this.small ? 1536 : 2048;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(BG);

    // Soft sky fill plus one sun. Intensities are chosen so flat colours read close to the palette.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c9a8, 1.95));
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -900;
    sc.right = 900;
    sc.top = 900;
    sc.bottom = -900;
    sc.near = 100;
    sc.far = 3200;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);

    // One group per city, with buildings that grow from 3% to full height.
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    CITIES.forEach((c, i) => {
      const group = new THREE.Group();
      group.position.set(c.x, 0, c.z);
      const grow = new THREE.Group();
      grow.add(i === 0 ? makkahLandmarks() : madinahLandmarks());
      group.add(grow);
      const patchMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.y = 0.4;
      patch.renderOrder = 1;
      patch.visible = false;
      group.add(patch);
      const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.ShadowMaterial({ opacity: 0.3 }));
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = 0.8;
      shadowPlane.receiveShadow = true;
      shadowPlane.renderOrder = 2;
      group.add(shadowPlane);
      group.visible = false;
      this.scene.add(group);
      this.cities.push({
        group,
        grow,
        patch,
        patchMat,
        shadowPlane,
        buildings: null,
        buildingMat: new THREE.MeshLambertMaterial({ color: 0xffffff }),
        painted: false,
      });
    });

    // Travelling nodes circle the Kaabah anticlockwise. They appear once the buildings are mostly up.
    this.nodeMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1.7, 10, 8),
      new THREE.MeshBasicMaterial({ color: KIND_COLOUR.node }),
      NODE_COUNT,
    );
    this.nodeMesh.frustumCulled = false;
    let seed = 3;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < NODE_COUNT; i++) {
      const radius = 13 + Math.pow(rnd(), 1.4) * 48;
      this.nodes.push({ radius, angle: rnd() * Math.PI * 2, speed: (5.5 + rnd() * 2) / radius });
    }
    this.nodeMesh.visible = false;
    this.scene.add(this.nodeMesh);

    // Touch: one finger rotates and tilts, two fingers pinch to zoom and drag to move.
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.minPolarAngle = 0.02;
    this.controls.maxPolarAngle = 1.3;
    this.controls.zoomSpeed = 1.8;
    this.controls.zoomToCursor = true;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('change', () => {
      const t = this.controls.target;
      const b = this.regionBounds;
      t.x = THREE.MathUtils.clamp(t.x, b.x0, b.x1);
      t.z = THREE.MathUtils.clamp(t.z, b.z0, b.z1);
      t.y = 0;
      this.needsRender = true;
    });
    this.controls.addEventListener('start', () => (this.flight = null));

    if (quality === 'low') this.degrade('requested');
    else this.applyQuality();
    this.resize();
    this.showAll(false);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.raf = requestAnimationFrame(this.tick);
    // Let the first frame and the interface show before the heavy painting starts.
    setTimeout(() => void this.loadRegion(), 30);
  }

  // Data -------------------------------------------------------------------

  private url(file: string) {
    return `${import.meta.env.BASE_URL}data/${file}`;
  }

  private makeTexture(cv: HTMLCanvasElement) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // Free the raster once the graphics card has its own copy.
    tex.onUpdate = () => {
      cv.width = cv.height = 1;
      tex.onUpdate = () => {};
    };
    return tex;
  }

  private async loadRegion() {
    try {
      const [meta, buf] = await Promise.all([
        fetch(this.url('terrain-meta.json')).then((r) => r.json()),
        fetch(this.url('terrain-region.bin')).then((r) => r.arrayBuffer()),
      ]);
      if (this.disposed) return;
      this.meta = meta;
      const r = meta.region;
      // Keep within what this device's graphics card can hold.
      const th = Math.min(r.nz, this.renderer.capabilities.maxTextureSize);
      const tw = Math.max(256, Math.round((r.nx * th) / r.nz));
      const t0 = performance.now();
      const cv = await paintPaper(new Uint8Array(buf), r.nx, r.nz, tw, th, 2, false);
      if (this.disposed) return;
      if (import.meta.env.DEV) console.info(`paint region ${tw}x${th}: ${(performance.now() - t0).toFixed(0)} ms`);
      const mat = new THREE.MeshBasicMaterial({ map: this.makeTexture(cv), toneMapped: false });
      this.region = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), mat);
      this.region.rotation.x = -Math.PI / 2;
      this.region.position.set(r.x + r.w / 2, 0, r.z + r.h / 2);
      this.scene.add(this.region);
      this.regionBounds = { x0: r.x, x1: r.x + r.w, z0: r.z, z1: r.z + r.h };
      this.stage.loading = false;
      this.needsRender = true;
    } catch (e) {
      console.error('Could not load the terrain', e);
    }
  }

  /** Paints a city's sharper ground patch the first time the camera gets near it. */
  private async ensurePatch(i: number) {
    const c = this.cities[i];
    if (c.painted || !this.meta) return;
    c.painted = true;
    const file = i === 0 ? 'terrain-makkah.bin' : 'terrain-madinah.bin';
    const buf = await fetch(this.url(file)).then((r) => r.arrayBuffer());
    if (this.disposed) return;
    const n = this.meta[i === 0 ? 'makkah' : 'madinah'].n;
    const size = Math.min(this.texSize, this.renderer.capabilities.maxTextureSize);
    const t0 = performance.now();
    const cv = await paintPaper(new Uint8Array(buf), n, n, size, size, 5, true);
    if (this.disposed) return;
    if (import.meta.env.DEV) console.info(`paint patch ${i} ${size}px: ${(performance.now() - t0).toFixed(0)} ms`);
    c.patchMat.map = this.makeTexture(cv);
    c.patchMat.needsUpdate = true;
    this.needsRender = true;
  }

  /** Builds one instanced mesh for a city's buildings, the first time it is needed. */
  private ensureBuildings(i: number) {
    const c = this.cities[i];
    if (c.buildings) return;
    const list: Building[] = i === 0 ? makkahBuildings() : madinahBuildings();
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(box, c.buildingMat, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach((b, k) => {
      p.set(b.x, 0, b.z);
      s.set(b.w, b.h, b.d);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, col.setHex(KIND_COLOUR[b.k]));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    c.grow.add(mesh);
    c.buildings = mesh;
  }

  // Quality ------------------------------------------------------------------

  private applyQuality() {
    this.renderer.setPixelRatio(this.dpr);
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** One step down in detail if the device cannot keep up. */
  private degrade(reason: string) {
    if (this.lowDetail) return;
    this.lowDetail = true;
    this.dpr = 1;
    this.shadowSize = 1024;
    this.texSize = 1024;
    this.applyQuality();
    this.resize();
    console.info(`Papercut: lower detail (${reason})`);
    this.onFps?.(0, 'lower detail');
  }

  // Camera ---------------------------------------------------------------------

  private view(): View {
    return {
      target: this.controls.target.clone(),
      dist: this.camera.position.distanceTo(this.controls.target),
      polar: this.controls.getPolarAngle(),
      azimuth: this.controls.getAzimuthalAngle(),
    };
  }

  private place(v: View) {
    const d = THREE.MathUtils.clamp(v.dist, MIN_DISTANCE, MAX_DISTANCE);
    const p = THREE.MathUtils.clamp(v.polar, 0.02, 1.3);
    this.controls.target.copy(v.target);
    this.camera.position.set(
      v.target.x + d * Math.sin(p) * Math.sin(v.azimuth),
      d * Math.cos(p),
      v.target.z + d * Math.sin(p) * Math.cos(v.azimuth),
    );
    this.controls.update();
    this.needsRender = true;
  }

  private flyTo(to: View, animate = true) {
    to.dist = THREE.MathUtils.clamp(to.dist, MIN_DISTANCE, MAX_DISTANCE);
    if (!animate || this.reducedMotion) {
      this.flight = null;
      this.place(to);
      return;
    }
    const from = this.view();
    // Longer trips take longer, but never more than about two seconds.
    const dur = THREE.MathUtils.clamp(0.6 + 0.3 * Math.abs(Math.log(to.dist / from.dist)), 0.6, 2.2);
    this.flight = { from, to, t: 0, dur };
  }

  /**
   * The region view: both cities in frame, north up, leaving room at the top for
   * the miqat chip and at the bottom for the zoom controls.
   */
  showAll(animate = true) {
    const mak = new THREE.Vector3(CITIES[0].x, 0, CITIES[0].z);
    const mad = new THREE.Vector3(CITIES[1].x, 0, CITIES[1].z);
    const span = mak.distanceTo(mad);
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    // The two cities take up 55% of the screen height, Madinah 14% from the top.
    const dist = Math.max(span / 0.55 / (2 * Math.tan(vHalf)), 100000 / Math.tan(hHalf));
    const visible = 2 * dist * Math.tan(vHalf);
    const target = new THREE.Vector3((mak.x + mad.x) / 2, 0, mad.z + (0.5 - 0.14) * visible);
    this.flyTo({ target, dist, polar: 0.25, azimuth: 0 }, animate);
  }

  /** Fly into a city: 0 = Makkah, 1 = Madinah. */
  goToCity(i: 0 | 1, animate = true) {
    const c = CITIES[i];
    this.flyTo({ target: new THREE.Vector3(c.x, 0, c.z), dist: 900, polar: 0.95, azimuth: this.controls.getAzimuthalAngle() }, animate);
  }

  /** Move in on one point of Makkah, keeping the compass direction. */
  focus(pos: [number, number]) {
    this.flyTo({ target: new THREE.Vector3(CITIES[0].x + pos[0], 0, CITIES[0].z + pos[1]), dist: 720, polar: 0.75, azimuth: this.controls.getAzimuthalAngle() });
  }

  zoomBy(factor: number) {
    const v = this.view();
    v.dist *= factor;
    this.flyTo(v);
  }

  rotateBy(radians: number) {
    const v = this.view();
    v.azimuth += radians;
    this.flyTo(v);
  }

  toggleTilt() {
    const v = this.view();
    const tilted = v.polar > 0.6;
    v.polar = tilted ? 0.02 : 1.0;
    this.flyTo(v);
    return !tilted;
  }

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
    this.needsRender = true;
  }

  setPins(pins: Pin[]) {
    this.pins = pins;
    this.needsRender = true;
  }

  setLabels(list: { key: string; el: HTMLElement }[]) {
    this.labels = list
      .map((l) => ({ el: l.el, def: PAPERCUT_LABELS.find((d) => d.key === l.key)! }))
      .filter((l) => l.def);
    this.needsRender = true;
  }

  // Frame loop --------------------------------------------------------------------

  private resize() {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private placeNodes(scale: number) {
    this.nodes.forEach((n, i) => {
      this.dummy.position.set(Math.cos(n.angle) * n.radius, 2.2, -Math.sin(n.angle) * n.radius);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.nodeMesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.nodeMesh.instanceMatrix.needsUpdate = true;
    this.dummy.scale.setScalar(1);
  }

  /** Work out how far each city has risen, from camera distance. */
  private updateStage() {
    const cam = this.camera.position;
    const d = CITIES.map((c) => Math.hypot(cam.x - c.x, cam.y, cam.z - c.z));
    const nearest: 0 | 1 = d[0] <= d[1] ? 0 : 1;
    const g: [number, number] = [0, 0];
    const f: [number, number] = [0, 0];
    CITIES.forEach((_, i) => {
      // Only the nearest city gets buildings; the other stays at the map.
      if (i !== nearest) return;
      g[i] = sstep(0, 1, clamp01((GROW_START - d[i]) / (GROW_START - GROW_END)));
      f[i] = sstep(0, 1, clamp01((FOOT_START - d[i]) / (FOOT_START - FOOT_FULL)));
    });
    this.growth = g;
    this.foot = f;

    const dist = this.camera.position.distanceTo(this.controls.target);
    const zoom = clamp01(1 - Math.log(dist / 250) / Math.log(MAX_DISTANCE / 250));
    const gn = g[nearest];
    const level = this.stage.loading
      ? 'Loading map'
      : gn < 0.15
        ? f[nearest] < 0.05
          ? 'Papercut map'
          : 'Footprints'
        : gn > 0.85
          ? '3D city'
          : 'Rising';
    const legend = clamp01(gn * 2 - 0.5);
    const s = this.stage;
    if (level !== s.level || nearest !== s.nearest || Math.abs(zoom - s.zoom) > 0.01 || Math.abs(legend - s.legend) > 0.04 || Math.abs(gn - s.growth) > 0.02) {
      this.stage = { loading: s.loading, nearest, zoom, growth: gn, legend, level };
      this.onStage?.(this.stage);
    }

    this.cities.forEach((c, i) => {
      const dd = d[i];
      const showFoot = f[i] > 0.01;
      c.group.visible = showFoot || dd < PATCH_START;
      c.grow.visible = showFoot;
      c.grow.scale.y = 0.03 + 0.97 * g[i];
      const bm = c.buildingMat;
      const op = Math.max(0.0, Math.min(1, f[i]));
      bm.opacity = op;
      bm.transparent = op < 1;
      c.shadowPlane.visible = g[i] > 0.02;
      (c.shadowPlane.material as THREE.ShadowMaterial).opacity = 0.3 * g[i];
      const pa = sstep(0, 1, clamp01((PATCH_START - dd) / (PATCH_START - PATCH_FULL)));
      c.patchMat.opacity = c.patchMat.map ? pa : 0;
      c.patch.visible = pa > 0.01 && !!c.patchMat.map;
      if (dd < 90000) void this.ensurePatch(i);
      if (dd < 45000) this.ensureBuildings(i);
    });

    // The sun and its shadow map follow the nearest city only.
    const act = CITIES[nearest];
    this.sun.position.set(act.x - 700, 1100, act.z + 600);
    this.sun.target.position.set(act.x, 0, act.z);

    const ng = g[0] > 0.15 ? g[0] : 0;
    this.nodeMesh.visible = ng > 0;
    if (Math.abs(ng - this.lastNodeGrowth) > 0.002) {
      this.lastNodeGrowth = ng;
      if (ng > 0) this.placeNodes(ng);
      this.needsRender = true;
    }
  }

  private updateOverlays() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const cam = this.camera.position;
    const project3 = (x: number, y: number, z: number) => {
      this.tmp.set(x, y, z).project(this.camera);
      const ok = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.2 && Math.abs(this.tmp.y) < 1.2;
      return { ok, x: (this.tmp.x * 0.5 + 0.5) * w, y: (-this.tmp.y * 0.5 + 0.5) * h };
    };
    const apply = (el: HTMLElement, alpha: number, x: number, y: number, ok: boolean) => {
      const show = ok && alpha > 0.04;
      el.style.visibility = show ? 'visible' : 'hidden';
      if (!show) return;
      el.style.opacity = alpha.toFixed(2);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    // Step pins belong to Makkah and appear with its buildings.
    const pinAlpha = clamp01(this.growth[0] * 1.6 - 0.6);
    for (const pin of this.pins) {
      const p = project3(CITIES[0].x + pin.pos[0], 26, CITIES[0].z + pin.pos[1]);
      apply(pin.el, pinAlpha, p.x, p.y, p.ok);
    }
    for (const { def, el } of this.labels) {
      const c = CITIES[def.city];
      const g = this.growth[def.city];
      let alpha = def.kind === 'region' ? clamp01(1 - g * 1.4) : clamp01(g * 1.6 - 0.6);
      if (def.maxDist && Math.hypot(cam.x - c.x, cam.y, cam.z - c.z) > def.maxDist) alpha = 0;
      const p = project3(c.x + def.pos[0], def.kind === 'region' ? 0 : 30, c.z + def.pos[1]);
      apply(el, alpha, p.x, p.y, p.ok);
    }
  }

  private measure(now: number) {
    this.fpsFrames++;
    if (!this.fpsStart) this.fpsStart = now;
    if (now - this.fpsStart < 1000) return;
    const fps = (this.fpsFrames * 1000) / (now - this.fpsStart);
    this.fpsFrames = 0;
    this.fpsStart = now;
    // Only judge while the scene is actually being redrawn every frame.
    if (this.flight || (this.nodeMesh.visible && !this.reducedMotion)) {
      this.slowSeconds = fps < 24 ? this.slowSeconds + 1 : 0;
      if (this.slowSeconds >= 3 && this.quality === 'auto') this.degrade(`${fps.toFixed(0)} fps`);
    }
    this.onFps?.(fps, this.lowDetail ? 'lower detail' : '');
  }

  private tick = (time: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (time - this.last) / 1000 || 0);
    this.last = time;

    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
      this.place({
        target: new THREE.Vector3().lerpVectors(f.from.target, f.to.target, e),
        dist: Math.exp(THREE.MathUtils.lerp(Math.log(f.from.dist), Math.log(f.to.dist), e)),
        polar: THREE.MathUtils.lerp(f.from.polar, f.to.polar, e),
        azimuth: THREE.MathUtils.lerp(f.from.azimuth, f.to.azimuth, e),
      });
      if (f.t >= 1) this.flight = null;
    }
    this.controls.update();

    // Clip planes follow the zoom so both a 1 km and a 1000 km view keep their depth precision.
    const dist = this.camera.position.distanceTo(this.controls.target);
    const near = Math.max(1, dist * 0.02);
    const far = dist * 8 + 300000;
    if (Math.abs(near - this.camera.near) > this.camera.near * 0.05) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    // Close to the horizon only makes sense when zoomed in; the map view stays near top-down.
    this.controls.maxPolarAngle = THREE.MathUtils.lerp(0.8, 1.3, clamp01(1 - Math.log(dist / 1500) / Math.log(30)));

    this.updateStage();
    if (!this.reducedMotion && this.nodeMesh.visible) {
      for (const n of this.nodes) n.angle += n.speed * dt;
      this.placeNodes(this.lastNodeGrowth);
      this.needsRender = true;
    }
    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.updateOverlays();
      this.needsRender = false;
    }
    if (this.onFps) this.measure(time);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => {
          (x as THREE.MeshBasicMaterial).map?.dispose();
          x.dispose();
        });
      }
    });
    this.renderer.dispose();
  }
}


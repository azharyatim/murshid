import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SceneTheme } from '../themes';
import { MARWA, SAFA } from '../data/steps';
import { generateSampleCity, type Box } from './sampleCity';
import { generateModelCity, terrainHeight } from './modelCity';
import {
  buildingGeometry,
  flatPolygon,
  kaabahGeometry,
  matafClearance,
  matafGeometry,
  paperBuildingGeometry,
  polylineGeometry,
  roadGeometry,
  type CityData,
  type RegionData,
} from './realCity';
import { regionXZ } from './projection';
import {
  PAPER_OWNER,
  PAPER_PLACEHOLDER,
  PAPER_STAGES,
  PAPER_TYPE_COLOUR,
  loadTerrain,
  paintPaper,
  smoothstep,
  TERRAIN_REGION_LATLON,
  worldRect,
  type TerrainGrid,
} from './papercut';

/**
 * 'plain' is the flat placeholder grid with simple lighting.
 * 'model' adds hills, an irregular city, warm light with cool shadows and
 * ambient occlusion, to read like a physical clay site model.
 */
export type Look = 'plain' | 'model' | 'cyan' | 'papercut';

/** What the Papercut interface needs to know about the zoom (see onPaperStage). */
export interface PaperStage {
  /** Camera distance to the point looked at, in metres. */
  distance: number;
  /** Camera distance to the nearest city's centre, in metres. */
  cityDistance: number;
  /** 0 = Makkah, 1 = Madinah. */
  nearest: number;
  level: 'Papercut map' | 'Footprints' | 'Rising' | '3D city';
  /** Frames drawn per second over the last second; null while the map is still (nothing to draw). */
  fps: number | null;
}

/** One city in the Papercut look: its sharper ground patch, shadow plane and rising buildings. */
interface PaperCity {
  /** Where its centre is, in scene metres. */
  centre: THREE.Vector3;
  /** Which baked terrain patch belongs to it. */
  terrainKey: 'makkah' | 'madinah';
  /** Null for a city that has no 3D buildings yet (Madinah, until stage B). */
  grow: THREE.Group | null;
  buildingMat: THREE.MeshLambertMaterial | null;
  /** Ground patches, sharpest last: the middle ring (32 km), then the city patch (8 km). */
  patches: PaperPatch[];
  shadowPlane: THREE.Mesh;
}

/** One ground patch laid over the region map, fading in as the camera comes closer. */
interface PaperPatch {
  /** Baked file and meta key, e.g. 'makkah-mid' / 'makkahMid'. */
  file: string;
  metaKey: string;
  /** Half the patch's width in metres. */
  half: number;
  /** Camera distance where it starts to fade in, and where it is fully shown. */
  start: number;
  full: number;
  /** Width of the cut-paper shadow, in texture pixels. */
  shadow: number;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  painted: boolean;
}

/**
 * Draws rows of windows on building walls inside the material's shader.
 * No extra geometry or textures are used, so the cost is close to nothing.
 * Windows fade out when they become smaller than a pixel, to avoid shimmer.
 */
function addWindows(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWin;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 winScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          float alongWall = abs(normal.x) > 0.5 ? position.z * winScale.z : position.x * winScale.x;
          float wallWidth = abs(normal.x) > 0.5 ? winScale.z : winScale.x;
          // x: metres along the wall from its centre, y: metres up, z: wall width (0 on roofs)
          vWin = vec3(alongWall, position.y * winScale.y, abs(normal.y) > 0.5 ? 0.0 : wallWidth);
        #else
          // Merged real buildings: measure along the wall in world space. No corner bands.
          vWin = vec3(dot(position.xz, vec2(-normal.z, normal.x)), position.y, abs(normal.y) > 0.5 ? 0.0 : 1000.0);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWin;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float winShade = 1.0;
        if (vWin.z > 0.0) {
          const vec2 cell = vec2(4.2, 3.6); // window spacing and floor height in metres
          vec2 g = vec2(vWin.x + vWin.z * 0.5, vWin.y - 4.5) / cell;
          vec2 f = fract(g);
          float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.8);
          // Keep a plain band at the base, the top and the corners.
          win *= step(0.0, g.y) * step(abs(vWin.x), vWin.z * 0.5 - 1.2);
          float detail = 1.0 - clamp(max(fwidth(g.x), fwidth(g.y)) * 1.6, 0.0, 1.0);
          winShade = 1.0 - 0.24 * win * detail;
          diffuseColor.rgb *= winShade;
        }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= winShade;');
  };
}

const NODE_COUNT = 150;
const MATAF_RADIUS = 68;
const MIN_DISTANCE = 160;
const MAX_DISTANCE = 2600;
/** With the regional map: far enough out to see Makkah and Madinah together. */
const MAX_DISTANCE_REGION = 1_600_000;
/** The regional map's area, in metres from its origin, that the view may be dragged across. */
// maxZ reaches the Yalamlam miqat (20.5 N), about 270 km south of the origin.
const REGION_BOUNDS = { minX: -120_000, maxX: 100_000, minZ: -210_000, maxZ: 290_000 };

const MIN_POLAR = 0.02; // straight down
const MAX_POLAR = 1.3; // close to the horizon
const AERIAL_POLAR = 0.4;
/** Papercut's opening view: camera 23 km from the ground (owner, 20 Nov 2026). */
const CITY_VIEW_DISTANCE = 23_000;
/** Texture size for each city's 32 km middle ring. */
const MID_TEX_SIZE = 3072;
const TILTED_POLAR = 1.0;
// When the map first tilts from the default north-up view, look from the north
// side (camera north of the Haram, facing south). From the south the Clock
// Towers stand in front of the Haram and hide pins; from the north every pin is clear.
const TILTED_AZIMUTH = Math.PI;

interface TawafNode {
  radius: number;
  angle: number;
  speed: number; // radians per second
}

/** An HTML element pinned to a point in the 3D scene. */
export interface Pin {
  el: HTMLElement;
  /** Metres in scene space: x = east, z = south. From the Kaabah, or from the regional origin with the regional map. */
  pos: [number, number];
  /** Shown only while the camera is at least this far from the point it looks at (metres). */
  minDist?: number;
  /** Shown only while the camera is at most this far away (metres). */
  maxDist?: number;
  /** Height in metres the pin points at: just above whatever stands there. Set by setPins. */
  y?: number;
}

/** How often, at most, to test whether buildings hide the pins (ms). Raycasting is not free. */
const OCCLUSION_INTERVAL = 150;

interface Flight {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  /** Seconds the flight takes, and whether it eases in as well as out (long city-to-city flights). */
  duration: number;
  easeInOut: boolean;
}

/**
 * The white-clay city scene: a placeholder city around a simplified massing
 * of Masjid al-Haram. The camera can be zoomed, rotated, tilted and panned.
 */
export class CityScene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 10, 6000);
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private sky = new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.2);
  private mats = {
    ground: new THREE.MeshStandardMaterial({ roughness: 1 }),
    slab: new THREE.MeshStandardMaterial({ roughness: 1 }),
    building: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    haram: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    kaabah: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    node: new THREE.MeshBasicMaterial(),
    road: new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide }),
    sea: new THREE.MeshStandardMaterial({ roughness: 1 }),
    regionRoad: new THREE.LineBasicMaterial(),
    rail: new THREE.LineDashedMaterial({ dashSize: 1, gapSize: 1 }),
  };
  /** Everything belonging to Makkah's 3D city. Placed at Makkah's position on the regional map. */
  private makkah = new THREE.Group();
  private region: RegionData | null = null;
  private sunOffset = new THREE.Vector3(-520, 720, 380);
  /** The Papercut look (?look=papercut). Null for every other look. */
  private paper: {
    cities: PaperCity[];
    meta: ({ region: TerrainGrid } & Record<string, { x: number; z: number; half: number; n: number }>) | null;
    texSize: number;
    /** 0..1: how far the nearest city's buildings have risen. */
    growth: number;
    /** 0..1: how far the nearest city's footprints have faded in. */
    foot: number;
    nearest: number;
    nodeScale: number;
    legend: HTMLElement | null;
    /** Frames drawn in the current second, for the temporary readout. */
    frames: number;
    frameStart: number;
    fps: number | null;
    lastReport: number;
    /** Loading: ground images still being painted, and whether the region map is in. */
    pending: number;
    /** Ground patches asked for so far. */
    started: number;
    regionDone: boolean;
  } | null = null;
  /** Papercut: called a few times a second with the zoom stage, for the jump buttons and the readout. */
  onPaperStage: ((s: PaperStage) => void) | null = null;
  /** Called once, when the map the opening view needs has been drawn (Papercut: its ground images). */
  onReady: (() => void) | null = null;
  private readyFired = false;
  private settleUntil = 0;
  private lastSharpCheck = 0;
  /** Highest pixel density drawn (Papercut phones: 1.75, to keep the frame rate up). */
  private ratioCap = 2;
  /** On-screen arrows pointing to places that are off screen (the Makkah and Madinah arrows). */
  private pointers: { el: HTMLElement; pos: [number, number] }[] = [];
  /**
   * Flat layers lying on the ground (sea, streets, road lines), each lifted a
   * little more than the one below. The lift grows with viewing distance: far
   * out, layers a few centimetres apart cannot be told apart by the depth
   * buffer and flicker ("z-fighting").
   */
  private flatLayers: { obj: THREE.Object3D; level: number }[] = [];
  /** Turns world positions into the sun's view and back, to keep shadows steady while the view moves. */
  private sunRotation = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(520, -720, -380), new THREE.Vector3(0, 1, 0));
  private sunRotationInverse = this.sunRotation.clone().invert();
  private nodes: TawafNode[] = [];
  private nodeMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private pins: Pin[] = [];
  private overview: { center: THREE.Vector3; radius: number; box: THREE.Box3 };
  private flight: Flight | null = null;
  private raf = 0;
  private last = 0;
  private needsRender = true;
  private reducedMotion: boolean;
  private resizeObserver: ResizeObserver;
  private tmp = new THREE.Vector3();
  /** Meshes that can hide a pin: buildings, the Haram, the Kaabah and hills. */
  private occluders: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private lastCamera = new THREE.Matrix4();
  private occlusionDirty = true;
  private lastOcclusion = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    theme: SceneTheme,
    reducedMotion: boolean,
    /** Points that the default aerial view must keep in frame. */
    overviewPoints: [number, number][],
    private look: Look = 'plain',
    /** Real OpenStreetMap city. When given, it replaces the illustrative city and Haram. */
    city: CityData | null = null,
    /**
     * The regional map, with Madinah's 3D city. When given, the scene covers both
     * cities: positions (pins, overview points) are then in regional metres.
     */
    regional: { region: RegionData; madinah: CityData | null } | null = null,
  ) {
    this.reducedMotion = reducedMotion;
    const paper = look === 'papercut' && Boolean(city && regional);
    const model = look !== 'plain' && look !== 'papercut';
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Papercut is tuned for phones: pixel ratio capped at 1.75 there, 2 on larger screens.
    this.ratioCap = paper && small ? 1.75 : 2;
    this.renderer.setPixelRatio(this.wantedRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = paper ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (model) {
      // Ambient occlusion darkens corners and the foot of each building.
      const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const ao = new GTAOPass(this.scene, this.camera, 1, 1);
      ao.blendIntensity = 0.8;
      ao.updateGtaoMaterial({ radius: 14, distanceExponent: 1.6, thickness: 1.5, scale: 1, samples: small ? 8 : 16 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: small ? 8 : 16 });
      this.composer.addPass(ao);
      this.composer.addPass(new OutputPass());
    }

    // Lighting: one soft sun plus sky fill gives the clay-model look.
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    this.scene.add(this.sun.target);
    // Papercut: a 1536 (phone) or 2048 shadow map covering only the active city.
    const size = paper ? (small ? 1536 : 2048) : model ? (small ? 2048 : 4096) : small ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    const reach = paper ? 1100 : model ? 1700 : 1250;
    sc.left = -reach;
    sc.right = reach;
    sc.top = reach;
    sc.bottom = -reach;
    sc.near = 100;
    sc.far = 2800;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.2;
    this.scene.add(this.sun, this.sky);

    this.scene.add(this.makkah);
    // Ground (roads and open space).
    if (city && regional && paper) {
      this.region = regional.region;
      this.makkah.position.set(...this.cityOffset(city));
      this.setupPaper(city, regional.madinah, small);
    } else if (city) {
      this.mats.building.vertexColors = true;
      if (look === 'cyan') addWindows(this.mats.building);
      if (regional) {
        this.region = regional.region;
        this.buildRegion(regional.region);
        this.makkah.position.set(...this.cityOffset(city));
      } else {
        // Real map data sits on flat ground: there is no real terrain yet.
        const ground = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), this.mats.ground);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.makkah.add(ground);
      }
      this.buildCity(city, this.makkah, theme);
      if (regional?.madinah) {
        const madinah = new THREE.Group();
        madinah.position.set(...this.cityOffset(regional.madinah));
        this.buildCity(regional.madinah, madinah, theme);
        this.scene.add(madinah);
      }
    } else if (model) {
      this.scene.add(this.buildTerrain());
      this.mats.building.vertexColors = true;
      if (look === 'cyan') addWindows(this.mats.building);
      this.scene.add(this.boxes(generateModelCity(), this.mats.building, true, theme.baseShade ?? 0.8));
    } else {
      const ground = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), this.mats.ground);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);
      const city = generateSampleCity();
      this.scene.add(this.boxes(city.slabs, this.mats.slab, false));
      this.scene.add(this.boxes(city.buildings, this.mats.building, true));
    }
    if (!city) this.buildHaram();

    // The Kaabah: simple massing, the only dark object in the scene. With real
    // data it is the OpenStreetMap footprint; otherwise a placeholder cube.
    const kaabahGeo = city ? kaabahGeometry(city) : null;
    const kaabah = kaabahGeo
      ? new THREE.Mesh(kaabahGeo, this.mats.kaabah)
      : new THREE.Mesh(new THREE.BoxGeometry(11, 13, 12.5), this.mats.kaabah);
    if (!city) {
      kaabah.position.y = 6.5;
      kaabah.rotation.y = 0.5;
    }
    kaabah.castShadow = true;
    // Papercut: the Kaabah rises with the city's buildings.
    (this.paper?.cities[0].grow ?? this.makkah).add(kaabah);

    // Travelling nodes circling the Kaabah anticlockwise.
    this.nodeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 10, 8), this.mats.node, NODE_COUNT);
    let seed = 3;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // Keep the circling nodes inside the open courtyard.
    const clearance = city ? matafClearance(city) : null;
    const maxRadius = clearance ? Math.min(61, clearance - 4) : 61;
    for (let i = 0; i < NODE_COUNT; i++) {
      const radius = 13 + Math.pow(rnd(), 1.4) * (maxRadius - 13);
      this.nodes.push({ radius, angle: rnd() * Math.PI * 2, speed: (5.5 + rnd() * 2) / radius });
    }
    this.placeNodes();
    this.makkah.add(this.nodeMesh);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.castShadow && o !== this.nodeMesh) this.occluders.push(o);
    });

    // Frame for the default aerial view.
    const box = new THREE.Box3();
    overviewPoints.forEach(([x, z]) => box.expandByPoint(new THREE.Vector3(x, 0, z)));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.overview = { center: sphere.center, radius: sphere.radius, box };

    // Map-style gestures, at the owner's request: one finger drags the map. Two
    // fingers are handled by setupTwoFingerGestures (below): pinch to zoom, twist
    // to rotate, slide up or down together to tilt, each locked for the gesture.
    // A mouse drags with the left button, rotates and tilts with the right, and
    // the wheel zooms towards the pointer.
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = this.region ? MAX_DISTANCE_REGION : MAX_DISTANCE;
    // Pinching stays at 1:1 with the fingers (zoomSpeed 1), so the place under them stays under them.
    this.controls.minPolarAngle = MIN_POLAR;
    this.controls.maxPolarAngle = MAX_POLAR;
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: null };
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    // Drag across the ground, not across the screen, so tilted views slide like a map.
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('change', () => {
      // Keep the view from being dragged away from the mapped area.
      const t = this.controls.target;
      if (this.region) {
        // Papercut's elevation reaches 38 E, so its map can be dragged further west (to Badr's coast).
        t.x = THREE.MathUtils.clamp(t.x, this.paper ? -180_000 : REGION_BOUNDS.minX, REGION_BOUNDS.maxX);
        t.z = THREE.MathUtils.clamp(t.z, REGION_BOUNDS.minZ, REGION_BOUNDS.maxZ);
      } else {
        const d = Math.hypot(t.x, t.z);
        if (d > 700) {
          t.x *= 700 / d;
          t.z *= 700 / d;
        }
      }
      t.y = 0;
      this.needsRender = true;
    });
    this.controls.addEventListener('start', () => (this.flight = null));
    this.setupTwoFingerGestures();

    this.setTheme(theme);
    this.resize();
    // Papercut opens at twice the zoom; App flies it back to the opening view once the map is ready.
    if (this.paper) this.cityView(0, false, 0, this.reducedMotion ? 1 : 2);
    else this.showAll(false);
    if (!this.paper) this.markReady();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.raf = requestAnimationFrame(this.tick);
  }

  /**
   * Two-finger gestures with locking. For the first few millimetres the gesture
   * is undecided; it then becomes a pinch (fingers apart or together: zoom, and
   * the pair can also drag), a twist (fingers turning: rotate) or a tilt (both
   * fingers sliding up or down together), and stays that until the fingers lift.
   * So drift during a pinch can no longer turn or tilt the map by accident.
   * Pinch and twist keep the ground point between the fingers under the fingers.
   */
  private setupTwoFingerGestures() {
    const el = this.canvas;
    const touches = new Map<number, { x: number; y: number }>();
    type Mode = 'undecided' | 'pinch' | 'twist' | 'tilt';
    let mode: Mode = 'undecided';
    let start: { dist: number; angle: number; a: { x: number; y: number }; b: { x: number; y: number } } | null = null;
    let prev: { dist: number; angle: number; mid: { x: number; y: number } } | null = null;

    const pair = () => {
      const [a, b] = [...touches.values()];
      return {
        a,
        b,
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };
    const angleDiff = (x: number, y: number) => Math.atan2(Math.sin(x - y), Math.cos(x - y));

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const p = pair();
        start = { dist: p.dist, angle: p.angle, a: { ...p.a }, b: { ...p.b } };
        prev = { dist: p.dist, angle: p.angle, mid: p.mid };
        mode = 'undecided';
        this.flight = null;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || !start || !prev) return;
      const p = pair();
      if (mode === 'undecided') {
        const scale = Math.abs(Math.log(p.dist / start.dist));
        const turn = Math.abs(angleDiff(p.angle, start.angle));
        const dyA = p.a.y - start.a.y;
        const dyB = p.b.y - start.b.y;
        const together = Math.sign(dyA) === Math.sign(dyB) && Math.min(Math.abs(dyA), Math.abs(dyB)) > 18;
        if (together && scale < 0.1 && turn < 0.12) mode = 'tilt';
        else if (turn > 0.17) mode = 'twist'; // about 10 degrees
        else if (scale > 0.08) mode = 'pinch'; // about 8% closer or further apart
        else if (Math.hypot(p.mid.x - prev.mid.x, p.mid.y - prev.mid.y) > 0 && scale < 0.03 && turn < 0.05 && !together) {
          // Both fingers moving sideways together with no pinch or twist: treat as a drag.
          const da = Math.hypot(p.a.x - start.a.x, p.a.y - start.a.y);
          if (da > 24) mode = 'pinch';
        }
        if (mode === 'undecided') return;
        prev = { dist: p.dist, angle: p.angle, mid: p.mid };
        return;
      }
      this.camera.updateMatrixWorld();
      const anchor = this.groundAt(prev.mid.x, prev.mid.y);
      const offset = this.camera.position.clone().sub(this.controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      if (mode === 'pinch') {
        sph.radius = THREE.MathUtils.clamp((sph.radius * prev.dist) / p.dist, this.controls.minDistance, this.controls.maxDistance);
      } else if (mode === 'twist') {
        // Turn the map the same way the fingers turn (screen angles grow clockwise,
        // and a clockwise map turn moves the camera the other way round the target).
        sph.theta += angleDiff(p.angle, prev.angle);
      } else {
        // Sliding up tilts towards the horizon, sliding down looks straight down.
        sph.phi = THREE.MathUtils.clamp(sph.phi - ((p.mid.y - prev.mid.y) / el.clientHeight) * Math.PI * 0.9, MIN_POLAR, MAX_POLAR);
      }
      sph.makeSafe();
      this.camera.position.copy(this.controls.target).add(offset.setFromSpherical(sph));
      this.camera.lookAt(this.controls.target);
      this.camera.updateMatrixWorld();
      if (mode !== 'tilt' && anchor) {
        // Keep the ground point that was between the fingers under the fingers now.
        const now = this.groundAt(p.mid.x, p.mid.y);
        if (now) {
          const shift = anchor.sub(now);
          shift.y = 0;
          this.controls.target.add(shift);
          this.camera.position.add(shift);
          // Refresh the camera now, or the next finger movement measures from a stale view and the map drifts.
          this.camera.updateMatrixWorld();
        }
      }
      prev = { dist: p.dist, angle: p.angle, mid: p.mid };
      this.needsRender = true;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.delete(e.pointerId);
      if (touches.size < 2) {
        start = null;
        prev = null;
        mode = 'undecided';
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** The point on the ground under a screen position, or null if that point looks above the horizon. */
  private groundAt(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.far = Infinity;
    return this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
  }

  // Papercut ------------------------------------------------------------------

  /**
   * The Papercut look: a contour map of real elevation in flat paper layers.
   * Zooming in towards Makkah first fades in a sharper ground patch, then the
   * real OpenStreetMap footprints as flat cut-outs, then raises them into 3D
   * (3% to 100% height). See PAPER_STAGES for the distances.
   */
  private setupPaper(makkah: CityData, madinah: CityData | null, small: boolean) {
    this.paper = {
      cities: [],
      meta: null,
      texSize: small ? 1536 : 2048,
      growth: 0,
      foot: 0,
      nearest: 0,
      nodeScale: -1,
      legend: null,
      frames: 0,
      frameStart: 0,
      fps: null,
      lastReport: 0,
      pending: 0,
      started: 0,
      regionDone: false,
    };
    const make = (c: CityData, key: 'makkah' | 'madinah', root: THREE.Group, withBuildings: boolean) => {
      const S = PAPER_STAGES;
      // The middle ring sits under the sharp city patch; both fade in as the camera nears.
      const patches = (
        [
          { file: `${key}-mid`, metaKey: `${key}Mid`, half: 16000, start: S.midStart, full: S.midFull, shadow: 3, order: 0.5, level: 0.5 },
          { file: key, metaKey: key, half: 4000, start: S.patchStart, full: S.patchFull, shadow: 5, order: 1, level: 1 },
        ] as const
      ).map((d) => {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.half * 2, d.half * 2), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = d.order;
        mesh.visible = false;
        root.add(mesh);
        this.flatLayers.push({ obj: mesh, level: d.level });
        return { file: d.file, metaKey: d.metaKey, half: d.half, start: d.start, full: d.full, shadow: d.shadow, mesh, mat, painted: false };
      });
      // Shadow-only plane: the ground stays its exact colours, buildings still cast soft shadows.
      const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.ShadowMaterial({ opacity: 0 }));
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.receiveShadow = true;
      shadowPlane.renderOrder = 2;
      shadowPlane.visible = false;
      root.add(shadowPlane);
      this.flatLayers.push({ obj: shadowPlane, level: 2 });
      let grow: THREE.Group | null = null;
      let buildingMat: THREE.MeshLambertMaterial | null = null;
      if (withBuildings) {
        grow = new THREE.Group();
        grow.visible = false;
        root.add(grow);
        // Lift the buildings just above the ground patch and shadow plane, so flat
        // footprints (3% height, under half a metre for a low mosque) are never hidden by them.
        this.flatLayers.push({ obj: grow, level: 3 });
        // One flat colour per building, by type; the mosque in the mosque colour.
        buildingMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0 });
        // The Green Dome (Madinah) is mapped as a 6 m shape inside the mosque's 13 m
        // outline, so it is set on the roof: base at the mosque's mapped height.
        const roof = Math.max(0, ...c.buildings.filter((b) => b.kind === 'haram' && b.h < 40).map((b) => b.h));
        const geo = paperBuildingGeometry(
          c,
          (b) => (b.dome ? PAPER_PLACEHOLDER.greenDome : b.kind === 'haram' ? PAPER_OWNER.mosque : PAPER_TYPE_COLOUR[b.c ?? 'o']),
          (b) => (b.dome ? [roof, roof + b.h] : null),
        );
        if (geo) {
          const mesh = new THREE.Mesh(geo, buildingMat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          grow.add(mesh);
        }
        const mataf = matafGeometry(c);
        if (mataf) {
          // The open Mataf floor takes the homes colour, as the owner chose.
          const floor = new THREE.Mesh(mataf, new THREE.MeshLambertMaterial({ color: PAPER_OWNER.home }));
          floor.receiveShadow = true;
          grow.add(floor);
        }
      }
      const centre = new THREE.Vector3(...this.cityOffset(c));
      this.paper!.cities.push({ centre, terrainKey: key, grow, buildingMat, patches, shadowPlane });
    };
    make(makkah, 'makkah', this.makkah, true);
    if (madinah) {
      const g = new THREE.Group();
      g.position.set(...this.cityOffset(madinah));
      this.scene.add(g);
      make(madinah, 'madinah', g, true);
    }
    // Let the first frame show before the heavy painting starts.
    setTimeout(() => void this.loadPaperRegion(), 30);
  }

  private async loadPaperRegion() {
    const p = this.paper!;
    const url = (f: string) => `${import.meta.env.BASE_URL}data/${f}`;
    try {
      const heightsLoad = loadTerrain(url('terrain-region.png'));
      // The small meta file first: with it, the city's own ground patches can start
      // loading while the large region image is still on its way.
      const meta = await fetch(url('terrain-meta.json')).then((r) => r.json());
      p.meta = meta;
      this.needsRender = true;
      const heights = await heightsLoad;
      const rect = worldRect(meta.region.latlon ?? TERRAIN_REGION_LATLON);
      const max = this.renderer.capabilities.maxTextureSize;
      const th = Math.min(meta.region.nz, max);
      const tw = Math.min(max, Math.round((th * (rect.x1 - rect.x0)) / (rect.z1 - rect.z0)));
      const cv = await paintPaper(heights, meta.region, rect, tw, th, 2, false);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(rect.x1 - rect.x0, rect.z1 - rect.z0),
        new THREE.MeshBasicMaterial({ map: this.paperTexture(cv), toneMapped: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((rect.x0 + rect.x1) / 2, 0, (rect.z0 + rect.z1) / 2);
      this.scene.add(mesh);
      this.needsRender = true;
    } catch (e) {
      console.error('Could not load the terrain', e);
    }
    p.regionDone = true;
  }

  private paperTexture(cv: HTMLCanvasElement) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // Free the painted image once the graphics card has its own copy.
    tex.onUpdate = () => {
      cv.width = cv.height = 1;
      tex.onUpdate = () => {};
    };
    return tex;
  }

  /** Paints one ground patch of a city the first time the camera gets near it. */
  private async ensurePatch(c: PaperCity, pt: PaperPatch) {
    const p = this.paper!;
    const m = p.meta?.[pt.metaKey];
    if (pt.painted || !m) return;
    pt.painted = true;
    p.started++;
    p.pending++;
    try {
      await this.paintPatch(c, pt, m);
    } catch (e) {
      console.error('Could not load a ground patch', e);
    }
    p.pending--;
    this.needsRender = true;
  }

  private async paintPatch(c: PaperCity, pt: PaperPatch, m: { x: number; z: number; half: number; n: number }) {
    const p = this.paper!;
    const heights = await loadTerrain(`${import.meta.env.BASE_URL}data/terrain-${pt.file}.png`);
    const grid: TerrainGrid = { x: m.x - m.half, z: m.z - m.half, w: m.half * 2, h: m.half * 2, nx: m.n, nz: m.n };
    // The middle ring fills most of the opening 23 km view, so it gets a finer image:
    // 3072 px over 32 km (about 10 m per pixel, finer than the screen shows it), where
    // 1536 px left its contour edges soft and stepped (owner, 20 Nov 2026).
    const want = pt.half > 4000 ? MID_TEX_SIZE : p.texSize;
    const size = Math.min(want, this.renderer.capabilities.maxTextureSize);
    // Keep the paper's drop shadow the same width on the ground at the larger size.
    const shadow = Math.max(1, Math.round((pt.shadow * size) / p.texSize));
    const h = pt.half;
    const world = { x0: c.centre.x - h, x1: c.centre.x + h, z0: c.centre.z - h, z1: c.centre.z + h };
    const cv = await paintPaper(heights, grid, world, size, size, shadow, true);
    pt.mat.map = this.paperTexture(cv);
    pt.mat.needsUpdate = true;
    this.needsRender = true;
  }

  /** Works out each stage from the camera's distance to the cities. Smooth, never a hard switch. */
  private updatePaper() {
    const p = this.paper!;
    const cam = this.camera.position;
    const d = p.cities.map((c) => cam.distanceTo(c.centre));
    const nearest = d.indexOf(Math.min(...d));
    const S = PAPER_STAGES;
    p.cities.forEach((c, i) => {
      // Only the nearest city gets buildings; the other stays a map.
      const g = i === nearest ? smoothstep(S.growStart, S.growEnd, d[i]) : 0;
      const f = i === nearest ? smoothstep(S.footStart, S.footFull, d[i]) : 0;
      if (c.grow && c.buildingMat) {
        c.grow.visible = f > 0.01;
        c.grow.scale.y = 0.03 + 0.97 * g;
        c.buildingMat.opacity = f;
        c.buildingMat.transparent = f < 0.999;
        c.buildingMat.depthWrite = f > 0.5;
      }
      c.shadowPlane.visible = g > 0.02;
      (c.shadowPlane.material as THREE.ShadowMaterial).opacity = 0.3 * g;
      for (const pt of c.patches) {
        const pa = smoothstep(pt.start, pt.full, d[i]);
        pt.mat.opacity = pt.mat.map ? pa : 0;
        pt.mesh.visible = pa > 0.01 && Boolean(pt.mat.map);
        if (d[i] < pt.start * 1.2) void this.ensurePatch(c, pt);
      }
      if (i === 0) p.growth = g; // nodes and step pins belong to Makkah
      if (i === nearest) p.foot = f;
    });
    p.nearest = nearest;
    const gn = smoothstep(S.growStart, S.growEnd, d[nearest]);
    const now = performance.now();
    if (this.onPaperStage && now - p.lastReport > 250) {
      p.lastReport = now;
      this.onPaperStage({
        distance: this.distance(),
        cityDistance: d[nearest],
        nearest,
        level: gn > 0.85 ? '3D city' : gn > 0.15 ? 'Rising' : p.foot > 0.05 ? 'Footprints' : 'Papercut map',
        fps: p.fps,
      });
    }
    // The sun and its shadow map follow the nearest city only.
    const act = p.cities[nearest].centre;
    this.sun.target.position.copy(act);
    this.sun.position.copy(act).add(this.sunOffset);
    // Travelling nodes appear once Makkah's buildings are mostly up.
    const ns = p.growth > 0.15 ? p.growth : 0;
    this.nodeMesh.visible = ns > 0;
    if (Math.abs(ns - p.nodeScale) > 0.002) {
      p.nodeScale = ns;
      this.needsRender = true;
    }
    if (p.legend) {
      // The key appears with whichever city is rising.
      const a = Math.min(1, Math.max(0, gn * 2 - 0.5));
      p.legend.style.opacity = a.toFixed(2);
      p.legend.style.visibility = a > 0.04 ? 'visible' : 'hidden';
    }
    // Ready once every ground patch this view asked for is painted. The opening view sits
    // inside Makkah's 32 km ring, so it does not wait for the large region image
    // (unless that finished, or failed, first).
    if (!this.readyFired && p.pending === 0 && (p.started > 0 || p.regionDone)) this.markReady();
  }

  private markReady() {
    this.readyFired = true;
    this.needsRender = true;
    this.settleUntil = performance.now() + 1500;
    // Let the finished frame reach the screen before the loading screen goes.
    requestAnimationFrame(() => this.onReady?.());
  }

  /**
   * Frames drawn per second, for the temporary readout. Only counted while the
   * scene redraws every frame (moving, or nodes animating); a still map draws
   * nothing, so it reports null rather than a misleading low number.
   */
  private countFrame(time: number, drawing: boolean) {
    const p = this.paper!;
    if (!p.frameStart) p.frameStart = time;
    if (drawing) p.frames++;
    if (time - p.frameStart >= 1000) {
      const rate = (p.frames * 1000) / (time - p.frameStart);
      p.fps = p.frames >= 3 ? Math.round(rate) : null;
      p.frames = 0;
      p.frameStart = time;
    }
  }

  /** Papercut: jump to the region, or into a city's 3D view (0 = Makkah, 1 = Madinah). */
  jumpTo(target: 'region' | 0 | 1) {
    if (!this.paper || target === 'region') return this.showAll();
    this.cityView(target);
  }

  /**
   * Papercut's opening view of a city (owner, 20 Nov 2026): straight down, north up,
   * 23 km out, with the city's mosque centred across and two thirds of the way down the screen.
   */
  cityView(index: 0 | 1, animate = true, duration = 0.6, zoom = 1) {
    const c = this.paper?.cities[index];
    if (!c) return this.showAll(animate);
    // zoom 2 = twice as close (the page opens there, then settles back; owner, 20 Nov 2026).
    const dist = CITY_VIEW_DISTANCE / zoom;
    const visible = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // The screen's centre is north of the mosque by a sixth of the visible height.
    const target = c.centre.clone();
    target.z -= (2 / 3 - 1 / 2) * visible;
    // Centred across the width (owner, 20 Nov 2026; this replaced a nudge east for the Jabal al-Nur label).
    this.flyTo(target, dist, AERIAL_POLAR, 0, animate, duration);
  }

  /** Shows each `el` at the screen edge, pointing towards its `pos`, whenever that is off screen. */
  setPointers(pointers: { el: HTMLElement | null; pos: [number, number] }[]) {
    this.pointers = pointers.filter((p): p is { el: HTMLElement; pos: [number, number] } => Boolean(p.el));
    this.needsRender = true;
  }

  private updatePointer(ptr: { el: HTMLElement; pos: [number, number] }, w: number, h: number) {
    const v = this.tmp.set(ptr.pos[0], 0, ptr.pos[1]).project(this.camera);
    const onScreen = v.z < 1 && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9;
    if (onScreen) {
      ptr.el.style.visibility = 'hidden';
      return;
    }
    // Screen direction: from the point looked at (the screen centre) towards a point a
    // little way along the ground to the target. Works when the map is tilted too.
    const t = this.controls.target;
    const dx = ptr.pos[0] - t.x;
    const dz = ptr.pos[1] - t.z;
    const len = Math.hypot(dx, dz) || 1;
    const step = this.distance() * 0.05;
    const a = this.tmp.set(t.x + (dx / len) * step, 0, t.z + (dz / len) * step).project(this.camera);
    let sx = a.x * w * 0.5;
    let sy = -a.y * h * 0.5;
    const n = Math.hypot(sx, sy) || 1;
    sx /= n;
    sy /= n;
    // The arrow's point, kept inside the screen: room for its label (below and to the
    // right), clear of the map buttons (right) and the key and notice (bottom).
    const box = { left: 28, right: w - 96, top: 40, bottom: h - 140 };
    const cx = w / 2;
    const cy = h / 2;
    const k = Math.min(
      sx > 0 ? (box.right - cx) / sx : sx < 0 ? (box.left - cx) / sx : Infinity,
      sy > 0 ? (box.bottom - cy) / sy : sy < 0 ? (box.top - cy) / sy : Infinity,
    );
    const x = cx + sx * k;
    const y = cy + sy * k;
    ptr.el.style.visibility = 'visible';
    ptr.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    ptr.el.style.setProperty('--angle', `${Math.atan2(sy, sx).toFixed(3)}rad`);
  }

  /** Papercut: the colour legend, shown as the buildings rise. */
  setLegend(el: HTMLElement | null) {
    if (this.paper) this.paper.legend = el;
    this.needsRender = true;
  }

  /** Where a city's local origin sits on the regional map. */
  private cityOffset(c: CityData): [number, number, number] {
    const [x, z] = regionXZ(c.origin.lat, c.origin.lon);
    return [x, 0, z];
  }

  /** One real city: roads, buildings, the mosque and (Makkah only) the mataf floor. */
  private buildCity(c: CityData, root: THREE.Object3D, theme: SceneTheme) {
    const roads = new THREE.Mesh(roadGeometry(c), this.mats.road);
    roads.receiveShadow = true;
    root.add(roads);
    this.flatLayers.push({ obj: roads, level: 2 });
    const addMerged = (geo: THREE.BufferGeometry | null, mat: THREE.Material) => {
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    };
    // Shade canopies ('roof') take the building colour, so the Haram's colour is used for the mosque only.
    addMerged(buildingGeometry(c, ['building', 'roof'], theme.baseShade ?? 0.8), this.mats.building);
    addMerged(buildingGeometry(c, ['haram']), this.mats.haram);
    addMerged(matafGeometry(c), this.mats.haram);
  }

  /** The regional map: flat ground, the sea, main roads and the railway. */
  private buildRegion(r: RegionData) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2_000_000, 2_000_000), this.mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    if (r.sea) {
      const sea = new THREE.Mesh(flatPolygon(r.sea, 0.05), this.mats.sea);
      sea.receiveShadow = true;
      this.scene.add(sea);
      this.flatLayers.push({ obj: sea, level: 1 });
      r.islands.forEach((ring) => {
        const island = new THREE.Mesh(flatPolygon(ring, 0.08), this.mats.ground);
        this.scene.add(island);
        this.flatLayers.push({ obj: island, level: 1.5 });
      });
    }
    // Main roads and the railway as thin lines, so they stay visible from far away.
    const roads = new THREE.LineSegments(polylineGeometry(r.roads.map((x) => x.pts), 0.5), this.mats.regionRoad);
    this.scene.add(roads);
    this.flatLayers.push({ obj: roads, level: 3 });
    const rail = new THREE.LineSegments(polylineGeometry(r.rail, 0.6), this.mats.rail);
    rail.computeLineDistances();
    this.scene.add(rail);
    this.flatLayers.push({ obj: rail, level: 4 });
  }

  /** Hills in stacked contour layers, like a cut-card site model. Illustrative only. */
  private buildTerrain() {
    const size = 5200;
    const seg = 360;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.mats.ground);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  private boxes(list: Box[], material: THREE.Material, castShadow: boolean, baseShade?: number) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    if (baseShade !== undefined) {
      // Slightly darker towards the base, a cheap stand-in for bounced light.
      const p = geo.attributes.position;
      const colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) colors.fill(p.getY(i) > 0.5 ? 1 : baseShade, i * 3, i * 3 + 3);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((b, i) => {
      this.dummy.position.set(b.x, b.y ?? 0, b.z);
      this.dummy.rotation.set(0, -b.rot, 0);
      this.dummy.scale.set(b.w, b.h, b.d);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    });
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.dummy.scale.set(1, 1, 1);
    this.dummy.rotation.set(0, 0, 0);
    return mesh;
  }

  /**
   * Respectful simplified massing: a low ring around the open mataf and a
   * long gallery for the Mas'a between Safa and Marwa. Placeholder shapes.
   */
  private buildHaram() {
    const ring = (outer: number, inner: number, sides: number) => {
      const shape = new THREE.Shape();
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
        const x = Math.cos(a) * outer;
        const y = Math.sin(a) * outer;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      const hole = new THREE.Path();
      hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      return shape;
    };
    const tiers: [number, number, number][] = [
      [230, MATAF_RADIUS, 15],
      [214, MATAF_RADIUS + 12, 22],
    ];
    tiers.forEach(([outer, inner, depth]) => {
      const geo = new THREE.ExtrudeGeometry(ring(outer, inner, 8), { depth, bevelEnabled: false, curveSegments: 48 });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.mats.haram);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(MATAF_RADIUS + 1, 64), this.mats.haram);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.4;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Mas'a gallery from Safa to Marwa.
    const dx = MARWA[0] - SAFA[0];
    const dz = MARWA[1] - SAFA[1];
    const length = Math.hypot(dx, dz) + 40;
    const masa = new THREE.Mesh(new THREE.BoxGeometry(40, 25, length), this.mats.haram);
    masa.position.set((SAFA[0] + MARWA[0]) / 2, 12.5, (SAFA[1] + MARWA[1]) / 2);
    masa.rotation.y = Math.atan2(dx, dz);
    masa.castShadow = true;
    masa.receiveShadow = true;
    this.scene.add(masa);

    const minaretGeo = new THREE.CylinderGeometry(3.2, 4.2, 88, 10);
    minaretGeo.translate(0, 44, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const m = new THREE.Mesh(minaretGeo, this.mats.haram);
      m.position.set(Math.cos(a) * 222, 0, Math.sin(a) * 222);
      m.castShadow = true;
      this.scene.add(m);
    }
  }

  private placeNodes() {
    // Papercut: nodes grow in with the buildings.
    const scale = this.paper ? Math.max(0.001, this.paper.nodeScale) : 1;
    this.nodes.forEach((n, i) => {
      this.dummy.position.set(Math.cos(n.angle) * n.radius, 2.2, -Math.sin(n.angle) * n.radius);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.nodeMesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.nodeMesh.instanceMatrix.needsUpdate = true;
    this.dummy.scale.setScalar(1);
  }

  setTheme(t: SceneTheme) {
    this.scene.background = new THREE.Color(t.background);
    // Papercut keeps exact paper colours at every distance, so no fog.
    this.scene.fog = this.paper ? null : new THREE.Fog(t.background, 1900, 4200);
    this.mats.ground.color.set(t.ground);
    this.mats.road.color.set(t.road ?? t.slab);
    this.mats.sea.color.set(t.sea ?? t.background);
    this.mats.regionRoad.color.set(t.road ?? t.slab);
    this.mats.rail.color.set(t.rail ?? t.road ?? t.slab);
    this.mats.slab.color.set(t.slab);
    this.mats.building.color.set(t.building);
    if (t.buildingEmissive !== undefined) this.mats.building.emissive.set(t.buildingEmissive);
    else this.mats.building.emissive.set(t.building).multiplyScalar(t.buildingGlow ?? 0);
    this.mats.haram.color.set(t.haram);
    this.mats.kaabah.color.set(t.kaabah);
    this.mats.node.color.set(t.node);
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunIntensity;
    this.sun.shadow.intensity = t.shadowStrength ?? 1;
    this.sky.color.set(t.sky);
    this.sky.groundColor.set(t.skyGround);
    this.sky.intensity = t.skyIntensity;
    this.needsRender = true;
  }

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
    this.needsRender = true;
  }

  setPins(pins: Pin[]) {
    // Point each pin just above the top of whatever stands at its position
    // (Papercut: measured with the buildings at full height).
    const grows = this.paper?.cities.map((c) => c.grow).filter((g): g is THREE.Group => !!g) ?? [];
    const saved = grows.map((g) => [g.scale.y, g.visible] as const);
    grows.forEach((g) => {
      g.scale.y = 1;
      g.visible = true;
    });
    this.scene.updateMatrixWorld();
    for (const pin of pins) {
      this.raycaster.set(this.tmp.set(pin.pos[0], 3000, pin.pos[1]), new THREE.Vector3(0, -1, 0));
      this.raycaster.far = Infinity;
      const top = this.raycaster.intersectObjects(this.occluders, false)[0]?.point.y ?? 0;
      pin.y = Math.max(26, top + 3);
    }
    grows.forEach((g, i) => {
      g.scale.y = saved[i][0];
      g.visible = saved[i][1];
    });
    this.scene.updateMatrixWorld();
    this.pins = pins;
    this.occlusionDirty = true;
    this.needsRender = true;
  }

  // Camera moves ------------------------------------------------------------

  private flyTo(target: THREE.Vector3, distance: number, polar: number, azimuth: number, animate = true, duration = 0.6) {
    const d = THREE.MathUtils.clamp(distance, MIN_DISTANCE, this.controls.maxDistance);
    const p = THREE.MathUtils.clamp(polar, MIN_POLAR, MAX_POLAR);
    const toPos = new THREE.Vector3(
      target.x + d * Math.sin(p) * Math.sin(azimuth),
      d * Math.cos(p),
      target.z + d * Math.sin(p) * Math.cos(azimuth),
    );
    if (!animate || this.reducedMotion) {
      this.flight = null;
      this.camera.position.copy(toPos);
      this.controls.target.copy(target);
      this.controls.update();
      this.needsRender = true;
      return;
    }
    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      t: 0,
      duration,
      easeInOut: duration > 1,
    };
  }

  /** For automated tests: the camera's distance, compass direction and tilt. */
  debugView() {
    return { distance: Math.round(this.distance()), azimuth: +this.controls.getAzimuthalAngle().toFixed(3), polar: +this.controls.getPolarAngle().toFixed(3) };
  }

  private distance() {
    return this.camera.position.distanceTo(this.controls.target);
  }

  /** The default aerial view: north up, every step pin in frame. */
  showAll(animate = true) {
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    let dist = (this.overview.radius * 1.22) / Math.sin(Math.min(vHalf, hHalf));
    if (this.paper) {
      // Papercut: the two cities fill the top half, leaving the bottom clear for the
      // jump buttons and readout: Madinah 15% from the top, Makkah about 65%.
      const box = this.overview.box;
      const span = box.max.z - box.min.z;
      dist = span / 0.5 / (2 * Math.tan(vHalf));
      const visible = 2 * dist * Math.tan(vHalf);
      const target = new THREE.Vector3((box.min.x + box.max.x) / 2, 0, box.min.z + (0.5 - 0.15) * visible);
      this.flyTo(target, dist, AERIAL_POLAR, 0, animate);
      return;
    }
    if (this.region) {
      // Fit the long, narrow north-south box of the two cities by height and width separately.
      const size = this.overview.box.getSize(new THREE.Vector3());
      dist = Math.max(size.z / 2 / Math.tan(vHalf), size.x / 2 / Math.tan(hHalf)) * 1.3;
    }
    this.flyTo(this.overview.center.clone(), dist, AERIAL_POLAR, 0, animate);
  }

  /** The compass direction for a tilted view: the user's own, unless still at the default north-up. */
  private tiltAzimuth() {
    const az = this.controls.getAzimuthalAngle();
    return Math.abs(az) < 0.01 ? TILTED_AZIMUTH : az;
  }

  /** Move in on one point, keeping the current compass direction. */
  focus(pos: [number, number], distance = 720) {
    this.flyTo(new THREE.Vector3(pos[0], 0, pos[1]), distance, 0.75, this.tiltAzimuth());
  }

  /** Fit a set of points (scene metres) on screen from above, north up. Used for the miqat view. */
  frame(points: [number, number][]) {
    const box = new THREE.Box3();
    points.forEach(([x, z]) => box.expandByPoint(new THREE.Vector3(x, 0, z)));
    const size = box.getSize(new THREE.Vector3());
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    // Leave room for the labels beside each pin, and (Papercut) the buttons at the bottom.
    const dist = Math.max(size.z / 2 / Math.tan(vHalf), size.x / 2 / Math.tan(hHalf)) * (this.paper ? 1.9 : 1.45);
    const centre = box.getCenter(new THREE.Vector3());
    // Shift the points left of centre, clear of the map buttons on the right (labels sit to the right of each pin).
    centre.x += 0.12 * 2 * dist * Math.tan(hHalf);
    if (this.paper) centre.z += 0.12 * 2 * dist * Math.tan(vHalf);
    this.flyTo(centre, dist, AERIAL_POLAR, 0);
  }

  /** Move to a point from straight above, at a given distance (used for whole cities). */
  lookDownAt(pos: [number, number], distance: number) {
    this.flyTo(new THREE.Vector3(pos[0], 0, pos[1]), distance, AERIAL_POLAR, 0);
  }

  zoomBy(factor: number) {
    this.flyTo(this.controls.target.clone(), this.distance() * factor, this.controls.getPolarAngle(), this.controls.getAzimuthalAngle());
  }

  rotateBy(radians: number) {
    this.flyTo(this.controls.target.clone(), this.distance(), this.controls.getPolarAngle(), this.controls.getAzimuthalAngle() + radians);
  }

  /** Switch between looking straight down and a tilted 3D view. Returns true if now tilted. */
  toggleTilt() {
    const tilted = this.controls.getPolarAngle() > 0.6;
    this.flyTo(
      this.controls.target.clone(),
      this.distance(),
      tilted ? MIN_POLAR : TILTED_POLAR,
      tilted ? this.controls.getAzimuthalAngle() : this.tiltAzimuth(),
    );
    return !tilted;
  }

  // Frame loop ----------------------------------------------------------------

  private wantedRatio() {
    return Math.min(window.devicePixelRatio || 1, this.ratioCap);
  }

  /**
   * The canvas is drawn at its on-screen size times the screen's pixel density. Some
   * phones (and the preview page's frame) report the final size or density only after
   * the page has opened, which left the first picture blurry until the map was touched
   * (owner, 20 Nov 2026). So this is checked a few times a second, not only on resize.
   */
  private checkSharpness() {
    const parent = this.canvas.parentElement ?? this.canvas;
    const pr = this.wantedRatio();
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    if (pr !== this.renderer.getPixelRatio() || this.canvas.width !== Math.floor(w * pr) || this.canvas.height !== Math.floor(h * pr)) this.resize();
  }

  private resize() {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    const pr = this.wantedRatio();
    if (pr !== this.renderer.getPixelRatio()) {
      this.renderer.setPixelRatio(pr);
      this.composer?.setPixelRatio(pr);
    }
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private updatePins() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const d = this.distance();
    for (const pin of this.pins) {
      // Papercut fades pins in and out over a band inside their range instead of
      // switching them, so one set hands over to the next without overlapping.
      const alpha = this.paper
        ? (pin.maxDist ? smoothstep(pin.maxDist, pin.maxDist * 0.8, d) : 1) * (pin.minDist ? smoothstep(pin.minDist, pin.minDist * 1.25, d) : 1)
        : d >= (pin.minDist ?? 0) && d <= (pin.maxDist ?? Infinity)
          ? 1
          : 0;
      // A building that is still low cannot stand on a pin's full height.
      const pinY = this.paper && pin.y ? Math.max(26, pin.y * (0.03 + 0.97 * this.paper.growth)) : (pin.y ?? 26);
      this.tmp.set(pin.pos[0], pinY, pin.pos[1]).project(this.camera);
      const visible = alpha > 0.04 && this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.2 && Math.abs(this.tmp.y) < 1.2;
      pin.el.style.visibility = visible ? 'visible' : 'hidden';
      if (this.paper) pin.el.style.opacity = alpha < 1 ? alpha.toFixed(2) : '';
      if (!visible) continue;
      const x = (this.tmp.x * 0.5 + 0.5) * w;
      const y = (-this.tmp.y * 0.5 + 0.5) * h;
      pin.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    for (const ptr of this.pointers) this.updatePointer(ptr, w, h);
  }

  /** Marks pins that a building stands in front of, so they can be drawn faded. */
  private updateOcclusion() {
    const from = this.camera.position;
    const dir = new THREE.Vector3();
    for (const pin of this.pins) {
      const to = this.tmp.set(pin.pos[0], pin.y ?? 26, pin.pos[1]);
      const dist = from.distanceTo(to);
      this.raycaster.set(from, dir.subVectors(to, from).normalize());
      this.raycaster.far = dist - 1.5;
      const hidden = this.raycaster.intersectObjects(this.occluders, false).length > 0;
      pin.el.classList.toggle('is-occluded', hidden);
    }
  }

  private tick = (time: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (time - this.last) / 1000 || 0);
    this.last = time;
    if (time - this.lastSharpCheck > 250) {
      this.lastSharpCheck = time;
      this.checkSharpness();
    }
    // Keep redrawing for a moment after the map is revealed, so no half-ready picture stays up.
    if (time < this.settleUntil) this.needsRender = true;
    // Papercut: the nodes only animate (and keep the screen redrawing) while they are visible.
    if (!this.reducedMotion && (!this.paper || this.nodeMesh.visible)) {
      for (const n of this.nodes) n.angle += n.speed * dt;
      this.placeNodes();
      this.needsRender = true;
    }
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = f.easeInOut
        ? f.t < 0.5
          ? 4 * f.t ** 3
          : 1 - Math.pow(-2 * f.t + 2, 3) / 2
        : 1 - Math.pow(1 - f.t, 3);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, e);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
      if (f.t >= 1) this.flight = null;
      this.needsRender = true;
    }
    this.controls.update();
    if (this.region) this.fitToDistance();
    if (this.paper) this.updatePaper();
    this.camera.updateMatrixWorld();
    if (!this.lastCamera.equals(this.camera.matrixWorld)) {
      this.lastCamera.copy(this.camera.matrixWorld);
      this.occlusionDirty = true;
    }
    if (this.occlusionDirty && time - this.lastOcclusion > OCCLUSION_INTERVAL) {
      this.lastOcclusion = time;
      this.occlusionDirty = false;
      this.updateOcclusion();
    }
    if (this.paper) this.countFrame(time, this.needsRender);
    if (this.needsRender) {
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.updatePins();
      this.needsRender = false;
    }
  };

  /**
   * With the regional map the view ranges from a few hundred metres to hundreds of
   * kilometres, so clipping, fog, the sun's shadow area (a few km around the point
   * looked at) and railway dashes follow the current distance.
   */
  private fitToDistance() {
    const d = this.distance();
    // A nearer near plane wastes depth precision; even the steepest tilt keeps the
    // ground well over a quarter of the viewing distance away.
    const near = THREE.MathUtils.clamp(d * 0.05, 1, 80_000);
    const far = d * 12 + 6000;
    if (Math.abs(near - this.camera.near) > near * 0.05 || Math.abs(far - this.camera.far) > far * 0.05) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = d * 2.6;
      this.scene.fog.far = d * 7;
    }
    for (const { obj, level } of this.flatLayers) obj.position.y = level * d * 0.0001;
    if (this.paper) return; // Papercut: the sun follows the nearest city instead (updatePaper).
    // The sun's shadow area follows the view. Move it only in whole shadow-map
    // texels, seen from the sun, so shadow edges do not crawl while dragging.
    const sc = this.sun.shadow.camera;
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.width;
    const t = this.tmp.copy(this.controls.target).applyMatrix4(this.sunRotationInverse);
    t.x = Math.round(t.x / texel) * texel;
    t.y = Math.round(t.y / texel) * texel;
    t.applyMatrix4(this.sunRotation);
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).add(this.sunOffset);
    // Dashes about 0.6% of the viewing distance long, so the railway reads as dashed at every zoom.
    this.mats.rail.scale = 1 / (d * 0.006);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
    });
    Object.values(this.mats).forEach((m) => m.dispose());
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

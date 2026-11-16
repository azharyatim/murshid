import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SceneTheme } from '../themes';
import { MARWA, SAFA } from '../data/steps';
import { generateSampleCity, type Box } from './sampleCity';
import { generateModelCity, terrainHeight } from './modelCity';

/**
 * 'plain' is the flat placeholder grid with simple lighting.
 * 'model' adds hills, an irregular city, warm light with cool shadows and
 * ambient occlusion, to read like a physical clay site model.
 */
export type Look = 'plain' | 'model' | 'cyan';

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
          vWin = vec3(0.0);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWin;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vWin.z > 0.0) {
          const vec2 cell = vec2(4.2, 3.6); // window spacing and floor height in metres
          vec2 g = vec2(vWin.x + vWin.z * 0.5, vWin.y - 4.5) / cell;
          vec2 f = fract(g);
          float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.8);
          // Keep a plain band at the base, the top and the corners.
          win *= step(0.0, g.y) * step(abs(vWin.x), vWin.z * 0.5 - 1.2);
          float detail = 1.0 - clamp(max(fwidth(g.x), fwidth(g.y)) * 1.6, 0.0, 1.0);
          diffuseColor.rgb *= 1.0 - 0.24 * win * detail;
        }`,
      );
  };
}

const NODE_COUNT = 150;
const MATAF_RADIUS = 68;
const MIN_DISTANCE = 160;
const MAX_DISTANCE = 2600;
const MIN_POLAR = 0.02; // straight down
const MAX_POLAR = 1.3; // close to the horizon
const AERIAL_POLAR = 0.4;
const TILTED_POLAR = 1.0;

interface TawafNode {
  radius: number;
  angle: number;
  speed: number; // radians per second
}

/** An HTML element pinned to a point in the 3D scene. */
export interface Pin {
  el: HTMLElement;
  /** Metres from the Kaabah: x = east, z = south. */
  pos: [number, number];
}

interface Flight {
  from: { target: THREE.Vector3; dist: number; azimuth: number; polar: number };
  to: { target: THREE.Vector3; dist: number; azimuth: number; polar: number };
  t: number;
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
  /** The camera orbits `target` at `dist`; `azimuth` 0 is north-up, `polar` 0 is straight down. */
  private view = { target: new THREE.Vector3(), dist: 1500, azimuth: 0, polar: AERIAL_POLAR };
  private pointers = new Map<number, [number, number]>();
  private lastGesture: { mid: [number, number]; dist: number; angle: number } | null = null;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private sky = new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.2);
  private mats = {
    ground: new THREE.MeshStandardMaterial({ roughness: 1 }),
    slab: new THREE.MeshStandardMaterial({ roughness: 1 }),
    building: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    haram: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    kaabah: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    node: new THREE.MeshBasicMaterial(),
  };
  private nodes: TawafNode[] = [];
  private nodeMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private pins: Pin[] = [];
  private overview: { center: THREE.Vector3; radius: number };
  private flight: Flight | null = null;
  private raf = 0;
  private last = 0;
  private needsRender = true;
  private reducedMotion: boolean;
  private resizeObserver: ResizeObserver;
  private tmp = new THREE.Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    theme: SceneTheme,
    reducedMotion: boolean,
    /** Points that the default aerial view must keep in frame. */
    overviewPoints: [number, number][],
    private look: Look = 'plain',
  ) {
    this.reducedMotion = reducedMotion;
    const model = look !== 'plain';
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.sun.position.set(-520, 720, 380);
    this.sun.castShadow = true;
    const size = model ? (small ? 2048 : 4096) : small ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    const reach = model ? 1700 : 1250;
    sc.left = -reach;
    sc.right = reach;
    sc.top = reach;
    sc.bottom = -reach;
    sc.near = 100;
    sc.far = 2800;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.2;
    this.scene.add(this.sun, this.sky);

    // Ground (roads and open space).
    if (model) {
      this.scene.add(this.buildTerrain());
      this.mats.building.vertexColors = true;
      if (look === 'cyan') addWindows(this.mats.building);
      this.scene.add(this.boxes(generateModelCity(), this.mats.building, true, true));
    } else {
      const ground = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), this.mats.ground);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);
      const city = generateSampleCity();
      this.scene.add(this.boxes(city.slabs, this.mats.slab, false));
      this.scene.add(this.boxes(city.buildings, this.mats.building, true));
    }
    this.buildHaram();

    // The Kaabah: a simple cube, the only dark object in the scene.
    const kaabah = new THREE.Mesh(new THREE.BoxGeometry(11, 13, 12.5), this.mats.kaabah);
    kaabah.position.y = 6.5;
    kaabah.rotation.y = 0.5;
    kaabah.castShadow = true;
    this.scene.add(kaabah);

    // Travelling nodes circling the Kaabah anticlockwise.
    this.nodeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 10, 8), this.mats.node, NODE_COUNT);
    let seed = 3;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < NODE_COUNT; i++) {
      const radius = 13 + Math.pow(rnd(), 1.4) * 48;
      this.nodes.push({ radius, angle: rnd() * Math.PI * 2, speed: (5.5 + rnd() * 2) / radius });
    }
    this.placeNodes();
    this.scene.add(this.nodeMesh);

    // Frame for the default aerial view.
    const box = new THREE.Box3();
    overviewPoints.forEach(([x, z]) => box.expandByPoint(new THREE.Vector3(x, 0, z)));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.overview = { center: sphere.center, radius: sphere.radius };

    // Gestures, matching nuzul-atlas: one finger drags the map. Two fingers
    // pinch to zoom, twist to rotate and slide to move, all around the point
    // between the fingers. Mouse: drag moves, wheel zooms, shift-drag or
    // right-drag rotates and tilts, double-click zooms in.
    this.bindGestures();

    this.setTheme(theme);
    this.resize();
    this.showAll(false);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.raf = requestAnimationFrame(this.tick);
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

  private boxes(list: Box[], material: THREE.Material, castShadow: boolean, shaded = false) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    if (shaded) {
      // Slightly darker towards the base, a cheap stand-in for bounced light.
      const p = geo.attributes.position;
      const colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) colors.fill(p.getY(i) > 0.5 ? 1 : 0.8, i * 3, i * 3 + 3);
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
    this.nodes.forEach((n, i) => {
      this.dummy.position.set(Math.cos(n.angle) * n.radius, 2.2, -Math.sin(n.angle) * n.radius);
      this.dummy.updateMatrix();
      this.nodeMesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.nodeMesh.instanceMatrix.needsUpdate = true;
  }

  setTheme(t: SceneTheme) {
    this.scene.background = new THREE.Color(t.background);
    this.scene.fog = new THREE.Fog(t.background, 1900, 4200);
    this.mats.ground.color.set(t.ground);
    this.mats.slab.color.set(t.slab);
    this.mats.building.color.set(t.building);
    this.mats.haram.color.set(t.haram);
    this.mats.kaabah.color.set(t.kaabah);
    this.mats.node.color.set(t.node);
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunIntensity;
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
    this.pins = pins;
    this.needsRender = true;
  }

  // Camera moves ------------------------------------------------------------

  private applyView() {
    const v = this.view;
    v.dist = THREE.MathUtils.clamp(v.dist, MIN_DISTANCE, MAX_DISTANCE);
    v.polar = THREE.MathUtils.clamp(v.polar, MIN_POLAR, MAX_POLAR);
    // Keep the view from being dragged away from the Haram area.
    const d = Math.hypot(v.target.x, v.target.z);
    if (d > 700) {
      v.target.x *= 700 / d;
      v.target.z *= 700 / d;
    }
    v.target.y = 0;
    this.camera.position.set(
      v.target.x + v.dist * Math.sin(v.polar) * Math.sin(v.azimuth),
      v.dist * Math.cos(v.polar),
      v.target.z + v.dist * Math.sin(v.polar) * Math.cos(v.azimuth),
    );
    this.camera.lookAt(v.target);
    this.camera.updateMatrixWorld();
    this.needsRender = true;
  }

  /** The point on the ground under a screen position (CSS pixels in the canvas). */
  private groundAt(x: number, y: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.camera);
    return this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  /** Apply a change, then slide the map so the point under the fingers stays under them. */
  private gesture(from: [number, number], to: [number, number], zoom: number, twist: number) {
    const before = this.groundAt(from[0], from[1]);
    this.view.dist /= zoom;
    this.view.azimuth += twist;
    this.applyView();
    const after = this.groundAt(to[0], to[1]);
    if (before && after) {
      this.view.target.add(before).sub(after);
      this.applyView();
    }
  }

  private bindGestures() {
    const c = this.canvas;
    const local = (e: PointerEvent | WheelEvent | MouseEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    c.addEventListener('pointerdown', (e) => {
      this.flight = null;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* capture is only a convenience */
      }
      this.pointers.set(e.pointerId, local(e));
      this.lastGesture = null;
    });
    c.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const now = local(e);
      this.pointers.set(e.pointerId, now);
      if (this.pointers.size === 1) {
        if (e.pointerType === 'mouse' && (e.shiftKey || e.buttons & 2)) {
          this.view.azimuth -= (now[0] - prev[0]) * 0.008;
          this.view.polar -= (now[1] - prev[1]) * 0.006;
          this.applyView();
        } else {
          this.gesture(prev, now, 1, 0);
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const last = this.lastGesture;
        if (last && last.dist > 0) {
          let twist = angle - last.angle;
          if (twist > Math.PI) twist -= Math.PI * 2;
          if (twist < -Math.PI) twist += Math.PI * 2;
          this.gesture(last.mid, mid, dist / last.dist, twist);
        }
        this.lastGesture = { mid, dist, angle };
      }
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.lastGesture = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.flight = null;
        const p = local(e);
        this.gesture(p, p, Math.exp(-e.deltaY * 0.0018), 0);
      },
      { passive: false },
    );
    c.addEventListener('dblclick', (e) => {
      const p = local(e);
      this.gesture(p, p, 2, 0);
    });
  }

  private flyTo(target: THREE.Vector3, distance: number, polar: number, azimuth: number, animate = true) {
    const to = {
      target: target.clone(),
      dist: THREE.MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE),
      polar: THREE.MathUtils.clamp(polar, MIN_POLAR, MAX_POLAR),
      azimuth,
    };
    if (!animate || this.reducedMotion) {
      this.flight = null;
      Object.assign(this.view, { ...to, target: to.target });
      this.applyView();
      return;
    }
    this.flight = { from: { ...this.view, target: this.view.target.clone() }, to, t: 0 };
  }

  private distance() {
    return this.view.dist;
  }

  /** The default aerial view: north up, every step pin in frame. */
  showAll(animate = true) {
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const dist = (this.overview.radius * 1.22) / Math.sin(Math.min(vHalf, hHalf));
    this.flyTo(this.overview.center.clone(), dist, AERIAL_POLAR, 0, animate);
  }

  /** Move in on one point, keeping the current compass direction. */
  focus(pos: [number, number]) {
    this.flyTo(new THREE.Vector3(pos[0], 0, pos[1]), 720, 0.75, this.view.azimuth);
  }

  zoomBy(factor: number) {
    this.flyTo(this.view.target.clone(), this.distance() * factor, this.view.polar, this.view.azimuth);
  }

  rotateBy(radians: number) {
    this.flyTo(this.view.target.clone(), this.distance(), this.view.polar, this.view.azimuth + radians);
  }

  /** Switch between looking straight down and a tilted 3D view. Returns true if now tilted. */
  toggleTilt() {
    const tilted = this.view.polar > 0.6;
    this.flyTo(this.view.target.clone(), this.distance(), tilted ? MIN_POLAR : TILTED_POLAR, this.view.azimuth);
    return !tilted;
  }

  // Frame loop ----------------------------------------------------------------

  private resize() {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private updatePins() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    for (const pin of this.pins) {
      this.tmp.set(pin.pos[0], 26, pin.pos[1]).project(this.camera);
      const visible = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.2 && Math.abs(this.tmp.y) < 1.2;
      pin.el.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) continue;
      const x = (this.tmp.x * 0.5 + 0.5) * w;
      const y = (-this.tmp.y * 0.5 + 0.5) * h;
      pin.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  private tick = (time: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (time - this.last) / 1000 || 0);
    this.last = time;
    if (!this.reducedMotion) {
      for (const n of this.nodes) n.angle += n.speed * dt;
      this.placeNodes();
      this.needsRender = true;
    }
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / 0.6);
      const e = 1 - Math.pow(1 - f.t, 3);
      this.view.target.lerpVectors(f.from.target, f.to.target, e);
      this.view.dist = THREE.MathUtils.lerp(f.from.dist, f.to.dist, e);
      this.view.polar = THREE.MathUtils.lerp(f.from.polar, f.to.polar, e);
      this.view.azimuth = THREE.MathUtils.lerp(f.from.azimuth, f.to.azimuth, e);
      this.applyView();
      if (f.t >= 1) this.flight = null;
    }
    if (this.needsRender) {
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.updatePins();
      this.needsRender = false;
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    Object.values(this.mats).forEach((m) => m.dispose());
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

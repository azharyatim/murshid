import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SceneTheme } from '../themes';
import { generateSampleCity, type Box } from './sampleCity';

const NODE_COUNT = 150;
const MATAF_RADIUS = 68;

interface TawafNode {
  radius: number;
  angle: number;
  speed: number; // radians per second
}

/**
 * The white-clay city scene. Stage 1 renders a placeholder city around a
 * simplified massing of Masjid al-Haram so the visual styles can be compared.
 */
export class CityScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 10, 4000);
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private sky = new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.2);
  private mats = {
    ground: new THREE.MeshStandardMaterial({ roughness: 1 }),
    slab: new THREE.MeshStandardMaterial({ roughness: 1 }),
    building: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    haram: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    kaabah: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    band: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }),
    node: new THREE.MeshBasicMaterial(),
  };
  private band: THREE.Mesh;
  private nodes: TawafNode[] = [];
  private nodeMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private raf = 0;
  private last = 0;
  private needsRender = true;
  private reducedMotion: boolean;
  private resizeObserver: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, theme: SceneTheme, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting: one soft sun plus sky fill gives the clay-model look.
    this.sun.position.set(-520, 720, 380);
    this.sun.castShadow = true;
    const size = small ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -1150;
    sc.right = 1150;
    sc.top = 1150;
    sc.bottom = -1150;
    sc.near = 100;
    sc.far = 2200;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.2;
    this.scene.add(this.sun, this.sky);

    // Ground (roads and open space).
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 64), this.mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const city = generateSampleCity();
    this.scene.add(this.boxes(city.slabs, this.mats.slab, false));
    this.scene.add(this.boxes(city.buildings, this.mats.building, true));
    this.buildHaram();

    // The Kaabah: a simple cube, the only dark object in the scene.
    const kaabah = new THREE.Mesh(new THREE.BoxGeometry(11, 13, 12.5), this.mats.kaabah);
    kaabah.position.y = 6.5;
    kaabah.rotation.y = 0.5;
    kaabah.castShadow = true;
    this.scene.add(kaabah);
    this.band = new THREE.Mesh(new THREE.BoxGeometry(11.25, 1.4, 12.75), this.mats.band);
    this.band.position.y = 9.2;
    this.band.rotation.y = 0.5;
    this.scene.add(this.band);

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

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 220;
    this.controls.maxDistance = 2200;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.25;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener('change', () => (this.needsRender = true));

    this.setTheme(theme);
    this.resize(true);
    this.resizeObserver = new ResizeObserver(() => this.resize(false));
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.raf = requestAnimationFrame(this.tick);
  }

  private boxes(list: Box[], material: THREE.Material, castShadow: boolean) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((b, i) => {
      this.dummy.position.set(b.x, 0, b.z);
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

  /** Respectful simplified massing: a low ring around the open mataf. */
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
      [185, MATAF_RADIUS, 15],
      [172, MATAF_RADIUS + 12, 22],
    ];
    tiers.forEach(([outer, inner, depth], i) => {
      const geo = new THREE.ExtrudeGeometry(ring(outer, inner, 8), { depth, bevelEnabled: false, curveSegments: 48 });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.mats.haram);
      mesh.position.y = i === 0 ? 0 : 0.01;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(MATAF_RADIUS + 1, 64), this.mats.haram);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.4;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const minaretGeo = new THREE.CylinderGeometry(3.2, 4.2, 88, 10);
    minaretGeo.translate(0, 44, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const m = new THREE.Mesh(minaretGeo, this.mats.haram);
      m.position.set(Math.cos(a) * 179, 0, Math.sin(a) * 179);
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
    this.scene.fog = new THREE.Fog(t.background, 1500, 3200);
    this.mats.ground.color.set(t.ground);
    this.mats.slab.color.set(t.slab);
    this.mats.building.color.set(t.building);
    this.mats.haram.color.set(t.haram);
    this.mats.kaabah.color.set(t.kaabah);
    this.band.visible = t.kaabahBand !== null;
    if (t.kaabahBand !== null) this.mats.band.color.set(t.kaabahBand);
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

  private resize(first: boolean) {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // On wide screens the side panel covers the left edge, so the view is
    // shifted right to keep the Kaabah in the visible part of the canvas.
    if (w >= 900) this.camera.setViewOffset(w, h, -222, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (first) {
      // Narrow (portrait) views sit further back so the whole Haram fits.
      const dist = this.camera.aspect < 1 ? 1500 : 1250;
      const dir = new THREE.Vector3(0.5, 0.58, 0.7).normalize();
      this.camera.position.copy(dir.multiplyScalar(dist));
      this.controls.update();
    }
    this.needsRender = true;
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
    this.controls.update();
    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    Object.values(this.mats).forEach((m) => m.dispose());
    this.renderer.dispose();
  }
}

import * as THREE from 'three';
import { KIND_COLOUR, GREEN_DOME, NABAWI_MINARETS } from './papercutCity';
import { MARWA, SAFA } from '../data/steps';

// Simple massing for the two mosques and the Kaabah, in flat Papercut colours.
// Respectful stand-ins, not the real buildings. Local coordinates: the Kaabah
// for Makkah, the centre of the mosque for Madinah.

export const MATAF_RADIUS = 68;

const lambert = (hex: number) => new THREE.MeshLambertMaterial({ color: hex });

function shadowed<T extends THREE.Mesh>(m: T, cast = true) {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Octagonal ring around the open mataf, the Mas'a gallery, minarets, the Kaabah. */
export function makkahLandmarks(): THREE.Group {
  const g = new THREE.Group();
  const mosque = lambert(KIND_COLOUR.mosque);

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
  for (const [outer, inner, depth] of tiers) {
    const geo = new THREE.ExtrudeGeometry(ring(outer, inner, 8), { depth, bevelEnabled: false, curveSegments: 48 });
    geo.rotateX(-Math.PI / 2);
    g.add(shadowed(new THREE.Mesh(geo, mosque)));
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(MATAF_RADIUS + 1, 64), lambert(0xe2daa7));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.5;
  floor.receiveShadow = true;
  g.add(floor);

  const dx = MARWA[0] - SAFA[0];
  const dz = MARWA[1] - SAFA[1];
  const masa = new THREE.Mesh(new THREE.BoxGeometry(40, 25, Math.hypot(dx, dz) + 40), mosque);
  masa.position.set((SAFA[0] + MARWA[0]) / 2, 12.5, (SAFA[1] + MARWA[1]) / 2);
  masa.rotation.y = Math.atan2(dx, dz);
  g.add(shadowed(masa));

  const minaretGeo = new THREE.CylinderGeometry(3.2, 4.2, 88, 10);
  minaretGeo.translate(0, 44, 0);
  const minarets = new THREE.InstancedMesh(minaretGeo, mosque, 8);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    m4.makeTranslation(Math.cos(a) * 222, 0, Math.sin(a) * 222);
    minarets.setMatrixAt(i, m4);
  }
  g.add(shadowed(minarets));

  const kaabah = new THREE.Mesh(new THREE.BoxGeometry(11, 13, 12.5), lambert(KIND_COLOUR.kaabah));
  kaabah.position.y = 6.5;
  kaabah.rotation.y = 0.5;
  g.add(shadowed(kaabah));
  return g;
}

/** Low prayer hall, ten minarets and a green dome. Stylised, not the real plan. */
export function madinahLandmarks(): THREE.Group {
  const g = new THREE.Group();
  const mosque = lambert(KIND_COLOUR.mosque);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(240, 16, 180), mosque);
  hall.position.y = 8;
  g.add(shadowed(hall));

  const court = new THREE.Mesh(new THREE.BoxGeometry(150, 1, 90), lambert(0xe2daa7));
  court.position.set(0, 16.4, -20);
  court.receiveShadow = true;
  g.add(court);

  const minaretGeo = new THREE.BoxGeometry(7, 105, 7);
  minaretGeo.translate(0, 52.5, 0);
  const minarets = new THREE.InstancedMesh(minaretGeo, mosque, NABAWI_MINARETS.length);
  const m4 = new THREE.Matrix4();
  NABAWI_MINARETS.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0, z);
    minarets.setMatrixAt(i, m4);
  });
  g.add(shadowed(minarets));

  const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), lambert(KIND_COLOUR.dome));
  dome.position.set(GREEN_DOME[0], 16, GREEN_DOME[1]);
  g.add(shadowed(dome));
  return g;
}

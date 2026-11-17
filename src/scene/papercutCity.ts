// PLACEHOLDER buildings for the Papercut look. NOT real map data.
//
// They are generated (a jittered grid, tallest near the mosque) until the
// OpenStreetMap buildings can be downloaded and baked. Hotel / shop / home is a
// GUESS from height and distance to the mosque, not from tags.
//
// Positions are metres from the city's own origin (the Kaabah for Makkah, the
// centre of Masjid an-Nabawi for Madinah): x = east, z = south.

export type Kind = 'hotel' | 'shop' | 'home' | 'mosque' | 'tower';

export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  k: Kind;
}

/** Flat colours from the Papercut palette. */
export const KIND_COLOUR: Record<Kind | 'kaabah' | 'dome', number> = {
  hotel: 0xd9795a,
  shop: 0xf0b178,
  home: 0xf7efe2,
  mosque: 0x1f6f78,
  tower: 0xc7621f,
  kaabah: 0x26324d,
  dome: 0x62a69a,
};

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximate position of the Abraj al-Bait towers relative to the Kaabah. Placeholder. */
export const ABRAJ: [number, number] = [-82, 410];

export function makkahBuildings(): Building[] {
  const R = rng(7);
  const out: Building[] = [];
  const add = (x: number, z: number, w: number, d: number, h: number, k: Kind) => out.push({ x, z, w, d, h, k });

  // Tower cluster: one tall tower and lower neighbours.
  const [ax, az] = ABRAJ;
  add(ax, az, 56, 56, 250, 'tower');
  add(ax - 75, az - 10, 40, 40, 150, 'tower');
  add(ax + 75, az - 10, 40, 40, 170, 'tower');
  add(ax, az + 60, 70, 40, 120, 'tower');
  add(ax - 90, az + 50, 40, 40, 110, 'tower');
  add(ax + 80, az + 55, 44, 44, 130, 'tower');

  for (let gx = -900; gx <= 900; gx += 54) {
    for (let gz = -900; gz <= 900; gz += 54) {
      const x = gx + (R() - 0.5) * 8;
      const z = gz + (R() - 0.5) * 8;
      const r = Math.hypot(x, z);
      // Keep the mosque, the Mas'a and the tower cluster clear.
      if (r < 262) continue;
      if (x > 62 && x < 160 && z > -345 && z < 140) continue;
      if (Math.abs(x - ax) < 150 && Math.abs(z - az) < 100) continue;
      if (Math.abs(r - 400) < 14 || r > 880) continue;
      const near = Math.max(0, 1 - r / 800);
      let h = 10 + R() * 34 + near * R() * 70;
      if (R() < 0.06) h += 60 * near + 10;
      const k: Kind = h >= 42 || (h >= 30 && r < 450) ? 'hotel' : R() < 0.4 && h < 28 ? 'shop' : 'home';
      add(x, z, 28 + R() * 18, 28 + R() * 18, h, k);
    }
  }
  return out;
}

export function madinahBuildings(): Building[] {
  const R = rng(19);
  const out: Building[] = [];
  for (let gx = -900; gx <= 900; gx += 54) {
    for (let gz = -900; gz <= 900; gz += 54) {
      const x = gx + (R() - 0.5) * 8;
      const z = gz + (R() - 0.5) * 8;
      const r = Math.hypot(x, z);
      // Mosque body and its minarets sit in the middle.
      if (Math.abs(x) < 190 && Math.abs(z) < 150) continue;
      if (r < 250 || Math.abs(r - 430) < 14 || r > 880) continue;
      const near = Math.max(0, 1 - r / 800);
      // Lower skyline than Makkah.
      let h = 8 + R() * 22 + near * R() * 34;
      if (R() < 0.05) h += 22 * near + 6;
      const k: Kind = h >= 34 || (h >= 24 && r < 420) ? 'hotel' : R() < 0.4 && h < 22 ? 'shop' : 'home';
      out.push({ x, z, w: 26 + R() * 16, d: 26 + R() * 16, h, k });
    }
  }
  return out;
}

/** Minarets of Masjid an-Nabawi (about 105 m). Placeholder positions around the mosque. */
export const NABAWI_MINARETS: [number, number][] = [
  [-126, -96], [126, -96], [-126, 96], [126, 96], [-126, 0], [126, 0], [0, -96], [0, 96], [-60, -96], [60, 96],
];
/** Rough position of the green dome on the mosque, towards the south-east. Placeholder. */
export const GREEN_DOME: [number, number] = [40, 48];

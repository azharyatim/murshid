// The three visual directions offered for review in stage 1.
// Each theme styles both the 3D clay city and the interface on top of it.

export type ThemeId = 'clay' | 'kiswah' | 'fajr';

export interface SceneTheme {
  background: number;
  ground: number; // roads and open ground
  slab: number; // raised city blocks
  building: number;
  haram: number;
  kaabah: number;
  kaabahBand: number | null;
  node: number;
  sun: number;
  sunIntensity: number;
  sky: number;
  skyGround: number;
  skyIntensity: number;
}

export interface Theme {
  id: ThemeId;
  name: string;
  summary: string;
  scene: SceneTheme;
}

export const THEMES: Record<ThemeId, Theme> = {
  clay: {
    id: 'clay',
    name: 'Clay',
    summary: 'Minimal monochrome with one green accent',
    scene: {
      background: 0xeef0ed,
      ground: 0xe9ebe8,
      slab: 0xf4f5f3,
      building: 0xffffff,
      haram: 0xffffff,
      kaabah: 0x1b1d1c,
      kaabahBand: null,
      node: 0x18794a,
      sun: 0xffffff,
      sunIntensity: 2.6,
      sky: 0xffffff,
      skyGround: 0xd9dcd8,
      skyIntensity: 1.25,
    },
  },
  kiswah: {
    id: 'kiswah',
    name: 'Kiswah',
    summary: 'Black and brass, after the cloth of the Kaabah',
    scene: {
      background: 0xf3efe6,
      ground: 0xece7dc,
      slab: 0xf6f2ea,
      building: 0xfffdf8,
      haram: 0xfffdf8,
      kaabah: 0x000000,
      kaabahBand: 0xc19a3e,
      node: 0xa87b1c,
      sun: 0xfff3dc,
      sunIntensity: 2.7,
      sky: 0xfffaf0,
      skyGround: 0xdcd3c0,
      skyIntensity: 1.2,
    },
  },
  fajr: {
    id: 'fajr',
    name: 'Fajr',
    summary: 'Cool dawn blue with lamp-amber nodes',
    scene: {
      background: 0xd6e2eb,
      ground: 0xcfdde8,
      slab: 0xdfe9f1,
      building: 0xf3f8fc,
      haram: 0xf7fbff,
      kaabah: 0x0d1b2a,
      kaabahBand: null,
      node: 0xe07a12,
      sun: 0xeaf4ff,
      sunIntensity: 2.4,
      sky: 0xdcecff,
      skyGround: 0xb4c8d8,
      skyIntensity: 1.35,
    },
  },
};

export const THEME_ORDER: ThemeId[] = ['clay', 'kiswah', 'fajr'];

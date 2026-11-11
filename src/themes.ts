// Colours for the 3D clay city. Only the Clay style is active for now;
// further design direction will come later.

export interface SceneTheme {
  background: number;
  ground: number; // roads and open ground
  slab: number; // raised city blocks
  building: number;
  haram: number;
  kaabah: number;
  node: number;
  sun: number;
  sunIntensity: number;
  sky: number;
  skyGround: number;
  skyIntensity: number;
}

export const CLAY: SceneTheme = {
  background: 0xeef0ed,
  ground: 0xe9ebe8,
  slab: 0xf4f5f3,
  building: 0xffffff,
  haram: 0xffffff,
  kaabah: 0x1b1d1c,
  node: 0x18794a,
  sun: 0xffffff,
  sunIntensity: 2.6,
  sky: 0xffffff,
  skyGround: 0xd9dcd8,
  skyIntensity: 1.25,
};

/** Clay with warm sunlight and cool sky fill, so shadows read blue-grey. */
export const CLAY_MODEL: SceneTheme = {
  background: 0xeff0ee,
  ground: 0xf1f0ed,
  slab: 0xf4f3f0,
  building: 0xfcfbf8,
  haram: 0xffffff,
  kaabah: 0x161817,
  node: 0x18794a,
  sun: 0xfff3df,
  sunIntensity: 3.1,
  sky: 0xd3e0ff,
  skyGround: 0xf2eee8,
  skyIntensity: 1.2,
};

/** Cyan buildings on light grey ground, after the isometric reference image. */
export const CLAY_CYAN: SceneTheme = {
  background: 0xe4e6e9,
  ground: 0xd3d6da,
  slab: 0xdfe1e4,
  building: 0x58d0d2,
  haram: 0xffffff,
  kaabah: 0x161817,
  node: 0xe8771a,
  sun: 0xfffaf0,
  sunIntensity: 2.6,
  sky: 0xe4ecff,
  skyGround: 0xeeeeee,
  skyIntensity: 1.3,
};

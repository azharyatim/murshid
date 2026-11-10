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

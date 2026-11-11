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
  /** Brightness at the foot of each building, 0 to 1 (model looks only). Default 0.8. */
  baseShade?: number;
  /** How much of the building colour shows regardless of light, 0 to 1. Flattens shading. Default 0. */
  buildingGlow?: number;
  /** Colour buildings show regardless of light. Overrides buildingGlow when set. */
  buildingEmissive?: number;
  /** Road colour on real map data. Defaults to the slab colour. */
  road?: number;
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

/** Cyan option A: shaded sides lifted so they stay cyan instead of turning teal. */
export const CLAY_CYAN_LIGHT: SceneTheme = {
  ...CLAY_CYAN,
  // The owner's beige (#efe6d3 from their reference image), then made 50% lighter
  // at their request: each colour is halfway between the original and white.
  background: 0xf7f3e9,
  ground: 0xf7f3e9,
  slab: 0xf9f5ed,
  skyGround: 0xf7f3e9,
  road: 0xf2ece0,
  sunIntensity: 2.1,
  skyIntensity: 2.0,
  baseShade: 0.93,
  buildingGlow: 0.18,
};

/** Cyan option B: flat, illustration-style shading with only gentle light and shade. */
export const CLAY_CYAN_FLAT: SceneTheme = {
  ...CLAY_CYAN,
  // Only the buildings are flattened: a dim lit colour plus a fixed glow, so
  // sides differ from tops only gently. Ground, mosque and light are unchanged.
  building: 0x1c6668,
  buildingEmissive: 0x40b4b6,
  baseShade: 1,
};

/**
 * Mint green buildings on very light grey ground, from a second reference image
 * the owner sent (sampled: lit walls about #6edbad, ground about #e7e9ea).
 * Same lighting as option A; base colours are set a touch off the samples so the
 * rendered colours land near them.
 */
export const CLAY_GREEN: SceneTheme = {
  ...CLAY_CYAN_LIGHT,
  building: 0x5ccf9c,
  background: 0xebedee,
  ground: 0xebedee,
  slab: 0xf0f2f2,
  skyGround: 0xebedee,
  road: 0xdfe3e4,
};

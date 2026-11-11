// The seven Umrah steps shown on the overview map.
//
// Positions are metres from the Kaabah (x = east, z = south). Apart from
// Safa and Marwa they are APPROXIMATE placeholders, to be re-derived in stage 3.
// The one-line summaries only restate the project brief; explanations, duas
// and rulings are added in stage 2 after source verification.

export interface Step {
  n: number;
  title: string;
  summary: string;
  /** Where the step's pin sits on the Haram map, or null if it happens at the miqat. */
  pos: [number, number] | null;
}

// Safa and Marwa are the south and north ends of the Mas'a walkway in
// OpenStreetMap (see scripts/bake-osm.mjs). The other pins are still placeholders.
export const SAFA: [number, number] = [130, 85.3];
export const MARWA: [number, number] = [101.4, -307.5];

export const STEPS: Step[] = [
  { n: 1, title: 'Ihram and miqat', summary: 'Entering ihram at the miqat, before reaching Makkah.', pos: null },
  { n: 2, title: 'Niyyah and talbiyah', summary: 'Making the intention and reciting the talbiyah.', pos: null },
  { n: 3, title: 'Entering Masjid al-Haram', summary: 'Arriving at the mosque. The pin marks one entrance as an example.', pos: [-45, 222] },
  { n: 4, title: 'Tawaf', summary: 'Seven circuits around the Kaabah, starting from the Black Stone line.', pos: [0, 0] },
  { n: 5, title: 'Maqam Ibrahim and Zamzam', summary: "Two rak'ah at Maqam Ibrahim, then Zamzam.", pos: [50, -16] },
  { n: 6, title: "Sa'i", summary: 'Seven laps between Safa and Marwa, starting at Safa and ending at Marwa.', pos: SAFA },
  { n: 7, title: 'Halq or taqsir', summary: 'Shaving or shortening the hair, which completes the Umrah.', pos: [146, -326] },
];

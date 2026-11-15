// Places shown on the map: group 1, approved by the owner on 15 November 2026.
// See docs/places-draft.md for the full list and why each place is included.
//
// Names: standard English spelling first, the owner's spelling in brackets
// when it differs. Positions come from OpenStreetMap (export of 15 Nov 2026);
// the OSM element is noted on each. Sources come from the Hadith and Quran
// tools; hadith numbers are the tool's own numbering, with the tool's link.
// Descriptions are NOT written yet.

export interface Source {
  label: string;
  url: string;
}

export interface Place {
  id: string;
  /** Full name shown in the sheet. */
  name: string;
  /** Short name on the map. */
  short: string;
  /** Which city's group it belongs to (the owner lists Badr under Madinah). */
  city: 'Makkah' | 'Madinah';
  lat: number;
  lon: number;
  /** Where the position comes from. */
  osm: string;
  /** What the pin marks, when that is not obvious. */
  pinNote?: string;
  sources: Source[];
}

const hadith = (label: string, id: number): Source => ({ label, url: `https://search.hadith-mcp.org/?id=${id}` });

export const PLACES: Place[] = [
  {
    id: 'haram',
    name: 'Masjid al-Haram (Masjidil Haram)',
    short: 'Masjid al-Haram',
    city: 'Makkah',
    lat: 21.42251716,
    lon: 39.82619418,
    osm: 'way/103914569 (centre of the Kaabah)',
    sources: [hadith('Sahih al-Bukhari 1152', 1152), hadith('Sahih Muslim 3262', 10539), hadith('Sahih Muslim 3257', 10534)],
  },
  {
    id: 'nabawi',
    name: 'Al-Masjid al-Nabawi (Masjid Nabawi)',
    short: 'Masjid al-Nabawi',
    city: 'Madinah',
    lat: 24.46865,
    lon: 39.61117,
    osm: 'way/461699097',
    sources: [hadith('Sahih al-Bukhari 1152', 1152), hadith('Sahih Muslim 3262', 10539), hadith('Sahih Muslim 3257', 10534)],
  },
  {
    id: 'quba',
    name: "Masjid Quba (Masjid Quba')",
    short: 'Masjid Quba',
    city: 'Madinah',
    lat: 24.43936,
    lon: 39.61726,
    osm: 'relation/18051738',
    sources: [hadith('Sunan Ibn Majah 1145', 30978), hadith("Jami' al-Tirmidhi 324", 26104), hadith('Sahih Muslim 3268', 10545)],
  },
  {
    id: 'uhud',
    name: 'Jabal Uhud',
    short: 'Jabal Uhud',
    city: 'Madinah',
    lat: 24.5216,
    lon: 39.62632,
    osm: 'node/3626556473 (summit)',
    pinNote: 'The pin marks the summit.',
    sources: [hadith('Sahih Muslim 3250', 10527)],
  },
  {
    id: 'nur',
    name: 'Jabal al-Nur (Jabal Nour) and the Cave of Hira',
    short: 'Jabal al-Nur',
    city: 'Makkah',
    lat: 21.45778,
    lon: 39.85973,
    osm: 'node/1236462393 (peak); the Cave of Hira is node/3732559985',
    pinNote: 'The pin marks the peak; the Cave of Hira is just below it.',
    sources: [hadith('Sahih al-Bukhari 4715', 4715), hadith('Sahih Muslim 308', 7585)],
  },
  {
    id: 'badr',
    name: 'Badr',
    short: 'Badr',
    city: 'Madinah',
    lat: 23.78,
    lon: 38.79074,
    osm: 'node/1237968680 (the town of Badr)',
    pinNote: 'The pin marks the town of Badr.',
    sources: [{ label: 'Quran 3:123', url: 'https://quran.com/3:123' }],
  },
  // Al-Baqi' is approved but its outline was not in the downloads; added once it is.
];

/** The two mosques that distances are measured from. */
export const MOSQUES = PLACES.filter((p) => p.id === 'haram' || p.id === 'nabawi');

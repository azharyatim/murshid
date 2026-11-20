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
  /** Miqats are shown differently: with the region map and the miqat chip. */
  kind?: 'miqat';
  /** For a miqat: only what its sources say (who it is for). No rulings. */
  note?: string;
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

  // ---- Miqats (owner approved 18 Nov 2026). Positions: the "Miqat" monuments in
  // OpenStreetMap (export of 18 Nov 2026), each with a Wikidata link. Notes say only
  // who each miqat is for, as the cited hadith say. No rulings (stage 2, scholar review).
  {
    id: 'miqat-dhul-hulaifah',
    name: "Dhul-Hulaifah (Abyar 'Ali)",
    short: 'Dhul-Hulaifah',
    city: 'Madinah',
    lat: 24.4137405,
    lon: 39.5428117,
    osm: 'way/457470976 (Miqat Dhul Hulaifah, wikidata Q6783320)',
    kind: 'miqat',
    note: 'Miqat for the people of Madinah, and for others who come through it.',
    sources: [hadith('Sahih al-Bukhari 1477', 1477), hadith('Sahih al-Bukhari 1478', 1478)],
  },
  {
    id: 'miqat-juhfah',
    name: 'Al-Juhfah',
    short: 'Al-Juhfah',
    city: 'Makkah',
    lat: 22.7054134,
    lon: 39.146905,
    osm: 'way/456361985 (Miqat Al-Juhfah, wikidata Q12185431)',
    kind: 'miqat',
    note: 'Miqat for the people of Sham, and for others who come through it.',
    sources: [hadith('Sahih al-Bukhari 1477', 1477), hadith('Sahih al-Bukhari 1478', 1478)],
  },
  {
    id: 'miqat-qarn',
    name: 'Qarn al-Manazil (As-Sayl al-Kabir)',
    short: 'Qarn al-Manazil',
    city: 'Makkah',
    lat: 21.6334899,
    lon: 40.4275143,
    osm: 'way/457491862 (Miqat Qarn Al Manazil, wikidata Q12232506)',
    kind: 'miqat',
    note: 'Miqat for the people of Najd, and for others who come through it.',
    sources: [hadith('Sahih al-Bukhari 1477', 1477), hadith('Sahih al-Bukhari 1478', 1478)],
  },
  {
    id: 'miqat-yalamlam',
    name: "Yalamlam (As-Sa'diyyah)",
    short: 'Yalamlam',
    city: 'Makkah',
    lat: 20.51715,
    lon: 39.8711027,
    osm: 'way/456362592 (Miqat Yalamlam, wikidata Q3595659)',
    kind: 'miqat',
    note: 'Miqat for the people of Yemen, and for others who come through it.',
    sources: [hadith('Sahih al-Bukhari 1477', 1477), hadith('Sahih al-Bukhari 1478', 1478)],
  },
  {
    id: 'miqat-dhat-irq',
    name: "Dhat 'Irq",
    short: "Dhat 'Irq",
    city: 'Makkah',
    lat: 21.930132,
    lon: 40.42565,
    osm: 'way/457487766 (Miqat Dhaatu IRQ, wikidata Q12212593)',
    kind: 'miqat',
    note: "Miqat for the people of Iraq. The narrations differ on who set it: one says the Prophet \u{FDFA} set it; another says Umar did.",
    sources: [
      hadith('Sunan Abi Dawud 1740 (the Prophet \u{FDFA})', 22244),
      hadith("Sunan an-Nasa'i 2661 (the Prophet \u{FDFA})", 17397),
      hadith('Bulugh al-Maram 833, citing al-Bukhari (Umar)', 49950),
    ],
  },
];

export const MIQATS = PLACES.filter((p) => p.kind === 'miqat');

/** The two mosques that distances are measured from. */
export const MOSQUES = PLACES.filter((p) => p.id === 'haram' || p.id === 'nabawi');

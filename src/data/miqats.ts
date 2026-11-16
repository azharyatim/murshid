// The miqats: the places where a pilgrim coming for Umrah enters ihram.
//
// WHAT IS SOURCED: the names, and which pilgrims each one is for, come from
// the hadith below. Each quotation is copied from the Hadith tool's output
// (https://search.hadith-mcp.org), with the URL the tool gave. The tool gives
// no authenticity grade for these rows, so none is shown.
//
// WHAT IS PLACEHOLDER: `direction` is the compass direction from Makkah as
// stated in the Bulugh al-Maram commentary the tool returned (hadith 830 and
// 833). The schematic map uses it only to place pins around Makkah. No
// coordinates or distances are shown, because no verifiable coordinates could
// be fetched yet (OpenStreetMap was unreachable). Add them in stage 3.
//
// FOR SCHOLAR REVIEW: see `note` on Dhat Irq, and the list of questions in
// docs/HANDOVER.md.

export interface MiqatSource {
  label: string;
  quote: string;
  url: string;
}

export interface Miqat {
  id: string;
  name: string;
  /** Who it is for, in the words of the hadith. */
  forPeople: string;
  /** Compass bearing from Makkah in degrees (0 = north, 90 = east). Placeholder for placing the pin. */
  bearing: number;
  direction: string;
  sources: MiqatSource[];
  note?: string;
}

const BUKHARI_1478: MiqatSource = {
  label: 'Sahih al-Bukhari 1478, narrated by Ibn Abbas',
  quote:
    'The Prophet (p.b.u.h) fixed Dhul-Hulaifa as the Miqat for the people of Medina, Al-Juhfa for the people of Sham, Qarn-al-Manazil for the people of Najd, and Yalamlam for the people of Yemen; and these Mawaqit are for those living at those very places, and besides them for those whom come through them with the intention of performing Hajj and Umra; and whoever is living within these Mawaqit should assume lhram from where he starts, and the people of Mecca can assume Ihram from Mecca.',
  url: 'https://search.hadith-mcp.org/?id=1478',
};

export const MIQATS: Miqat[] = [
  {
    id: 'dhul-hulaifah',
    name: 'Dhul-Hulaifah',
    forPeople: 'The people of Madinah, and others who pass through it intending Hajj or Umrah.',
    bearing: 355,
    direction: 'north of Makkah',
    sources: [BUKHARI_1478],
  },
  {
    id: 'al-juhfah',
    name: 'Al-Juhfah',
    forPeople: 'The people of Sham, and others who pass through it intending Hajj or Umrah.',
    bearing: 315,
    direction: 'north-west of Makkah',
    sources: [
      BUKHARI_1478,
      {
        label: "Sunan al-Nasa'i 2658, narrated by Aishah",
        quote: 'Al-Juhfah for the people of Ash-sham and Eguypt',
        url: 'https://search.hadith-mcp.org/?id=17394',
      },
    ],
  },
  {
    id: 'qarn-al-manazil',
    name: 'Qarn al-Manazil',
    forPeople: 'The people of Najd, and others who pass through it intending Hajj or Umrah.',
    bearing: 95,
    direction: 'east of Makkah',
    sources: [BUKHARI_1478],
  },
  {
    id: 'yalamlam',
    name: 'Yalamlam',
    forPeople: 'The people of Yemen, and others who pass through it intending Hajj or Umrah.',
    bearing: 185,
    direction: 'south of Makkah',
    sources: [BUKHARI_1478],
  },
  {
    id: 'dhat-irq',
    name: "Dhat 'Irq",
    forPeople: 'The people of Iraq.',
    bearing: 45,
    direction: 'north-east of Makkah',
    sources: [
      {
        label: "Sunan al-Nasa'i 2658, narrated by Aishah",
        quote: "Dhat 'Irq fro the people of al-Iraq",
        url: 'https://search.hadith-mcp.org/?id=17394',
      },
      {
        label: 'Sahih al-Bukhari 1479, narrated by Ibn Umar',
        quote:
          'When these two towns (Basra and Kufa) were captured, the people went to `Umar and said, "O the Chief of the faithful believers! The Prophet (ﷺ) fixed Qarn as the Miqat for the people of Najd, it is beyond our way and it is difficult for us to pass through it." He said, "Take as your Miqat a place situated opposite to Qarn on your usual way. So, he fixed Dhatu-Irq (as their Miqat).',
        url: 'https://search.hadith-mcp.org/?id=1479',
      },
    ],
    note: "The two reports above differ on who set Dhat 'Irq: Aishah's report names it among those the Prophet designated, while Ibn Umar's report says Umar fixed it. Scholars have discussed this. It is flagged for scholar review and no ruling is given here.",
  },
];

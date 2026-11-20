# Murshid: handover brief

You are taking over an in-progress project from another session. This brief is everything you know about it; the earlier conversation is not available to you. Read it fully before doing anything, then look at the code and the screenshots in `docs/`.

## What this is

**Murshid: Umrah and Madinah Guide** is a mobile-first web app that guides a pilgrim through Umrah on a 3D city model, and shows the usual places of interest around Makkah and Madinah. (Renamed from "Umrah Step by Step" by the owner, who widened the scope to a Makkah and Madinah guide.) The owner is a UX designer, not a developer. They judge the work by screenshots and plain-language explanations, and they make the design and religious-content decisions. You make the technical ones.

The repository is `azharyatim/murshid`, branch `main`. Work has been committed straight to `main` and pushed after every change; keep doing that unless the owner says otherwise.

## How the owner wants to work

These came from the owner's original brief and from how the session went. Treat them as standing rules.

- **Build in stages and stop for approval.** Update the preview page at the end of each stage and wait. Do not run ahead into the next stage.
- **Mobile only.** Test at a 390px-wide viewport. The owner explicitly dropped desktop mockups. On wide screens the mobile layout is simply centred.
- **Show work through the preview page, not screenshots** (owner's request, 13 November 2026). After each change, rebuild and republish the private preview page (see "Private preview page") and give the owner the link. Send screenshots only when they ask.
- **Ask before deciding anything religious or visual.** Ask questions in batches of at most four. Where scholars differ, say so and let the owner (and later the app's user) choose.
- **Explain in plain language.** No jargon without a gloss. The owner asked the previous session to choose the tech stack for them.
- **Say what is real and what is placeholder.** The owner has been told, on screen and in chat, whenever something is illustrative. Keep that up; it is why they trust the screenshots.
- **Design direction is theirs.** They said they will give further direction on the interface design later. Do not restyle the interface on your own initiative.

## Hard constraints on content

Religious accuracy is the biggest risk in this project. A wrong dua or ruling in a pilgrim's hands is a real harm, so these are not negotiable.

- **Never write a dua, verse or hadith from memory.** Quran text and translations come from the Quran MCP tools; hadith come from the Hadith MCP tools. Call each server's `fetch_grounding_rules` first in your session and follow what it returns.
- **Show the source.** Each dua shows Arabic, transliteration, meaning, citation, the authenticity grade where the tool gives one, and the URL the tool returns. Never invent or substitute a URL. If the tool gives no grade, say the grade is not available.
- **If no specific dua is narrated for a step, the app says so.** Do not fill the gap.
- **No unverified rulings.** Fiqh explanations are researched from named published sources and cited in the app. Keep a running list of every ruling so a scholar the owner trusts can review it before launch.
- **Respectful depiction.** The Haram, the Kaabah and the Prophet's Mosque are simple massing. Pilgrims are abstract dots ("nodes"), never figures. Never render an image of a person.
- **Never invent fares, timings or distances.** Walking distances are computed from coordinates. Transport information is researched, cited, dated with a "last checked" date, and marked unverified where it is.
- **Accessibility.** Sufficient contrast, reduced-motion support, keyboard access, 44px touch targets.

## Decisions already made

Do not re-ask these.

| Topic | Decision |
|---|---|
| Madhhab | The user picks from the four Sunni schools; Shafi'i is the default. Each difference is shown as a sourced note. |
| Audience | First-time pilgrims, with a compact "quick mode" for repeat pilgrims. |
| Gender | A men/women setting tailors each step. |
| Language | English interface. Duas in Arabic with transliteration and meaning. |
| City data | Real OpenStreetMap buildings and roads, fetched once at build time and shipped with the app. The app never calls a map server at runtime. Missing building heights are estimated and labelled as estimates. |
| Tech stack | Vite, React, TypeScript, Three.js used directly (no react-three-fiber). |
| Hosting | Vercel. Not set up yet. |
| Offline | Full offline PWA: steps, duas, the 3D city and places all work with no connection. Not built yet. |
| Progress tracking | Not for now; maybe later. |
| Tap counter for Tawaf and Sa'i | No. The circuit and lap counters belong to the animation only. |
| Rulings | Cited sources, flagged for scholar review. |
| Bus timetable | The owner does not have one. Check csmadinah.com and mark anything found as unverified with a date. |

## Features to build

From the owner's original brief.

1. **Step-by-step Umrah.** Seven steps, each with a short explanation, the recommended duas, and an animation of travelling nodes:
   1. Ihram and miqat: nodes arrive at the miqat. Show all the miqat areas.
   2. Niyyah and talbiyah.
   3. Entering Masjid al-Haram.
   4. Tawaf: many nodes circle the Kaabah anticlockwise, seven circuits from the Black Stone line, with a circuit counter.
   5. Two rak'ah at Maqam Ibrahim, and Zamzam.
   6. Sa'i: nodes shuttle between Safa and Marwa, seven laps, starting at Safa and ending at Marwa.
   7. Halq or taqsir.

   Verify the sequence and details against sources, and ask the owner about every madhhab difference you find.
2. **Duas**, under the content rules above.
3. **Places to visit in Makkah and Madinah.** Each has a short description, how to get there from the Haram or the Prophet's Mosque (walking time, taxi, bus, Haramain train where relevant) and a map link.
4. **Madinah bus route.** Highlight the City Sightseeing "Official Tour" route with a bus node travelling the loop. The owner photographed the bus stop poster and transcribed it:
   - **Green line:** 1 Al Masjid Al Nabawi (King Fahad Gate No. 334); 2 Al-Baqi' (Expo of Holy Quran); 3 Al Manakha Square (Al Ghamma Mosque, start of path Al Sunnah); 4 Alsalam Gate (Gate of Visit, Saqefah Bani Saedah).
   - **Red line:** 5 Ohud Battlefield (Romah Mountain, Ohud Graveyard of Martyrs); 6 Al-Noor Mall (restaurants, shops, amusement); 7 Sultana Road (Abu Baker Al Saddiq Road, restaurants and shops); 8 Al Quiblatain Mosque; 9 The Trench Battlefield (marked temporarily closed) / Seven Mosques; 10 Masjid Quba (end of path Al Sunnah); 11 Al Hijaz Railway Station (Dar Al Qalam Museum, Anbarieh Mosque); 12 Quba Boulevard.
   - **Contact on the poster:** 920014044, 050 049 1600, www.csmadinah.com, @CSMadinah, with a booking QR code.
   - The poster shows no timings or prices. Show stop 9 as temporarily closed.

## The agreed stages

1. Visual style on a sample of the city. **In progress; see below.**
2. Verified Umrah sequence and duas, with madhhab questions for the owner. **Not started. It does not depend on map data.**
3. The Makkah city model and the seven step animations, including a zoomed-out regional view for the miqats.
4. Places in Makkah and Madinah.
5. The Madinah bus route.
6. Offline install, accessibility checks and Vercel deployment.

## What exists now

One screen: an overview map of the Haram area with a bottom sheet.

- **Map behaviour.** The default is a north-up aerial view framed so that every step pin is visible. Map-style gestures (owner's request, after nuzul-atlas.app, which the session could not reach): one finger drags the map; two fingers pinch to zoom towards the point between them and drag to move. Two-finger gestures are locked once recognised (owner's request, 16 Nov 2026, after pinches turned and tilted the map by accident): pinch zooms (and the pair can drag), twist rotates, both fingers sliding up or down tilt. See `setupTwoFingerGestures` in `src/scene/CityScene.ts`. Pins and city names let touches through; taps are matched in `tapAt` in `src/App.tsx`. Four on-map buttons (zoom in, zoom out, rotate, 2D/3D tilt) make it keyboard-accessible.
- **Pins.** Steps 3 to 7 are numbered pins on the map. Steps 1 and 2 happen at the miqat, tens to hundreds of kilometres away, so they are a "1 2 At the miqat, before Makkah" chip at the top. The plan is for that chip to open a regional miqat view in stage 3. The owner has not confirmed this approach.
- **Sheet.** Names the selected step, shows a one-line summary, and has a row of seven number buttons. "Show all" returns to the aerial view.
- **Nodes.** 150 dots circle the Kaabah anticlockwise. They stop when the device asks for reduced motion.

Three looks exist side by side, chosen by a URL parameter:

| URL | Look |
|---|---|
| (none) | **Plain Clay.** White boxes on a flat grid. The current default. The owner called it boring but "definitely an option". |
| `?look=model` | **White model.** Illustrative terraced hills, irregular districts, warm sunlight with cool shadows, ambient occlusion. |
| `?look=cyan` | **Cyan.** The model look with cyan buildings on light grey ground, a white mosque, orange nodes, and windows drawn in the building shader. Based on an isometric reference image the owner sent. |

Screenshots of all of these are in `docs/stage-1/` and `docs/look-mockup/`.

### Files

- `src/App.tsx`: the screen, pins, map controls, and the `?look=` switch.
- `src/scene/CityScene.ts`: the Three.js scene, camera moves, pin projection, the window shader, and the post-processing setup.
- `src/scene/sampleCity.ts`: placeholder grid city for the plain look.
- `src/scene/modelCity.ts`: illustrative hills and irregular city for the model and cyan looks.
- `src/themes.ts`: scene colours for the three looks.
- `src/data/steps.ts`: the seven steps with pin positions.
- `src/styles.css`: interface styles (Hanken Grotesk, green accent `#18794a`).
- `scripts/fetch-osm.mjs`: downloads OpenStreetMap data from Overpass. Written but has never succeeded; see the blocker below.

### What is placeholder, and must not be mistaken for real

- **Every building, road and hill.** Nothing in the scene comes from map data. `modelCity.ts` invents hills that imitate Makkah's character; their positions are made up.
- **Pin positions.** `steps.ts` places Safa, Marwa and the others from rough coordinates relative to the Kaabah. The entrance pin (step 3) is an arbitrary example, deliberately not tied to a named gate, because which gate to enter by is a religious question that has not been researched.
- **The Haram massing.** An octagonal ring, a long box for the Mas'a and eight cylinders for minarets. It is a stand-in, not derived from the real building.
- **Step summaries.** They only restate the owner's brief. No explanation, dua or ruling has been researched yet.

### Not verified

- **Real phones.** Everything has been checked only in headless Chromium at 390px. Touch gestures have not been tried on a device. The ambient occlusion pass in the model and cyan looks is the expensive part and may need to be reduced or switched off on slower phones. The shader windows should cost almost nothing but that is unmeasured.
- **Rounded building edges** were suggested to the owner and are not implemented; they need a different way of building the geometry.

## Open questions waiting on the owner

Ask these first. They were the last things put to the owner and none has been answered.

1. **Which look becomes the default:** plain Clay, white model, cyan, or cyan with adjustments? The cyan buildings read more teal than the reference because their shaded sides darken; lightening them or flattening the shading was offered. If cyan wins, the green interface accent clashes with the orange nodes and should change, which is the owner's call.
2. **How to get real map data** (see the blocker).
3. **Whether to start stage 2 now**, since it does not need the map.

## Real map data: update

The owner downloaded the OpenStreetMap export by hand through Overpass Turbo; the direct Overpass link returned 406 in their browser, and the servers are still unreachable from the sessions. The raw file is `data/raw/makkah-haram.json` (gitignored; ask the owner to attach it again if it is missing). `node scripts/bake-osm.mjs makkah-haram` turns it into `public/data/makkah-haram.json`, which the app loads.

- Only `?look=cyan-light` (the owner's chosen Option A, with their beige ground #efe6d3) draws the real city. The other looks still show the illustrative city for comparison.
- The owner also supplied the `building:part` export (`data/raw/makkah-haram-parts.json`, gitignored). The bake replaces any outline that contains parts with its parts, so the Clock Towers, hotel towers, minarets and Haram galleries have their mapped heights. The Kaabah, Maqam Ibrahim and Hijr Isma'il stay as simple massing. 349 of 1343 shapes still have estimated heights.
- The ground is flat: no terrain source yet. Roof shapes (domes, sloping roofs) are drawn flat.
- Tilting from the default north-up view now looks from the north side (owner's choice), so the Clock Towers are behind the Haram and no pin is hidden. Pins that a building does hide are faded with a dotted border.
- Safa and Marwa pins now come from the ends of the Mas'a walkway in OSM. The other pins are still placeholders.
- The accent colour to replace the green is still the owner's decision.

## Places, first version (group 1) and the regional map

Built 15 November 2026 from three OpenStreetMap downloads the owner made (raw files in `data/raw/`, gitignored): `region.json`, `madinah-nabawi.json`, `madinah-nabawi-parts.json` (empty: no building parts are mapped around the Prophet's Mosque).

- `scripts/bake-region.mjs` makes `public/data/region.json`: main roads, the Haramain railway, the sea (built from the coastline), cities, towns and named features, in metres from a regional origin (`scripts/region-projection.mjs`, mirrored in `src/scene/projection.ts`). Run `node scripts/bake-region.mjs`.
- `scripts/bake-osm.mjs` now takes `makkah-haram` or `madinah-nabawi` (per-city settings in `CITIES`). Madinah: 338 buildings, 317 with estimated heights; the mosque, its Eastern Expansion and the 10 minarets within 300 m are drawn as the mosque.
- `src/data/places.ts`: the group 1 places with OSM positions and tool-fetched sources. Al-Baqi' is approved but not shown: its outline was not in the downloads.
- The scene places each city's 3D model at its real position on the regional map. Pins appear by zoom: far out only the city names (Makkah, Madinah) and Badr; within 60 km the places; within 8 km the Umrah step pins and the Safa/Marwa labels.
- Distances are straight-line (haversine) from the nearer of the two mosques. Walking routes are not built.
- Colours not in the Day scheme, set to the closest listed neutral pending the owner: sea #E6ECEF (page background), railway #6B7C99 (pin outline), links #0D1424 underlined (text colour).
- Not done yet: descriptions, walking routes, terrain, Al-Baqi', town names other than Makkah and Madinah.

## Accent and grey-ground looks

- The interface accent is now orange `#b8520b` (owner's choice). It is deeper than the map's `#e8771a` nodes so white text on it reaches 4.9:1; the node orange would give only 3:1.
- `?look=cyan-grey` (option A cyan on light grey ground) and `?look=clay-grey` (the first plain Clay look on light grey ground, with orange nodes) were added for comparison. Both use the real city. Comparison images are in `docs/grey-ground/`.

## Colour scheme: Murshid "Day" (current default)

The owner supplied the Day scheme on 13 November 2026 and asked for a colour-only change with exact hex values. It matches `CLAY_DAY` and `data-palette='day'` on branch `claude/admiring-johnson-oalgb6` (that branch also has a Night mode, not brought here).

- Interface tokens in `src/styles.css` `:root`: background #E6ECEF, sheets #FFFFFF, text #0D1424, muted #4A5873, lines #D3DBE4, accent gold #8A5A00 with white on it, pin outline #6B7C99, pin number #1E2A47.
- Scene `CLAY_DAY` in `src/themes.ts`: ground #DCE4EA, slabs #E3EAEF, roads #CBD5DF, buildings #C3D0E0, Haram teal #5EAABD, Kaabah #05070C, pilgrim dots midnight #0D1424, shadows at 0.6.
- Gold is only for selected/active items, the primary action and the focus ring. Teal is only for the Haram. No orange, green, cyan or purple; no #000000 text.
- Colours not yet defined by the owner: warnings, errors, success, disabled. Do not invent them; use the closest neutral and ask.
- The older looks (`?look=cyan-light` and others) still exist for comparison but use colours outside the scheme.

## Private preview page

The owner reviews on their phone through a private Claude page: https://claude.ai/artifact/TVMByBrJu5m5qKzZiPbjGL. It is built with `npx vite build --base ./ --outDir <scratch>/preview`, and the built `index.html` is reduced to its content (title, script, stylesheet, `#root`) because the Artifact tool adds the document wrapper. It now shows the Day scheme (the app's default). A second private preview page shows the Papercut look on its own (built with `VITE_DEFAULT_LOOK=papercut`), because preview pages cannot take a `?look=` address: https://claude.ai/artifact/A79DHetx7R2TMWyFCPkvt2. Republish to the same URL after changes.

## Scope change: Makkah and Madinah guide (owner's decisions)

- The app is now **Murshid: Umrah and Madinah Guide**. It shows the usual places of interest around Makkah and Madinah as well as the Umrah steps.
- **Navigation:** the default view shows Makkah and Madinah on one map; people zoom in and out to move between them. There are no tabs or home screen for now.
- **Far places** (Arafah, Jabal al-Nur, Uhud, Quba...) appear on a flat regional map with pins. The detailed 3D city is only around the Haram and the Prophet's Mosque. 3D around each place is a possible later feature.
- **Order:** places come next, before stage 2 (steps and duas). The owner approves the place list first: draft in `docs/places-draft.md`.
- **First version of places = group 1 only** (owner, 15 Nov 2026): Masjid al-Haram, Masjid al-Nabawi, Masjid Quba, Jabal Uhud, Al-Baqi', Jabal al-Nur / Cave of Hira, Badr — the places whose significance is already sourced. Needs the regional OpenStreetMap download (main roads, railway, coastline, towns and these places, bbox 21.1–24.8 N, 38.7–40.6 E) and the two Madinah downloads.
- **Place list merged** with the owner's own list (13 Nov 2026), which added Taif (Masjid Abdullah ibn Abbas, rose farms and factory), Badr, a date farm, Jabal al-Rumah and al-Hudaybiyah. The opening map shows Makkah and Madinah only; Taif and Badr are reached by zooming or dragging. Place names show the standard English spelling with the owner's spelling in brackets, e.g. "Jabal Thawr (Jabal Tsur)".
- The Madinah 3D core needs the same two OpenStreetMap downloads as Makkah (buildings and roads, then building parts), centred on the Prophet's Mosque.

## Miqat points on the map (owner approved 18 Nov 2026; in progress)

- Show the five miqats as pins on the existing map (Day and Papercut); the "1 2 At the miqat" chip will fly out to show them all.
- Sources (Hadith tool): Dhul-Hulaifah (Madinah), Al-Juhfah (Sham), Qarn al-Manazil (Najd), Yalamlam (Yemen): Sahih al-Bukhari 1477 and 1478 (tool ids 1477, 1478). Dhat 'Irq (Iraq): included at the owner's request, with BOTH accounts shown: set by the Prophet ﷺ (Abu Dawud 1740, tool id 22244; Nasa'i 2661, tool id 17397) and set by Umar (Bukhari as cited in Bulugh al-Maram 833, tool id 49950).
- Positions must come from OpenStreetMap (owner downloads; the session cannot reach Nominatim or Wikidata). Show only what the sources say: who each miqat is for and where it is. No rulings (stage 2 and scholar review).
- **Built 18 Nov 2026.** Positions: the "Miqat" monuments in the owner's OpenStreetMap export (`data/raw/miqat.json`, gitignored), each with a Wikidata link; see `MIQATS` in `src/data/places.ts`. Yalamlam is at 20.5 N, so the elevation bake now covers 20 to 25 N (3840 rows); this nudged the city patches by at most 1/255 (414 Makkah cells changed layer, at layer edges; none in Madinah).
- The "1 2 At the miqat" chip opens the miqat view: the five miqat pins framed on the region map, with only the Makkah name kept as the reference; choosing a step or another place leaves it. Tapping a miqat shows who it is for (from the hadith), its sources, and the straight-line distance from Masjid al-Haram.
- Wadi Mahram (way 1493000494) and al-Hada (node 5423164921) are mapped as miqats in OSM but named in no hadith in the Hadith tool (checked 20 Nov 2026; the miqat narrations name only Qarn for Najd). **Owner decision: show only the five for now.** Listed for scholar review: whether they should appear as a note on the Qarn al-Manazil panel.
- The Day look has no roads or coastline south of 21.1 N (its regional download stopped there), so Yalamlam sits on plain ground there; Papercut has elevation down to 20 N.
- Fixed a "ghost click": a map tap that opened the sheet moved the jump buttons under the finger, and the browser's follow-up click pressed one. Clicks within 600 ms and 30 px of a handled map tap are ignored.

## Bottom sheet collapsed by default (owner, 18 Nov 2026)

In every look the bottom sheet starts collapsed to a grab-handle bar with the current title, so the map has more room. Tapping the bar opens and closes it; choosing a step or a place opens it. See `sheetOpen` in `src/App.tsx` and `.sheet-toggle` in `src/styles.css`.

## Papercut look (?look=papercut), Stage A built 17 Nov 2026

Adopted from branch `claude/hopeful-heisenberg-a1p880` (not merged; reference code only), adapted to this prototype. Opens on a contour map in layered paper and turns into 3D buildings as you zoom into Makkah. Behind `?look=papercut`; every other look and the default are unchanged. A separate private preview page shows it (see "Private preview page").

- **Real:** the ground (Copernicus DEM GLO-30, 30 m, baked on that branch by `scripts/bake-terrain.mjs`, re-packed losslessly as greyscale PNGs by `scripts/terrain-to-png.mjs` (preview pages cannot serve .bin files) into `public/data/terrain-*.png`; attribution "Contains modified Copernicus data", shown on the map) and the buildings (this prototype's OpenStreetMap footprints and heights, not the branch's generated stand-ins). Clock Towers label position: from the OSM relation.
- **Guessed:** building type for colour. Tagged hotels, shops and homes use their tags; anything 120 m or taller is a tower; untagged buildings are a guess (30 m or taller: hotel; lower and within 400 m of the Haram: shop; otherwise home), marked `g: 1` in `public/data/*.json`.
- **Code:** `src/scene/papercut.ts` (colours, zoom distances, paper painter that converts the branch's Mercator terrain into this scene's projection), `setupPaper` / `updatePaper` in `src/scene/CityScene.ts`, `paperBuildingGeometry` in `realCity.ts`, legend and landmark labels in `App.tsx`.
- **Zoom distances** (camera to city centre), scaled 1.2x from the branch because the real buildings cover about 1.8 km: ground patch fades in 84 to 26 km, footprints 36 to 11 km, buildings rise 3.5 to 1.45 km. Pins fade inside their ranges so sets hand over without overlapping.
- **Colours:** the owner's (exact) for ground layers 1 to 3 and all objects. Placeholders (not chosen by the owner): ground layers 4 to 8 `#EEC98E #F0B47B #E49469 #DC8669 #EECCBA`, water and map background `#2F7A7C`. Green Dome `#62A69A` is not used yet.
- **Stage B (built 18 Nov 2026, awaiting approval):** Madinah rises too (real OSM buildings; the Green Dome, mapped as a 6 m shape inside the mosque's 13 m outline, is set on the roof in placeholder #62A69A). Jump buttons Region / Makkah / Madinah in a bottom-left stack with the Key. A TEMPORARY readout under them (owner's request) shows camera distance, stage and frame rate; remove it once tuning is done (`.paper-readout` in App.tsx). Performance: the nodes only animate, and the screen only redraws, while they are visible; frame rate is counted only while redrawing ("still" otherwise). Footprints are lifted just above the ground patch so low ones are not hidden.
- **Owner's decisions (17 Nov 2026):** keep the homes colour for now; the colour key is a Key button, closed by default; elevation widened to 38 to 41 E (re-baked, 12 Copernicus tiles) so Badr and its coast are on land.
- **Measured on a real phone (owner, Honor Magic 7 Pro, 20 Nov 2026):** 3D city standing still 60 fps (the phone's idle refresh cap), while dragging 70 to 100 fps; Madinah similar. Well above the 30 fps goal, so no detail reduction is needed for that phone. Not yet measured on a mid-range or older phone.
- **Middle ring (owner, 20 Nov 2026):** each city also has a 32 km ground patch with 62.5 m cells (`terrain-makkah-mid.png`, `terrain-madinah-mid.png`, about 110 KB together), fading in from 170 to 70 km, under the sharp 8 km patch. Views of about 10 to 40 km are now crisp; the hand-over to the region map shows as a soft blend around 70 to 120 km.
- **Known limits:** the region ground is 145 m per cell, so beyond the middle ring (more than about 16 km from a city) it still looks stepped; frame rate not measured on a real phone.

## Later feature ideas from the owner (not scheduled)

- **Hotels.** Colour hotels differently, and let a pilgrim find their own hotel and see the walking route to the Haram. In the current export 158 of 413 outlines are tagged as hotels (127 named); unmarked buildings may be hotels too, so this must be labelled as incomplete.

## Look comparison: green

`?look=green` is option A's lighting with mint green buildings (#5ccf9c base, renders near the owner's sample #6edbad) on very light grey ground (#ebedee), from a second watermarked reference image the owner sent (not committed). Also drawn on the real city.

## Blocker: real map data (history)

The owner chose real OpenStreetMap data, but the previous session could not download it.

- `overpass-api.de` and `overpass.private.coffee` were both added to the environment's network allowlist with the owner's approval. From that session, the first dropped the connection during the TLS handshake every time and the second accepted the request and never answered. This was retried on two separate days.
- Your session may be on a different environment or network. Try `node scripts/fetch-osm.mjs makkah-haram 21.4225 39.8262 900` once before assuming it is still blocked. If the host is refused outright by the proxy, the allowlist does not apply to your environment and you will need to ask.
- Three ways forward were offered to the owner, who has not chosen:
  1. The owner opens an Overpass link in their own browser, saves the file and attaches it. Most reliable.
  2. Fetch it through a short-lived sandbox in the owner's Vercel account, which has its own network. This creates a temporary resource in their account, so get a yes first.
  3. Keep retrying.
- **Terrain** needs an elevation source as well. None has been identified or tested. Public Google Cloud Storage buckets were reachable from the previous session, which may help.
- The intended pipeline is: raw Overpass JSON in `data/raw/` (gitignored), then a bake script (not written) that converts it to a compact file of building footprints with heights and road lines in metres from a local origin, shipped in `public/data/`. The scene would then load that in place of the generators.

## Working notes

- **Run it:** `npm install`, then `npm run dev` (port 5173). `npm run build` type-checks and builds; it passes as of the last commit.
- **Screenshots:** Playwright and Chromium are preinstalled; do not install them again. WebGL in headless mode needs the launch flags `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Wait several seconds after loading before capturing the model and cyan looks, which are slow to render in software. Use a 390x844 viewport at `deviceScaleFactor: 2` for anything the owner will see, and send the images to them rather than only saving them.
- **The dev server does not survive between turns.** Check it responds and restart it before each screenshot run.
- **Reference images are not in the repository.** The owner sent two white-clay city renders, one isometric illustration with cyan buildings, and a photo of the Madinah bus poster. The first three are watermarked stock images, so they were deliberately not committed. Ask the owner to attach them again if you need to see them. The poster's contents are transcribed in full above.
- **Do not put the owner's name or email into requests to outside services.**

## What to do first

1. Read the code and look at every screenshot in `docs/`.
2. Run the app and take your own 390px screenshot of each look, to confirm your environment renders what the screenshots show.
3. Try the map download once.
4. Tell the owner, briefly, where things stand and ask the three open questions.
5. Do not start stage 2 or change the default look until they answer.

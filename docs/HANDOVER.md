# Murshid: handover brief

You are taking over an in-progress project from another session. This brief is everything you know about it; the earlier conversation is not available to you. Read it fully before doing anything, then look at the code and the screenshots in `docs/`.

## What this is

**Murshid: Umrah Step by Step** is a mobile-first web app that guides a pilgrim through Umrah on a 3D city model. The owner is a UX designer, not a developer. They judge the work by screenshots and plain-language explanations, and they make the design and religious-content decisions. You make the technical ones.

The repository is `azharyatim/murshid`, branch `main`. Work has been committed straight to `main` and pushed after every change; keep doing that unless the owner says otherwise.

## How the owner wants to work

These came from the owner's original brief and from how the session went. Treat them as standing rules.

- **Build in stages and stop for approval.** Show screenshots at the end of each stage and wait. Do not run ahead into the next stage.
- **Mobile only.** Test and screenshot at a 390px-wide viewport. The owner explicitly dropped desktop mockups. On wide screens the mobile layout is simply centred.
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

- **Map behaviour.** The default is a north-up aerial view framed so that every step pin is visible. One finger rotates and tilts, two fingers pinch to zoom and drag to move. Four on-map buttons (zoom in, zoom out, rotate, 2D/3D tilt) make it keyboard-accessible.
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

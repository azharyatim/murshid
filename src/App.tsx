import { useEffect, useRef, useState } from 'react';
import { CityScene, type Look, type PaperStage, type Pin } from './scene/CityScene';
import {
  CLAY,
  CLAY_CYAN,
  CLAY_CYAN_FLAT,
  CLAY_CYAN_GREY,
  CLAY_CYAN_LIGHT,
  CLAY_DAY,
  CLAY_GREEN,
  CLAY_MODEL,
  CLAY_PAPERCUT,
  CLAY_PLAIN_GREY,
} from './themes';
import { PAPER_OWNER, PAPER_STAGES } from './scene/papercut';
import { MARWA, SAFA, STEPS } from './data/steps';
import { MOSQUES, PLACES as SITES, type Place } from './data/places';
import { loadCity, loadRegion, type CityData, type RegionData } from './scene/realCity';
import { distanceMetres, regionXZ } from './scene/projection';

// The overview screen: an aerial map of the Haram with a numbered pin for
// each Umrah step, and a sheet that names the selected step.

const MAP_STEPS = STEPS.filter((s) => s.pos !== null);
const MIQAT_STEPS = STEPS.filter((s) => s.pos === null);
// Labels inside the Haram (positions in metres from the Kaabah).
const PLACES: { name: string; pos: [number, number] }[] = [
  { name: 'Safa', pos: SAFA },
  { name: 'Marwa', pos: MARWA },
];

// With the regional map, which pins show depends on how far out the view is (metres).
const CITY_VIEW = 60_000; // further out than this: only city names (and Badr)

/** Papercut: the legend's colours (the owner's). */
const PAPER_LEGEND = [
  { name: 'Hotels', colour: PAPER_OWNER.hotel },
  { name: 'Shops', colour: PAPER_OWNER.shop },
  { name: 'Homes', colour: PAPER_OWNER.home },
  { name: 'Mosque', colour: PAPER_OWNER.mosque },
  { name: 'Towers', colour: PAPER_OWNER.tower },
];
const CITY_LABELS = [
  { name: 'Makkah', placeId: 'haram' },
  { name: 'Madinah', placeId: 'nabawi' },
];

/** Papercut readout: a camera distance in plain units. */
function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : m < 20_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
}

/** Papercut: extra landmark labels, from the map data. */
function paperLandmarks(c: CityData): { name: string; pos: [number, number] }[] {
  const list: { name: string; pos: [number, number] }[] = [{ name: 'Kaabah', pos: [0, 0] }];
  if (c.landmarks.towers) list.push({ name: 'Abraj al-Bait (Clock Towers)', pos: c.landmarks.towers });
  return list;
}

/** Papercut: the Green Dome label (Madinah), at the dome's mapped outline, in regional metres. */
function greenDome(m: CityData | null): [number, number] | null {
  const b = m?.buildings.find((x) => x.dome);
  if (!m || !b) return null;
  const r = b.rings[0];
  let x = 0;
  let z = 0;
  for (let i = 0; i < r.length; i += 2) {
    x += r[i];
    z += r[i + 1];
  }
  const [ox, oz] = regionXZ(m.origin.lat, m.origin.lon);
  return [ox + x / (r.length / 2), oz + z / (r.length / 2)];
}

/** How far to stand back when a place is chosen (metres). */
function focusDistance(p: Place) {
  if (p.id === 'badr') return 6000;
  return p.id === 'haram' || p.id === 'nabawi' ? 1500 : 2500;
}

/** Straight-line distance from the nearer of the two mosques, in plain words. */
function distanceText(p: Place) {
  if (MOSQUES.some((m) => m.id === p.id)) return null;
  const [m, d] = MOSQUES.map((m) => [m, distanceMetres(m, p)] as const).sort((a, b) => a[1] - b[1])[0];
  const amount = d < 1000 ? `${Math.round(d / 50) * 50} m` : d < 20_000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 1000)} km`;
  return `About ${amount} from ${m.short}, in a straight line. Walking and travel routes come later.`;
}

// The plain look stays the default until the model look is approved.
// Add ?look=model or ?look=cyan to the address to see the mockups.
// ?look=cyan-light and ?look=cyan-flat are two ways of keeping the cyan from turning teal.
// A build can choose the look that opens by default with VITE_DEFAULT_LOOK (used for preview pages).
// The owner's Day colour scheme is the default; the older looks remain for comparison only.
const LOOK_PARAM = new URLSearchParams(window.location.search).get('look') ?? import.meta.env.VITE_DEFAULT_LOOK ?? 'day';
const THEMES = {
  plain: CLAY,
  model: CLAY_MODEL,
  cyan: CLAY_CYAN,
  'cyan-light': CLAY_CYAN_LIGHT,
  'cyan-flat': CLAY_CYAN_FLAT,
  green: CLAY_GREEN,
  'cyan-grey': CLAY_CYAN_GREY,
  'clay-grey': CLAY_PLAIN_GREY,
  day: CLAY_DAY,
  papercut: CLAY_PAPERCUT,
} as const;
const LOOK_KEY = (LOOK_PARAM in THEMES ? LOOK_PARAM : 'plain') as keyof typeof THEMES;
// Every cyan option and the green look use the 'cyan' scene setup (lighting, drawn windows).
const LOOK: Look =
  LOOK_KEY.startsWith('cyan') || LOOK_KEY === 'green' || LOOK_KEY === 'day' ? 'cyan' : LOOK_KEY === 'clay-grey' ? 'plain' : (LOOK_KEY as Look);
// ?look=papercut: a contour map of real elevation that turns into 3D buildings on zoom.
const PAPER = LOOK === 'papercut';
// Closer than this: the Umrah step pins and Haram labels. Papercut shows them as the buildings rise.
const STREET_VIEW = PAPER ? PAPER_STAGES.growStart : 8_000;
const SCENE_THEME = THEMES[LOOK_KEY];
// Option A (cyan-light), green, cyan-grey and clay-grey are drawn on real OpenStreetMap data; the other looks
// keep the illustrative city so they can still be compared.
const REAL_CITY = ['cyan-light', 'green', 'cyan-grey', 'clay-grey', 'day', 'papercut'].includes(LOOK_KEY);

export function App() {
  const [selected, setSelected] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [tilted, setTilted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  // Papercut: the colour key is closed by default (owner's choice) and opened with its button.
  const [keyOpen, setKeyOpen] = useState(false);
  const [paperStage, setPaperStage] = useState<PaperStage | null>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const pinEls = useRef(new Map<string, HTMLElement>());

  const [city, setCity] = useState<CityData | null>(null);
  const [cityError, setCityError] = useState(false);
  // The regional map and Madinah. If they fail to load, the app falls back to Makkah alone.
  const [regional, setRegional] = useState<{ region: RegionData; madinah: CityData | null } | null>(null);
  const [regionTried, setRegionTried] = useState(false);

  useEffect(() => {
    if (!REAL_CITY) return;
    loadCity('makkah-haram').then(setCity, () => setCityError(true));
    Promise.all([loadRegion(), loadCity('madinah-nabawi').catch(() => null)])
      .then(([region, madinah]) => setRegional({ region, madinah }))
      .catch(() => setRegional(null))
      .finally(() => setRegionTried(true));
  }, []);

  // Scene positions: metres from the Kaabah, or regional metres when the regional map is shown.
  const makkahOffset: [number, number] = regional && city ? regionXZ(city.origin.lat, city.origin.lon) : [0, 0];
  const toScene = (p: [number, number]): [number, number] => [p[0] + makkahOffset[0], p[1] + makkahOffset[1]];
  const sitePos = (p: Place) => regionXZ(p.lat, p.lon);
  const showRegion = Boolean(regional && city);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (REAL_CITY && ((!city && !cityError) || !regionTried))) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const regionNow = regional && city ? regional : null;
    const points = regionNow
      ? MOSQUES.map(sitePos)
      : [...MAP_STEPS.map((s) => s.pos!), ...PLACES.map((p) => p.pos)];
    const scene = new CityScene(canvas, SCENE_THEME, mq.matches, points, LOOK, city, regionNow);
    const pins: Pin[] = [];
    const street = regionNow ? { maxDist: STREET_VIEW } : {};
    MAP_STEPS.forEach((s) => pins.push({ el: pinEls.current.get(`step-${s.n}`)!, pos: toScene(s.pos!), ...street }));
    PLACES.forEach((p) => pins.push({ el: pinEls.current.get(`place-${p.name}`)!, pos: toScene(p.pos), ...street }));
    if (PAPER && regionNow && city) {
      paperLandmarks(city).forEach((l) => pins.push({ el: pinEls.current.get(`place-${l.name}`)!, pos: toScene(l.pos), ...street }));
      const dome = greenDome(regionNow.madinah);
      if (dome) pins.push({ el: pinEls.current.get('place-Green Dome')!, pos: dome, maxDist: STREET_VIEW });
      scene.setLegend(legendRef.current);
      scene.onPaperStage = setPaperStage;
    }
    if (regionNow) {
      SITES.forEach((p) => {
        // Badr stays visible from far out; the others appear once a city fills the view.
        // The Haram's own pin gives way to the step pins up close.
        const range = p.id === 'badr' ? {} : { maxDist: CITY_VIEW, ...(p.id === 'haram' ? { minDist: STREET_VIEW } : {}) };
        pins.push({ el: pinEls.current.get(`site-${p.id}`)!, pos: sitePos(p), ...range });
      });
      CITY_LABELS.forEach((c) => {
        const p = SITES.find((s) => s.id === c.placeId)!;
        pins.push({ el: pinEls.current.get(`city-${c.name}`)!, pos: sitePos(p), minDist: CITY_VIEW });
      });
    }
    scene.setPins(pins);
    sceneRef.current = scene;
    // Test builds only: lets automated tests read the camera. Not in the preview or the app.
    if (import.meta.env.DEV) (window as unknown as { __scene: CityScene }).__scene = scene;
    const onChange = () => scene.setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [city, cityError, regional, regionTried]);

  const choose = (n: number | null) => {
    setSelected(n);
    setPlaceId(null);
    const step = STEPS.find((s) => s.n === n);
    if (step?.pos) sceneRef.current?.focus(toScene(step.pos));
    else sceneRef.current?.showAll();
    setTilted(Boolean(step?.pos));
  };

  const choosePlace = (p: Place) => {
    setSelected(null);
    setPlaceId(p.id);
    sceneRef.current?.focus(sitePos(p), focusDistance(p));
    setTilted(true);
  };

  /** Tapping a city name zooms to the whole city, looking straight down. */
  const openCity = (placeId: string) => {
    const p = SITES.find((s) => s.id === placeId)!;
    sceneRef.current?.lookDownAt(sitePos(p), 25_000);
    setTilted(false);
  };

  // Pins let touches through to the map (so pinching over a city name zooms the
  // map). A quick tap that did not move is matched to the pin under it here.
  const tapStart = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const pointersDown = useRef(0);
  const onMapPointerDown = (e: React.PointerEvent) => {
    pointersDown.current += 1;
    tapStart.current = pointersDown.current === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId } : null;
  };
  const onMapPointerUp = (e: React.PointerEvent) => {
    pointersDown.current = Math.max(0, pointersDown.current - 1);
    const start = tapStart.current;
    tapStart.current = null;
    if (!start || start.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8 || e.timeStamp - start.t > 600) return;
    tapAt(e.clientX, e.clientY);
  };
  const tapAt = (x: number, y: number) => {
    let best: { el: HTMLElement; d: number } | null = null;
    for (const el of pinEls.current.values()) {
      if (el.tagName !== 'BUTTON' || el.style.visibility !== 'visible') continue;
      // A city name's visible box is its inner label; other pins are their own 44px box.
      const r = (el.classList.contains('city-label') ? el.firstElementChild! : el).getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
      if (!best || d < best.d) best = { el, d };
    }
    best?.el.click();
  };

  const setPinEl = (key: string) => (el: HTMLElement | null) => {
    if (el) pinEls.current.set(key, el);
  };

  const step = STEPS.find((s) => s.n === selected) ?? null;
  const place = SITES.find((p) => p.id === placeId) ?? null;
  const distance = place ? distanceText(place) : null;

  return (
    <div className="app" data-look={LOOK}>
      <div className="stage">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          onPointerDown={onMapPointerDown}
          onPointerUp={onMapPointerUp}
          onPointerCancel={() => {
            pointersDown.current = Math.max(0, pointersDown.current - 1);
            tapStart.current = null;
          }}
        />

        <div className="pins">
          {PAPER && greenDome(regional?.madinah ?? null) && (
            <span ref={setPinEl('place-Green Dome')} className="place">
              <span>Green Dome</span>
            </span>
          )}
          {PAPER &&
            city &&
            paperLandmarks(city).map((l) => (
              <span key={l.name} ref={setPinEl(`place-${l.name}`)} className="place">
                <span>{l.name}</span>
              </span>
            ))}
          {PLACES.map((p) => (
            <span key={p.name} ref={setPinEl(`place-${p.name}`)} className="place">
              <span>{p.name}</span>
            </span>
          ))}
          {showRegion &&
            CITY_LABELS.map((c) => (
              <button
                key={c.name}
                ref={setPinEl(`city-${c.name}`)}
                type="button"
                className="city-label"
                onClick={() => openCity(c.placeId)}
              >
                <span>{c.name}</span>
              </button>
            ))}
          {showRegion &&
            SITES.map((p) => (
              <button
                key={p.id}
                ref={setPinEl(`site-${p.id}`)}
                type="button"
                className={`spot${placeId === p.id ? ' is-on' : ''}`}
                aria-label={p.name}
                aria-pressed={placeId === p.id}
                onClick={() => choosePlace(p)}
              >
                <span className="spot-dot" aria-hidden="true" />
                <span className="spot-name" aria-hidden="true">
                  {p.short}
                </span>
              </button>
            ))}
          {MAP_STEPS.map((s) => (
            <button
              key={s.n}
              ref={setPinEl(`step-${s.n}`)}
              type="button"
              className={`pin${selected === s.n ? ' is-on' : ''}`}
              aria-label={`Step ${s.n}: ${s.title}`}
              aria-pressed={selected === s.n}
              onClick={() => choose(s.n)}
            >
              <span className="pin-badge">{s.n}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`miqat${MIQAT_STEPS.some((s) => s.n === selected) ? ' is-on' : ''}`}
          onClick={() => choose(MIQAT_STEPS[0].n)}
        >
          <span className="miqat-nums" aria-hidden="true">
            {MIQAT_STEPS.map((s) => (
              <i key={s.n}>{s.n}</i>
            ))}
          </span>
          <span>
            <span className="sr-only">Steps 1 and 2: </span>At the miqat, before Makkah
          </span>
        </button>

        <div className="map-controls" role="group" aria-label="Map controls">
          <button type="button" aria-label="Zoom in" onClick={() => sceneRef.current?.zoomBy(0.7)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => sceneRef.current?.zoomBy(1 / 0.7)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          <button type="button" aria-label="Rotate the map" onClick={() => sceneRef.current?.rotateBy(Math.PI / 4)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.3-5.2M19 4v4h-4" /></svg>
          </button>
          <button
            type="button"
            aria-label={tilted ? 'Look straight down' : 'Tilt the map'}
            onClick={() => setTilted(sceneRef.current?.toggleTilt() ?? false)}
          >
            <span className="tilt-label">{tilted ? '2D' : '3D'}</span>
          </button>
        </div>

        {PAPER && (
          <div className="paper-dock">
          <div ref={legendRef} className="paper-key" style={{ visibility: 'hidden' }}>
            {keyOpen && (
              <div id="paper-legend" className="paper-legend" role="list" aria-label="Building colours">
                {PAPER_LEGEND.map((l) => (
                  <span key={l.name} role="listitem">
                    <i style={{ background: l.colour }} aria-hidden="true" />
                    {l.name}
                  </span>
                ))}
              </div>
            )}
            <button type="button" className="paper-key-btn" aria-expanded={keyOpen} aria-controls="paper-legend" onClick={() => setKeyOpen((o) => !o)}>
              {keyOpen ? 'Hide key' : 'Key'}
            </button>
          </div>
          <div className="paper-jump" role="group" aria-label="Jump to">
            {(['region', 0, 1] as const).map((t) => {
              const name = t === 'region' ? 'Region' : t === 0 ? 'Makkah' : 'Madinah';
              // The current place: the nearest city once within 60 km, otherwise the region.
              const on = paperStage ? (paperStage.cityDistance > CITY_VIEW ? t === 'region' : t === paperStage.nearest) : t === 'region';
              return (
                <button key={name} type="button" className={on ? 'is-on' : ''} aria-pressed={on} onClick={() => sceneRef.current?.jumpTo(t)}>
                  {name}
                </button>
              );
            })}
          </div>
          {paperStage && (
            // TEMPORARY, for the owner's reference while tuning: zoom distance, stage and frame rate.
            <p className="paper-readout" aria-live="off">
              {formatDistance(paperStage.distance)} · {paperStage.level} · {paperStage.fps === null ? 'still' : `${paperStage.fps} fps`}
            </p>
          )}
          </div>
        )}

        <p className="notice">
          {city && PAPER
            ? 'Elevation: modified Copernicus data. Buildings © OpenStreetMap.'
            : city
            ? 'Map © OpenStreetMap. Some heights estimated.'
            : LOOK !== 'plain'
              ? 'Illustrative hills and buildings, not real map data.'
              : 'Placeholder city. Pin positions are approximate.'}
        </p>
      </div>

      <main className="sheet">
        <div className="sheet-inner">
          <div className="sheet-head">
            <div>
              <p className="step-count">
                {place ? `Places · ${place.city}` : step ? `Step ${step.n} of ${STEPS.length}` : 'Umrah in seven steps'}
              </p>
              <h1>{place ? place.name : step ? step.title : 'Where each step happens'}</h1>
            </div>
            {(step || place) && (
              <button type="button" className="btn ghost" onClick={() => choose(null)}>
                Show all
              </button>
            )}
          </div>
          {place ? (
            <div className="place-info">
              <p className="lede">
                {place.pinNote ? `${place.pinNote} ` : ''}The description will be written from the sources below.
              </p>
              {distance && <p className="place-distance">{distance}</p>}
              <h2 className="sources-title">Sources</h2>
              <ul className="sources">
                {place.sources.map((src) => (
                  <li key={src.url}>
                    <a href={src.url} target="_blank" rel="noreferrer">
                      {src.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="lede">
              {step ? step.summary : 'Tap a number on the map or below to see where a step takes place.'}
            </p>
          )}
          <ol className="stepper" aria-label="Steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <button
                  type="button"
                  className={selected === s.n ? 'is-on' : ''}
                  aria-label={`Step ${s.n}: ${s.title}`}
                  aria-pressed={selected === s.n}
                  onClick={() => choose(s.n)}
                >
                  {s.n}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}

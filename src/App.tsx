import { useEffect, useRef, useState } from 'react';
import { CityScene, type Look as ClayLook, type Pin } from './scene/CityScene';
import { PAPERCUT_LABELS, PapercutScene, type PaperStage } from './scene/PapercutScene';
import { PapercutDock } from './PapercutDock';
import { CUSTOM_GROUND, CUSTOM_KIND_COLOUR, KIND_COLOUR } from './scene/papercutCity';
import { setLayerColours } from './scene/paperPaint';
import { CLAY, CLAY_CYAN, CLAY_MODEL } from './themes';
import { MARWA, SAFA, STEPS } from './data/steps';

// The overview screen: an aerial map of the Haram with a numbered pin for
// each Umrah step, and a sheet that names the selected step.

const MAP_STEPS = STEPS.filter((s) => s.pos !== null);
const MIQAT_STEPS = STEPS.filter((s) => s.pos === null);
const PLACES: { name: string; pos: [number, number] }[] = [
  { name: 'Safa', pos: SAFA },
  { name: 'Marwa', pos: MARWA },
];

// The plain look stays the default until the owner picks one.
// Add ?look=model, ?look=cyan or ?look=papercut to the address to see the others.
// Papercut extras: ?fps shows the measured frame rate; ?palette=custom uses the owner's colours; ?quality=low starts at lower detail, ?quality=high never drops detail.
const PARAMS = new URLSearchParams(window.location.search);
const LOOK_PARAM = PARAMS.get('look');
type Look = ClayLook | 'papercut';
const LOOK: Look =
  LOOK_PARAM === 'model' || LOOK_PARAM === 'cyan' || LOOK_PARAM === 'papercut' ? LOOK_PARAM : 'plain';
const CLAY_THEMES = { plain: CLAY, model: CLAY_MODEL, cyan: CLAY_CYAN };
const SHOW_FPS = PARAMS.has('fps');
// ?palette=custom uses the owner's chosen colours instead of the first palette.
if (PARAMS.get('palette') === 'custom') {
  Object.assign(KIND_COLOUR, CUSTOM_KIND_COLOUR);
  setLayerColours(CUSTOM_GROUND);
}
const QUALITY = PARAMS.get('quality') === 'low' ? 'low' : PARAMS.get('quality') === 'high' ? 'high' : 'auto';
const INITIAL_STAGE: PaperStage = { loading: true, nearest: 0, zoom: 0, growth: 0, legend: 0, level: 'Loading map' };

export function App() {
  const [selected, setSelected] = useState<number | null>(null);
  const [tilted, setTilted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | PapercutScene | null>(null);
  const pinEls = useRef(new Map<string, HTMLElement>());
  const [stage, setStage] = useState<PaperStage>(INITIAL_STAGE);
  const [fps, setFps] = useState<{ fps: number; note: string } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const points = [...MAP_STEPS.map((s) => s.pos!), ...PLACES.map((p) => p.pos)];
    const scene =
      LOOK === 'papercut'
        ? new PapercutScene(canvas, mq.matches, QUALITY)
        : new CityScene(canvas, CLAY_THEMES[LOOK], mq.matches, points, LOOK);
    const pins: Pin[] = [];
    MAP_STEPS.forEach((s) => pins.push({ el: pinEls.current.get(`step-${s.n}`)!, pos: s.pos! }));
    PLACES.forEach((p) => pins.push({ el: pinEls.current.get(`place-${p.name}`)!, pos: p.pos }));
    scene.setPins(pins);
    if (scene instanceof PapercutScene) {
      scene.setLabels(PAPERCUT_LABELS.map((l) => ({ key: l.key, el: pinEls.current.get(l.key)! })));
      scene.onStage = (st) => setStage(st);
      if (SHOW_FPS) scene.onFps = (f, note) => setFps({ fps: f, note });
    }
    sceneRef.current = scene;
    if (import.meta.env.DEV) (window as unknown as { __scene: unknown }).__scene = scene;
    const onChange = () => scene.setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const choose = (n: number | null) => {
    setSelected(n);
    const step = STEPS.find((s) => s.n === n);
    if (step?.pos) sceneRef.current?.focus(step.pos);
    else sceneRef.current?.showAll();
    setTilted(Boolean(step?.pos));
  };

  const setPinEl = (key: string) => (el: HTMLElement | null) => {
    if (el) pinEls.current.set(key, el);
  };

  const step = STEPS.find((s) => s.n === selected) ?? null;

  return (
    <div className="app" data-look={LOOK}>
      <div className="stage">
        <canvas ref={canvasRef} aria-hidden="true" />

        <div className="pins">
          {LOOK === 'papercut' &&
            PAPERCUT_LABELS.map((l) => (
              <span key={l.key} ref={setPinEl(l.key)} className={`pc-label ${l.kind}`}>
                <span>{l.text}</span>
              </span>
            ))}
          {PLACES.map((p) => (
            <span key={p.name} ref={setPinEl(`place-${p.name}`)} className="place">
              <span>{p.name}</span>
            </span>
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

        {LOOK === 'papercut' && (
          <PapercutDock
            stage={stage}
            fps={fps}
            onRegion={() => sceneRef.current instanceof PapercutScene && sceneRef.current.showAll()}
            onCity={(i) => sceneRef.current instanceof PapercutScene && sceneRef.current.goToCity(i)}
          />
        )}

        <p className="notice">
          {LOOK === 'papercut'
            ? 'Real elevation. Stand-in buildings, not real.'
            : LOOK !== 'plain'
              ? 'Illustrative hills and buildings, not real map data.'
              : 'Placeholder city. Pin positions are approximate.'}
        </p>
      </div>

      <main className="sheet">
        <div className="sheet-inner">
          <div className="sheet-head">
            <div>
              <p className="step-count">{step ? `Step ${step.n} of ${STEPS.length}` : 'Umrah in seven steps'}</p>
              <h1>{step ? step.title : 'Where each step happens'}</h1>
            </div>
            {step && (
              <button type="button" className="btn ghost" onClick={() => choose(null)}>
                Show all
              </button>
            )}
          </div>
          <p className="lede">
            {step ? step.summary : 'Tap a number on the map or below to see where a step takes place.'}
          </p>
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

import { useEffect, useRef, useState } from 'react';
import { CityScene, type Look, type Pin } from './scene/CityScene';
import { CLAY, CLAY_MODEL } from './themes';
import { MARWA, SAFA, STEPS } from './data/steps';

// The overview screen: an aerial map of the Haram with a numbered pin for
// each Umrah step, and a sheet that names the selected step.

const MAP_STEPS = STEPS.filter((s) => s.pos !== null);
const MIQAT_STEPS = STEPS.filter((s) => s.pos === null);
const PLACES: { name: string; pos: [number, number] }[] = [
  { name: 'Safa', pos: SAFA },
  { name: 'Marwa', pos: MARWA },
];

// The plain look stays the default until the model look is approved.
// Add ?look=model to the address to see the mockup.
const LOOK: Look = new URLSearchParams(window.location.search).get('look') === 'model' ? 'model' : 'plain';

export function App() {
  const [selected, setSelected] = useState<number | null>(null);
  const [tilted, setTilted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const pinEls = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const points = [...MAP_STEPS.map((s) => s.pos!), ...PLACES.map((p) => p.pos)];
    const scene = new CityScene(canvas, LOOK === 'model' ? CLAY_MODEL : CLAY, mq.matches, points, LOOK);
    const pins: Pin[] = [];
    MAP_STEPS.forEach((s) => pins.push({ el: pinEls.current.get(`step-${s.n}`)!, pos: s.pos! }));
    PLACES.forEach((p) => pins.push({ el: pinEls.current.get(`place-${p.name}`)!, pos: p.pos }));
    scene.setPins(pins);
    sceneRef.current = scene;
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

        <p className="notice">
          {LOOK === 'model'
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

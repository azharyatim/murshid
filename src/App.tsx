import { useEffect, useRef, useState } from 'react';
import { CityScene } from './scene/CityScene';
import { THEMES, THEME_ORDER, type ThemeId } from './themes';

// Stage 1: a single preview screen for comparing the three visual styles.

const STEPS = ['Ihram and miqat', 'Niyyah and talbiyah', 'Entering Masjid al-Haram', 'Tawaf', 'Maqam Ibrahim and Zamzam', "Sa'i", 'Halq or taqsir'];
const CURRENT = 3;
const CIRCUIT = 3;

// Sample text for the style review only. Fetched from quran.ai, not typed from memory.
const SAMPLE_VERSE = {
  arabic:
    '۞ إِنَّ ٱلصَّفَا وَٱلْمَرْوَةَ مِن شَعَآئِرِ ٱللَّهِ ۖ فَمَنْ حَجَّ ٱلْبَيْتَ أَوِ ٱعْتَمَرَ فَلَا جُنَاحَ عَلَيْهِ أَن يَطَّوَّفَ بِهِمَا ۚ وَمَن تَطَوَّعَ خَيْرًا فَإِنَّ ٱللَّهَ شَاكِرٌ عَلِيمٌ',
  meaning:
    'Safa and Marwa are among the rites of God, so for those who make major or minor pilgrimage to the House it is no offence to circulate between the two. Anyone who does good of his own accord will be rewarded, for God rewards good deeds, and knows everything.',
  reference: 'Quran 2:158',
  translator: 'M.A.S. Abdel Haleem',
  url: 'https://quran.com/2:158?translations=85',
};

function initialTheme(): ThemeId {
  const q = new URLSearchParams(window.location.search).get('style');
  return q && q in THEMES ? (q as ThemeId) : 'clay';
}

export function App() {
  const [themeId, setThemeId] = useState<ThemeId>(initialTheme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scene = new CityScene(canvas, THEMES[initialTheme()].scene, mq.matches);
    sceneRef.current = scene;
    const onChange = () => scene.setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    sceneRef.current?.setTheme(THEMES[themeId].scene);
  }, [themeId]);

  return (
    <div className="app">
      <div className="stage">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="3D model of the Haram area with dots circling the Kaabah anticlockwise"
        />
        <fieldset className="styles">
          <legend className="sr-only">Visual style</legend>
          {THEME_ORDER.map((id) => (
            <label key={id} className={id === themeId ? 'is-on' : ''}>
              <input type="radio" name="style" value={id} checked={id === themeId} onChange={() => setThemeId(id)} />
              {THEMES[id].name}
            </label>
          ))}
        </fieldset>
        <p className="notice">Placeholder city blocks. Real map data comes next.</p>
      </div>

      <main className="sheet">
        <div className="sheet-inner">
          <ol className="progress" aria-label={`Step ${CURRENT + 1} of ${STEPS.length}: ${STEPS[CURRENT]}`}>
            {STEPS.map((s, i) => (
              <li key={s} className={i < CURRENT ? 'done' : i === CURRENT ? 'now' : ''} aria-hidden="true" />
            ))}
          </ol>
          <p className="step-count">
            Step {CURRENT + 1} of {STEPS.length}
          </p>
          <h1>{STEPS[CURRENT]}</h1>
          <p className="lede">Seven circuits around the Kaabah, starting and ending at the Black Stone line.</p>

          <div className="circuits" aria-label={`Circuit ${CIRCUIT} of 7`}>
            <span className="circuit-dots" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (
                <i key={i} className={i < CIRCUIT ? 'on' : ''} />
              ))}
            </span>
            <span className="circuit-label">
              Circuit <b>{CIRCUIT}</b> of 7
            </span>
          </div>

          <section className="dua" aria-label="Sample verse">
            <p className="dua-arabic" lang="ar" dir="rtl">
              {SAMPLE_VERSE.arabic}
            </p>
            <p className="dua-meaning">{SAMPLE_VERSE.meaning}</p>
            <p className="dua-source">
              <a href={SAMPLE_VERSE.url} target="_blank" rel="noreferrer">
                {SAMPLE_VERSE.reference}
              </a>
              , translated by {SAMPLE_VERSE.translator}. Sample text for the style review, not this step's dua.
            </p>
          </section>

          <nav className="step-nav" aria-label="Steps">
            <button type="button" className="btn ghost">
              Previous
            </button>
            <button type="button" className="btn primary">
              Next: {STEPS[CURRENT + 1]}
            </button>
          </nav>
        </div>
      </main>
    </div>
  );
}

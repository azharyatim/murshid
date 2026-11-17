import type { PaperStage } from './scene/PapercutScene';
import { KIND_COLOUR } from './scene/papercutCity';

// Zoom controls for the Papercut look: jump buttons, a zoom indicator that
// shows which stage the map is in, and a colour legend that appears once the
// buildings have risen. The colours are the building colours in the scene.

const hexOf = (n: number) => '#' + n.toString(16).padStart(6, '0');
const legend = () => [
  { label: 'Hotels', colour: hexOf(KIND_COLOUR.hotel) },
  { label: 'Shops', colour: hexOf(KIND_COLOUR.shop) },
  { label: 'Homes', colour: hexOf(KIND_COLOUR.home) },
  { label: 'Mosque', colour: hexOf(KIND_COLOUR.mosque) },
  { label: 'Towers', colour: hexOf(KIND_COLOUR.tower) },
];

interface Props {
  stage: PaperStage;
  fps: { fps: number; note: string } | null;
  onRegion: () => void;
  onCity: (i: 0 | 1) => void;
}

export function PapercutDock({ stage, fps, onRegion, onCity }: Props) {
  const inRegion = stage.zoom < 0.3;
  return (
    <div className="pc-dock">
      <ul className="pc-legend" style={{ opacity: stage.legend }} aria-hidden={stage.legend < 0.1}>
        {legend().map((l) => (
          <li key={l.label}>
            <i style={{ background: l.colour }} />
            {l.label}
          </li>
        ))}
      </ul>
      <div className="pc-row" role="group" aria-label="Jump to">
        <button type="button" className={inRegion ? 'is-on' : ''} onClick={onRegion}>
          Region
        </button>
        <button type="button" className={!inRegion && stage.nearest === 0 ? 'is-on' : ''} onClick={() => onCity(0)}>
          Makkah
        </button>
        <button type="button" className={!inRegion && stage.nearest === 1 ? 'is-on' : ''} onClick={() => onCity(1)}>
          Madinah
        </button>
      </div>
      <div className="pc-zoom" role="status">
        <span className="pc-bar" aria-hidden="true">
          <b style={{ width: `${Math.round(stage.zoom * 100)}%` }} />
        </span>
        <span>{stage.level}</span>
        {fps && <span className="pc-fps">{fps.fps.toFixed(0)} fps{fps.note ? ` · ${fps.note}` : ''}</span>}
      </div>
    </div>
  );
}

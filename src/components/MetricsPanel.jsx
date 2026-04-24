import { BAND_COLORS, BAND_ORDER } from './map/coverageColors.js';

function formatPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(1)}%`;
}

function DeltaChip({ current, baseline }) {
  if (current == null || baseline == null) return null;
  const delta = current - baseline;
  if (Math.abs(delta) < 0.05) return <span className="delta neutral">± baseline</span>;
  const sign = delta > 0 ? '▲' : '▼';
  return (
    <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>
      {sign} {Math.abs(delta).toFixed(1)} vs baseline
    </span>
  );
}

function BandBar({ band, pctPopulation, pctWorkplaces }) {
  const pop = Math.max(0, Math.min(100, pctPopulation));
  const work = Math.max(0, Math.min(100, pctWorkplaces));
  const color = BAND_COLORS[band] || '#64748b';
  return (
    <div className="band-bar-row">
      <span className="band-bar-label">{band}</span>
      <div className="band-bar-tracks">
        <div className="band-bar-track">
          <div className="band-bar-fill" style={{ width: `${pop}%`, background: color }} />
        </div>
        <div className="band-bar-track">
          <div
            className="band-bar-fill secondary"
            style={{ width: `${work}%`, background: color }}
          />
        </div>
      </div>
      <span className="band-bar-values">
        <span>{pop.toFixed(1)}%</span>
        <span className="muted">{work.toFixed(1)}%</span>
      </span>
    </div>
  );
}

export default function MetricsPanel({ current, baseline, bands, feasible }) {
  return (
    <div className="metrics-panel">
      <div className="headline-row">
        <div className="headline">
          <span className="headline-label">Population within 300m</span>
          <span className="headline-value tabular">
            {feasible === false ? '— —' : formatPct(current.population)}
          </span>
          {feasible !== false && (
            <DeltaChip current={current.population} baseline={baseline.population} />
          )}
        </div>

        <div className="headline">
          <span className="headline-label">Workplaces within 300m</span>
          <span className="headline-value tabular">
            {feasible === false ? '— —' : formatPct(current.workplaces)}
          </span>
          {feasible !== false && (
            <DeltaChip current={current.workplaces} baseline={baseline.workplaces} />
          )}
        </div>
      </div>

      {feasible !== false && (
        <>
          <div className="breakdown-header">
            <span>Band</span>
            <span className="muted">Population · Workplaces</span>
          </div>
          <div className="band-bars">
            {BAND_ORDER.map((band) => {
              const entry = bands.find((b) => b.label === band);
              if (!entry) return null;
              return (
                <BandBar
                  key={band}
                  band={band}
                  pctPopulation={entry.pctPopulation}
                  pctWorkplaces={entry.pctWorkplaces}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

import { BAND_COLORS, BAND_ORDER } from './map/coverageColors.js';

function formatPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(1)}%`;
}

function formatTrips(v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
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

function TripsDeltaChip({ vsCurrentPct }) {
  if (vsCurrentPct == null || Number.isNaN(vsCurrentPct)) return null;
  if (Math.abs(vsCurrentPct) < 0.05) return <span className="delta neutral">≈ 2024</span>;
  const sign = vsCurrentPct > 0 ? '▲' : '▼';
  return (
    <span className={`delta ${vsCurrentPct > 0 ? 'up' : 'down'}`}>
      {sign} {Math.abs(vsCurrentPct).toFixed(1)}% vs 2024
    </span>
  );
}

export default function MetricsPanel({ current, baseline, bands, predictedTrips, vsCurrentPct }) {
  return (
    <div className="metrics-panel">
      <div className="headline-row">
        <div className="headline">
          <span className="headline-label">Population within 100m</span>
          <span className="headline-value tabular">{formatPct(current.population)}</span>
          <DeltaChip current={current.population} baseline={baseline.population} />
        </div>

        <div className="headline">
          <span className="headline-label">Workplaces within 100m</span>
          <span className="headline-value tabular">{formatPct(current.workplaces)}</span>
          <DeltaChip current={current.workplaces} baseline={baseline.workplaces} />
        </div>
      </div>

      <div className="headline headline--trips">
        <span className="headline-label">Predicted yearly rides</span>
        <span className="headline-value tabular">{formatTrips(predictedTrips)}</span>
        <TripsDeltaChip vsCurrentPct={vsCurrentPct} />
      </div>

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
    </div>
  );
}

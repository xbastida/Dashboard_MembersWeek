import { Activity, Layers, Map as MapIcon, Users, Zap } from 'lucide-react';
import { useScenarioStore } from '../state/scenarioStore.js';

function ButtonGroup({ values, current, onPick, format = (v) => v }) {
  return (
    <div className="button-group">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className={`pill ${v === current ? 'active' : ''}`}
          onClick={() => onPick(v)}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}

export default function ControlPanel({ params, status }) {
  const n = useScenarioStore((s) => s.n);
  const w = useScenarioStore((s) => s.w);
  const pop = useScenarioStore((s) => s.pop);
  const lam = useScenarioStore((s) => s.lam);
  const showScoreField = useScenarioStore((s) => s.showScoreField);
  const showTrips = useScenarioStore((s) => s.showTrips);
  const setParam = useScenarioStore((s) => s.setParam);

  return (
    <aside className="control-panel">
      <header>
        <h1>Dbizi Optimizer</h1>
        <p>San Sebastián · Station placement</p>
      </header>

      <div className="control-group">
        <div className="control-label">
          <span>
            <MapIcon size={14} /> Stations <em>N</em>
          </span>
          <strong>{n ?? '—'}</strong>
        </div>
        <ButtonGroup values={params.N} current={n} onPick={(v) => setParam('n', v)} />
      </div>

      <div className="control-group">
        <div className="control-label">
          <span>
            <Activity size={14} /> Demand weight <em>W</em>
          </span>
          <strong>{w != null ? w.toFixed(2) : '—'}</strong>
        </div>
        <ButtonGroup
          values={params.W}
          current={w}
          onPick={(v) => setParam('w', v)}
          format={(v) => v.toFixed(2)}
        />
      </div>

      <div className="control-group">
        <div className="control-label">
          <span>
            <Users size={14} /> Min. coverage <em>POP</em>
          </span>
          <strong>{pop != null ? `${pop}%` : '—'}</strong>
        </div>
        <ButtonGroup
          values={params.POP}
          current={pop}
          onPick={(v) => setParam('pop', v)}
          format={(v) => `${v}%`}
        />
      </div>

      <div className="control-group">
        <div className="control-label">
          <span>
            <Layers size={14} /> Proximity penalty <em>λ</em>
          </span>
          <strong>{lam != null ? lam : '—'}</strong>
        </div>
        <ButtonGroup values={params.LAM} current={lam} onPick={(v) => setParam('lam', v)} />
      </div>

      <div className="control-group">
        <div className="control-label">
          <span>
            <Layers size={14} /> Demand score field <kbd>D</kbd>
          </span>
        </div>
        <button
          type="button"
          className={`pill wide ${showScoreField ? 'active' : ''}`}
          onClick={() => setParam('showScoreField', !showScoreField)}
        >
          {showScoreField ? 'Visible' : 'Hidden'}
        </button>
      </div>

      <div className="control-group">
        <div className="control-label">
          <span>
            <Zap size={14} /> Trip animation <kbd>T</kbd>
          </span>
        </div>
        <button
          type="button"
          className={`pill wide ${showTrips ? 'active' : ''}`}
          onClick={() => setParam('showTrips', !showTrips)}
        >
          {showTrips ? 'On' : 'Off'}
        </button>
      </div>

      <div className="control-footer">
        <span className="control-footer-label">Status</span>
        <span className={`status-pill ${status === 'loading' ? 'loading' : 'feasible'}`}>
          {status === 'loading' ? 'Loading' : 'Ready'}
        </span>
      </div>
    </aside>
  );
}

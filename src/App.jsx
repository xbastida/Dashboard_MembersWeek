import { useEffect, useMemo, useState } from 'react';
import MapView from './views/MapView.jsx';
import CoverageView from './views/CoverageView.jsx';
import Launcher from './views/Launcher.jsx';
import { useSummary } from './data/useSummary.js';
import { useAccessSummary } from './data/useAccessSummary.js';
import { initBroadcast } from './state/broadcast.js';
import { useScenarioStore } from './state/scenarioStore.js';

function readView() {
  const params = new URLSearchParams(window.location.search);
  return params.get('view');
}

export default function App() {
  const view = useMemo(readView, []);
  const summary = useSummary();
  const access = useAccessSummary();
  const bootstrap = useScenarioStore((s) => s.bootstrap);
  const [broadcastReady, setBroadcastReady] = useState(false);

  useEffect(() => {
    const dispose = initBroadcast();
    setBroadcastReady(true);
    return dispose;
  }, []);

  useEffect(() => {
    if (summary.data) bootstrap(summary.params, summary.data);
  }, [summary.data, summary.params, bootstrap]);

  if (!view) return <Launcher />;

  const loading = summary.loading || access.loading || !broadcastReady;
  const error = summary.error || access.error;

  if (error) {
    return (
      <div className="fullscreen-message error">
        <div>
          <h2>Failed to load data</h2>
          <p>{String(error.message || error)}</p>
          <p className="hint">Make sure <code>npm run sync-data</code> completed.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fullscreen-message">
        <div className="spinner" />
      </div>
    );
  }

  if (view === 'map') return <MapView summary={summary} />;
  if (view === 'coverage') return <CoverageView summary={summary} access={access} />;

  return <Launcher />;
}

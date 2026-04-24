import { Map as MapIcon, Activity } from 'lucide-react';

function openPopup(view) {
  const url = `${window.location.origin}${window.location.pathname}?view=${view}`;
  window.open(url, `dbizi-${view}`, 'popup=yes,width=1600,height=900');
}

export default function Launcher() {
  return (
    <div className="launcher">
      <div className="launcher-title">
        <h1>Dbizi Dashboard</h1>
        <p>Dual-display bike-sharing station optimizer</p>
      </div>

      <div className="launcher-buttons">
        <button className="launcher-btn" onClick={() => openPopup('map')}>
          <MapIcon size={36} />
          <span className="label">Open map window</span>
          <span className="hint">horizontal projector · controls</span>
        </button>

        <button className="launcher-btn" onClick={() => openPopup('coverage')}>
          <Activity size={36} />
          <span className="label">Open coverage window</span>
          <span className="hint">vertical screen · metrics</span>
        </button>
      </div>

      <div className="launcher-footer">
        <p>
          Drag each popup to its target display, then press <kbd>F11</kbd> for fullscreen.
          Interact from the map window; the coverage window updates live.
        </p>
      </div>
    </div>
  );
}

import { BAND_COLORS, BAND_ORDER } from './map/coverageColors.js';

export default function BandLegend() {
  return (
    <div className="band-legend">
      {BAND_ORDER.map((band) => (
        <div key={band} className="band-legend-item">
          <span className="swatch" style={{ background: BAND_COLORS[band] }} />
          <span className="label">{band}</span>
        </div>
      ))}
    </div>
  );
}

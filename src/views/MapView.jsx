import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import ControlPanel from '../components/ControlPanel.jsx';
import { useScenarioStore, scenarioKey } from '../state/scenarioStore.js';
import { useScenarioGeoJson } from '../data/useScenario.js';
import { STATION_COLORS, matchExprFor } from '../components/map/coverageColors.js';

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CENTER = [-1.98, 43.31];

export default function MapView({ summary }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleReadyRef = useRef(false);

  const n = useScenarioStore((s) => s.n);
  const w = useScenarioStore((s) => s.w);
  const pop = useScenarioStore((s) => s.pop);
  const lam = useScenarioStore((s) => s.lam);
  const showScoreField = useScenarioStore((s) => s.showScoreField);
  const setParam = useScenarioStore((s) => s.setParam);

  const key = scenarioKey({ n, w, pop, lam });
  const row = summary.lookup(n, w, pop, lam);
  const feasible = row?.feasible ?? null;

  const { geojson, loading } = useScenarioGeoJson(key);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP,
      center: CENTER,
      zoom: 12.3,
      attributionControl: { compact: true },
    });

    map.on('load', () => {
      // Score field underlay (loaded once, toggleable)
      map.addSource('score-field', emptyFC());
      map.addLayer({
        id: 'score-field-fill',
        type: 'fill',
        source: 'score-field',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': [
            'interpolate', ['linear'], ['get', 'demand_score'],
            0,   '#0c4a6e',
            0.3, '#0ea5e9',
            0.6, '#fbbf24',
            1.0, '#fef9c3',
          ],
          'fill-opacity': [
            'interpolate', ['linear'], ['get', 'demand_score'],
            0,   0.15,
            1.0, 0.70,
          ],
        },
      });
      fetch('./data/score_field.geojson')
        .then((r) => r.json())
        .then((data) => map.getSource('score-field')?.setData(data))
        .catch(() => {});

      map.addSource('stations', emptyFC());
      map.addSource('stations-centroids', emptyFC());

      map.addLayer({
        id: 'stations-fill',
        type: 'fill',
        source: 'stations',
        paint: {
          'fill-color': matchExprFor('status', STATION_COLORS, STATION_COLORS.default),
          'fill-opacity': 0.28,
        },
      });

      map.addLayer({
        id: 'stations-outline',
        type: 'line',
        source: 'stations',
        paint: {
          'line-color': '#e2e8f0',
          'line-width': 1,
          'line-opacity': 0.5,
        },
      });

      map.addLayer({
        id: 'stations-centroids',
        type: 'circle',
        source: 'stations-centroids',
        paint: {
          'circle-radius': 6,
          'circle-color': matchExprFor('status', STATION_COLORS, STATION_COLORS.default),
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });

      map.on('mouseenter', 'stations-centroids', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'stations-centroids', () => {
        map.getCanvas().style.cursor = '';
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        className: 'station-popup',
      });
      map.on('mousemove', 'stations-centroids', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        const id = p.h3_index ? p.h3_index.slice(-6) : (p.station_id ?? p.id ?? '—');
        const status = p.status ?? '—';
        const docks = p.dock_count ?? p.docks ?? p.capacity ?? null;
        const size = p.station_size ?? null;
        const demand = p.demand_norm != null ? Number(p.demand_norm).toFixed(3) : '—';
        const rebal = p.rebal_norm != null ? Number(p.rebal_norm).toFixed(3) : '—';
        const effD = p.effective_demand != null ? Number(p.effective_demand).toFixed(1) : '—';
        popup
          .setLngLat(f.geometry.coordinates)
          .setHTML(
            `<div class="popup-title">${id}</div>
             <div class="popup-row"><span>status</span><b>${status}</b></div>
             <div class="popup-row"><span>demand</span><b>${demand}</b></div>
             <div class="popup-row"><span>rebalancing</span><b>${rebal}</b></div>
             <div class="popup-row"><span>eff. demand</span><b>${effD}</b></div>
             ${docks != null ? `<div class="popup-row"><span>docks</span><b>${docks}${size ? ' · ' + size : ''}</b></div>` : ''}`
          )
          .addTo(map);
      });
      map.on('mouseleave', 'stations-centroids', () => popup.remove());

      styleReadyRef.current = true;
      mapRef.current = map;

      // flush-in any pending data
      if (map.__pendingData) {
        applyGeoJson(map, map.__pendingData);
        map.__pendingData = null;
      }
    });

    mapRef.current = map;

    return () => {
      styleReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!styleReadyRef.current) {
      map.__pendingData = geojson;
      return;
    }
    applyGeoJson(map, geojson);
  }, [geojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    map.setLayoutProperty('score-field-fill', 'visibility', showScoreField ? 'visible' : 'none');
  }, [showScoreField]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    container.style.opacity = feasible === false ? '0.55' : '1';
  }, [feasible]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'd' || e.key === 'D') setParam('showScoreField', !showScoreField);
      if (e.key === 'ArrowRight') cycle(summary.params.N, n, 1, (v) => setParam('n', v));
      if (e.key === 'ArrowLeft') cycle(summary.params.N, n, -1, (v) => setParam('n', v));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, showScoreField, setParam, summary.params.N]);

  return (
    <div className="map-view">
      <ControlPanel
        params={summary.params}
        feasible={feasible}
        status={loading ? 'loading' : 'ready'}
      />

      <main className="map-main">
        <div ref={containerRef} className="map-container" />

        {loading && <div className="progress-bar" />}

        {feasible === false && (
          <div className="infeasible-pill">Infeasible combination</div>
        )}

      </main>
    </div>
  );
}

function emptyFC() {
  return { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
}

function applyGeoJson(map, geojson) {
  const fillSrc = map.getSource('stations');
  const pointsSrc = map.getSource('stations-centroids');
  if (!fillSrc || !pointsSrc) return;

  if (!geojson) {
    fillSrc.setData({ type: 'FeatureCollection', features: [] });
    pointsSrc.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  fillSrc.setData(geojson);

  const centroids = [];
  const allCoords = [];

  for (const f of geojson.features || []) {
    if (!f.geometry) continue;
    let center;
    try {
      center = turf.centroid(f);
    } catch {
      continue;
    }
    center.properties = { ...f.properties };
    centroids.push(center);

    if (f.geometry.type === 'Polygon') {
      for (const ring of f.geometry.coordinates) for (const c of ring) allCoords.push(c);
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates)
        for (const ring of poly) for (const c of ring) allCoords.push(c);
    } else if (f.geometry.type === 'Point') {
      allCoords.push(f.geometry.coordinates);
    }
  }

  pointsSrc.setData(turf.featureCollection(centroids));

  const valid = allCoords.filter(
    (c) =>
      Array.isArray(c) &&
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1]) &&
      c[1] >= -90 &&
      c[1] <= 90 &&
      c[0] >= -180 &&
      c[0] <= 180
  );
  if (valid.length > 0) {
    let minLng = valid[0][0];
    let minLat = valid[0][1];
    let maxLng = valid[0][0];
    let maxLat = valid[0][1];
    for (const c of valid) {
      if (c[0] < minLng) minLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] > maxLat) maxLat = c[1];
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, duration: 800, maxZoom: 14 }
    );
  }
}

function cycle(values, current, dir, setter) {
  if (!values?.length) return;
  const idx = values.indexOf(current);
  if (idx < 0) return setter(values[0]);
  const next = (idx + dir + values.length) % values.length;
  setter(values[next]);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}


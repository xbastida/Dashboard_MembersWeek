import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import ControlPanel from '../components/ControlPanel.jsx';
import { useScenarioStore, scenarioKey } from '../state/scenarioStore.js';
import { useScenarioGeoJson } from '../data/useScenario.js';
import { useScenarioTrips } from '../data/useScenarioTrips.js';
import { STATION_COLORS, matchExprFor } from '../components/map/coverageColors.js';

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CENTER = [-1.98, 43.31];
const SIM_START = 6 * 3600;   // 06:00 in seconds
const SIM_END   = 24 * 3600;  // 24:00 in seconds
const SIM_SPEED = 600;         // sim-seconds per wall-clock second (10 sim-min per real-sec)

function fmtTime(sec) {
  const s = Math.max(SIM_START, Math.min(SIM_END, sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function countActive(tripsData, t) {
  if (!tripsData?.trips) return 0;
  let n = 0;
  for (const tr of tripsData.trips) {
    if (tr.t <= t && t < tr.t + tr.dur) n++;
  }
  return n;
}

function drawFrame(map, canvas, tripsData, tSec) {
  if (!canvas) return;
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w === 0 || h === 0) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!tripsData?.trips || !map) return;

  const { routes, trips } = tripsData;

  for (const trip of trips) {
    const progress = (tSec - trip.t) / trip.dur;
    if (progress <= 0 || progress > 1) continue;

    const path = routes[trip.r];
    if (!path || path.length < 2) continue;

    // Project all waypoints to screen coordinates
    const pts = path.map(([lon, lat]) => map.project([lon, lat]));

    // Cumulative screen-space arc lengths
    const lens = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      lens.push(lens[i - 1] + Math.hypot(dx, dy));
    }
    const totalLen = lens[lens.length - 1];
    if (totalLen < 1) continue;

    const target = progress * totalLen;

    // Locate the head position along the polyline
    let headX = pts[pts.length - 1].x;
    let headY = pts[pts.length - 1].y;
    let headSeg = pts.length - 2;
    for (let i = 1; i < pts.length; i++) {
      if (lens[i] >= target) {
        const frac = (target - lens[i - 1]) / (lens[i] - lens[i - 1]);
        headX = pts[i - 1].x + frac * (pts[i].x - pts[i - 1].x);
        headY = pts[i - 1].y + frac * (pts[i].y - pts[i - 1].y);
        headSeg = i - 1;
        break;
      }
    }

    // Draw trail: all full segments up to headSeg, then partial last segment
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= headSeg; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(headX, headY);
    ctx.strokeStyle = 'rgba(34,211,238,0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Glowing head dot
    ctx.beginPath();
    ctx.arc(headX, headY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#e0f9ff';
    ctx.fill();
  }
}

export default function MapView({ summary }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleReadyRef = useRef(false);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const tripTimeRef = useRef(SIM_START);
  const playingRef = useRef(false);
  const tripsRef = useRef(null);
  const lastUIUpdateRef = useRef(0);

  const n = useScenarioStore((s) => s.n);
  const w = useScenarioStore((s) => s.w);
  const pop = useScenarioStore((s) => s.pop);
  const lam = useScenarioStore((s) => s.lam);
  const showScoreField = useScenarioStore((s) => s.showScoreField);
  const showTrips = useScenarioStore((s) => s.showTrips);
  const setParam = useScenarioStore((s) => s.setParam);

  const key = scenarioKey({ n, w, pop, lam });

  const { geojson, loading } = useScenarioGeoJson(key);
  const { trips } = useScenarioTrips(key);

  // local UI state for the trip overlay
  const [tripTimeSec, setTripTimeSec] = useState(SIM_START);
  const [tripPlaying, setTripPlaying] = useState(false);
  const [activeCount, setActiveCount] = useState(0);

  // keep tripsRef fresh so the RAF closure always has latest data
  useEffect(() => { tripsRef.current = trips; }, [trips]);

  // reset time when scenario changes
  useEffect(() => {
    tripTimeRef.current = SIM_START;
    setTripTimeSec(SIM_START);
    setActiveCount(0);
  }, [key]);

  // mirror tripPlaying into ref so RAF can read it without closure staleness
  useEffect(() => { playingRef.current = tripPlaying; }, [tripPlaying]);

  // -------------------------------------------------------
  // MapLibre init (runs once)
  // -------------------------------------------------------
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

  // -------------------------------------------------------
  // Trip animation RAF
  // -------------------------------------------------------
  useEffect(() => {
    if (!showTrips) {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    function frame(wallTs) {
      if (playingRef.current) {
        const last = frame._last;
        if (last != null) {
          const dt = (wallTs - last) / 1000;
          tripTimeRef.current += dt * SIM_SPEED;
          if (tripTimeRef.current >= SIM_END) tripTimeRef.current = SIM_START;
        }
        frame._last = wallTs;
      } else {
        frame._last = null;
      }

      drawFrame(mapRef.current, canvasRef.current, tripsRef.current, tripTimeRef.current);

      if (wallTs - lastUIUpdateRef.current > 150) {
        const t = Math.round(tripTimeRef.current);
        setTripTimeSec(t);
        setActiveCount(countActive(tripsRef.current, t));
        lastUIUpdateRef.current = wallTs;
      }

      animRef.current = requestAnimationFrame(frame);
    }
    frame._last = null;

    animRef.current = requestAnimationFrame(frame);
    return () => {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    };
  }, [showTrips]); // trips updates are handled via tripsRef

  // -------------------------------------------------------
  // Apply station GeoJSON
  // -------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!styleReadyRef.current) {
      map.__pendingData = geojson;
      return;
    }
    applyGeoJson(map, geojson);
  }, [geojson]);

  // -------------------------------------------------------
  // Score field visibility
  // -------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    map.setLayoutProperty('score-field-fill', 'visibility', showScoreField ? 'visible' : 'none');
  }, [showScoreField]);

  // -------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'd' || e.key === 'D') setParam('showScoreField', !showScoreField);
      if (e.key === 't' || e.key === 'T') setParam('showTrips', !showTrips);
      if (e.key === 'ArrowRight') cycle(summary.params.N, n, 1, (v) => setParam('n', v));
      if (e.key === 'ArrowLeft') cycle(summary.params.N, n, -1, (v) => setParam('n', v));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, showScoreField, showTrips, setParam, summary.params.N]);

  // slider handler
  function onSliderChange(e) {
    const t = Number(e.target.value);
    tripTimeRef.current = t;
    setTripTimeSec(t);
    setActiveCount(countActive(tripsRef.current, t));
  }

  function togglePlay() {
    setTripPlaying((p) => !p);
  }

  return (
    <div className="map-view">
      <ControlPanel
        params={summary.params}
        status={loading ? 'loading' : 'ready'}
      />

      <main className="map-main">
        <div ref={containerRef} className="map-container" />

        {/* trip animation canvas overlay */}
        <canvas
          ref={canvasRef}
          className="trips-canvas"
          style={{ display: showTrips ? 'block' : 'none' }}
        />

        {loading && <div className="progress-bar" />}

        {showTrips && (
          <div className="trip-overlay">
            <button
              type="button"
              className="trip-play-btn"
              onClick={togglePlay}
              title={tripPlaying ? 'Pause' : 'Play'}
            >
              {tripPlaying ? '⏸' : '▶'}
            </button>

            <span className="trip-clock">{fmtTime(tripTimeSec)}</span>

            <input
              type="range"
              className="trip-slider"
              min={SIM_START}
              max={SIM_END}
              step={60}
              value={tripTimeSec}
              onChange={onSliderChange}
            />

            <span className="trip-active-count">
              {activeCount} active
            </span>
          </div>
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
    try { center = turf.centroid(f); } catch { continue; }
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
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
           c[1] >= -90 && c[1] <= 90 && c[0] >= -180 && c[0] <= 180
  );
  if (valid.length > 0) {
    let [minLng, minLat] = valid[0];
    let [maxLng, maxLat] = valid[0];
    for (const [lo, la] of valid) {
      if (lo < minLng) minLng = lo;
      if (la < minLat) minLat = la;
      if (lo > maxLng) maxLng = lo;
      if (la > maxLat) maxLat = la;
    }
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 800, maxZoom: 14 });
  }
}

function cycle(values, current, dir, setter) {
  if (!values?.length) return;
  const idx = values.indexOf(current);
  if (idx < 0) return setter(values[0]);
  setter(values[(idx + dir + values.length) % values.length]);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

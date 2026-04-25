import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import ScenarioBadge from '../components/ScenarioBadge.jsx';
import BandLegend from '../components/BandLegend.jsx';
import MetricsPanel from '../components/MetricsPanel.jsx';
import { useScenarioStore, scenarioKey } from '../state/scenarioStore.js';
import { useScenarioGeoJson } from '../data/useScenario.js';
import { bandBreakdown, coveredWithin300m } from '../data/useAccessSummary.js';
import {
  BAND_COLORS,
  BAND_COLOR_FALLBACK,
  STATION_COLORS,
  matchExprFor,
} from '../components/map/coverageColors.js';

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CENTER = [-1.98, 43.31];

export default function CoverageView({ summary, access }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleReadyRef = useRef(false);
  const pendingRef = useRef({});

  const n = useScenarioStore((s) => s.n);
  const w = useScenarioStore((s) => s.w);
  const pop = useScenarioStore((s) => s.pop);
  const lam = useScenarioStore((s) => s.lam);

  const key = scenarioKey({ n, w, pop, lam });
  const row = summary.lookup(n, w, pop, lam);

  const { geojson: coverageFC, loading } = useScenarioGeoJson(key, { access: true });
  const { geojson: edgesFC, loading: edgesLoading } = useScenarioGeoJson(key, { edges: true });
  const { geojson: stationsFC } = useScenarioGeoJson(key);

  const accessEntry = access.lookup(key);
  const current = coveredWithin300m(accessEntry);
  const bands = bandBreakdown(accessEntry);

  const baselineKey = useMemo(() => {
    if (!summary.params) return null;
    const minN = summary.params.N[0];
    if (minN == null || minN === n) return null;
    return scenarioKey({ n: minN, w, pop, lam });
  }, [summary.params, n, w, pop, lam]);
  const baselineEntry = access.lookup(baselineKey);
  const baseline = coveredWithin300m(baselineEntry);

  const predictedTrips = row?.predicted_trips_yr ?? null;
  const vsCurrentPct = row?.vs_current_pct ?? null;

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP,
      center: CENTER,
      zoom: 12.2,
      attributionControl: { compact: true },
      interactive: false,
    });

    map.on('load', () => {
      map.addSource('coverage', emptyFC());
      map.addSource('edges', emptyFC());
      map.addSource('stations-centroids', emptyFC());

      map.addLayer({
        id: 'coverage-fill',
        type: 'fill',
        source: 'coverage',
        paint: {
          'fill-color': matchExprFor('accessibility', BAND_COLORS, BAND_COLOR_FALLBACK),
          'fill-opacity': 0.55,
        },
      });

      map.addLayer({
        id: 'coverage-line',
        type: 'line',
        source: 'coverage',
        paint: {
          'line-color': '#0b1220',
          'line-width': 0.3,
          'line-opacity': 0.4,
        },
      });

      map.addLayer({
        id: 'edges-line',
        type: 'line',
        source: 'edges',
        filter: ['!=', ['get', 'accessibility'], null],
        paint: {
          'line-color': matchExprFor('accessibility', BAND_COLORS, 'rgba(0,0,0,0)'),
          'line-width': 1.2,
          'line-opacity': 0.7,
        },
      });

      map.addLayer({
        id: 'stations-centroids',
        type: 'circle',
        source: 'stations-centroids',
        paint: {
          'circle-radius': 5,
          'circle-color': matchExprFor('status', STATION_COLORS, STATION_COLORS.default),
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.2,
        },
      });

      styleReadyRef.current = true;
      mapRef.current = map;

      if (pendingRef.current.coverage) {
        applyCoverage(map, pendingRef.current.coverage);
        pendingRef.current.coverage = null;
      }
      if (pendingRef.current.edges) {
        applyEdges(map, pendingRef.current.edges);
        pendingRef.current.edges = null;
      }
      if (pendingRef.current.stations) {
        applyStations(map, pendingRef.current.stations);
        pendingRef.current.stations = null;
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
      pendingRef.current.coverage = coverageFC;
      return;
    }
    applyCoverage(map, coverageFC);
  }, [coverageFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!styleReadyRef.current) {
      pendingRef.current.edges = edgesFC;
      return;
    }
    applyEdges(map, edgesFC);
  }, [edgesFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!styleReadyRef.current) {
      pendingRef.current.stations = stationsFC;
      return;
    }
    applyStations(map, stationsFC);
  }, [stationsFC]);

  return (
    <div className="coverage-view">
      <header className="coverage-header">
        <span className="header-kicker">Coverage</span>
        <ScenarioBadge n={n} w={w} pop={pop} lam={lam} />
      </header>

      <section className="coverage-map-wrap">
        <div ref={containerRef} className="coverage-map" />
        {(loading || edgesLoading) && <div className="progress-bar" />}
        <BandLegend />
      </section>

      <MetricsPanel
        current={current}
        baseline={baseline}
        bands={bands}
        predictedTrips={predictedTrips}
        vsCurrentPct={vsCurrentPct}
      />
    </div>
  );
}

function emptyFC() {
  return { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
}

function applyCoverage(map, geojson) {
  const src = map.getSource('coverage');
  if (!src) return;
  src.setData(geojson || { type: 'FeatureCollection', features: [] });
}

function applyEdges(map, geojson) {
  const src = map.getSource('edges');
  if (!src) return;
  src.setData(geojson || { type: 'FeatureCollection', features: [] });
}

function applyStations(map, geojson) {
  const src = map.getSource('stations-centroids');
  if (!src) return;
  if (!geojson) {
    src.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  const centroids = [];
  for (const f of geojson.features || []) {
    if (!f.geometry) continue;
    try {
      const c = turf.centroid(f);
      c.properties = { ...f.properties };
      centroids.push(c);
    } catch {
      /* skip */
    }
  }
  src.setData(turf.featureCollection(centroids));
}

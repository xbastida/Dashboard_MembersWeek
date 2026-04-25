import { useEffect, useState } from 'react';
import { ensureWGS84 } from './reproject.js';

const cache = new Map();

function load(url) {
  if (cache.has(url)) return cache.get(url);
  const promise = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json();
    })
    .then(ensureWGS84);
  cache.set(url, promise);
  return promise;
}

function accessUrl(key, kind) {
  if (kind === 'edges') return `/data/Accessibility/${key}_accessibility_edges.geojson`;
  if (kind === 'access') return `/data/Accessibility/${key}_access.geojson`;
  return `/data/${key}.geojson`;
}

export function useScenarioGeoJson(key, { access = false, edges = false } = {}) {
  const [geojson, setGeojson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!key) {
      setGeojson(null);
      return;
    }
    const url = edges ? accessUrl(key, 'edges') : access ? accessUrl(key, 'access') : accessUrl(key, null);
    let cancelled = false;
    setLoading(true);
    setError(null);
    load(url)
      .then((g) => {
        if (!cancelled) setGeojson(g);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e);
          setGeojson(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, access]);

  return { geojson, loading, error };
}

import { useEffect, useState } from 'react';

const cache = new Map();

function loadTrips(key) {
  const url = `/data/trips/trips_${key}.json`;
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} loading trips for ${key}`);
    return r.json();
  });
  cache.set(url, p);
  return p;
}

// key = "N70_W0.7_POP80_LAM0"  (scenarioKey without the "stations_" prefix)
export function useScenarioTrips(key) {
  const [trips, setTrips] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!key) {
      setTrips(null);
      return;
    }
    // strip "stations_" prefix if accidentally passed full key
    const tripsKey = key.startsWith('stations_') ? key.slice('stations_'.length) : key;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadTrips(tripsKey)
      .then((data) => {
        if (!cancelled) setTrips(data);
      })
      .catch((e) => {
        if (!cancelled) { setError(e); setTrips(null); }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [key]);

  return { trips, loading, error };
}

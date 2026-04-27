import { useEffect, useState } from 'react';

export function useAccessSummary() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/Accessibility/accessibility_percentages.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading accessibility_percentages.json`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    data,
    loading: !data && !error,
    error,
    lookup: (key) => (data && key ? data[key] || null : null),
  };
}

const CUMULATIVE_BANDS = ['100m', '200m', '300m'];

export function coveredWithin100m(entry) {
  if (!entry || !entry.by_category) return { population: null, workplaces: null };
  const b = entry.by_category['100m'];
  if (!b) return { population: null, workplaces: null };
  return {
    population: b.pct_population_of_city || 0,
    workplaces: b.pct_workplaces_of_city || 0,
  };
}

export function coveredWithin300m(entry) {
  if (!entry || !entry.by_category) return { population: null, workplaces: null };
  let pop = 0;
  let work = 0;
  let hasAny = false;
  for (const band of CUMULATIVE_BANDS) {
    const b = entry.by_category[band];
    if (!b) continue;
    hasAny = true;
    pop += b.pct_population_of_city || 0;
    work += b.pct_workplaces_of_city || 0;
  }
  return hasAny ? { population: pop, workplaces: work } : { population: null, workplaces: null };
}

export function bandBreakdown(entry) {
  if (!entry || !entry.by_category) return [];
  return Object.entries(entry.by_category).map(([label, b]) => ({
    label,
    pctPopulation: b.pct_population_of_city || 0,
    pctWorkplaces: b.pct_workplaces_of_city || 0,
  }));
}

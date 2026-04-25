import { useEffect, useMemo, useState } from 'react';

function uniqSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function useSummary() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/optimisation_summary.csv')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading optimisation_summary.csv`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',');
        const rows = lines.slice(1).map((line) => {
          const values = line.split(',');
          const obj = {};
          headers.forEach((h, i) => {
            const v = values[i];
            if (v === 'True') obj[h] = true;
            else if (v === 'False') obj[h] = false;
            else if (v !== '' && !isNaN(Number(v))) obj[h] = Number(v);
            else obj[h] = v;
          });
          return obj;
        });
        setData(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { params, index } = useMemo(() => {
    if (!data) return { params: null, index: null };
    const params = {
      N: uniqSorted(data.map((r) => r.N)),
      W: uniqSorted(data.map((r) => r.W)),
      POP: uniqSorted(data.map((r) => r.MIN_POP_PCT)),
      LAM: uniqSorted(data.map((r) => r.LAM)),
    };
    const index = new Map();
    for (const row of data) {
      const key = rowKey(row.N, row.W, row.MIN_POP_PCT, row.LAM);
      index.set(key, row);
    }
    return { params, index };
  }, [data]);

  const lookup = useMemo(() => {
    if (!index) return () => null;
    return (n, w, pop, lam) => index.get(rowKey(n, w, pop, lam)) || null;
  }, [index]);

  return {
    data,
    params,
    lookup,
    loading: !data && !error,
    error,
  };
}

function rowKey(n, w, pop, lam) {
  return `${n}|${w}|${pop}|${lam}`;
}

export const BAND_ORDER = [
  '100m',
  '200m',
  '300m',
  '400m',
  '500m',
  '600m',
  '700m',
  '800m',
];

export const BAND_COLORS = {
  '100m': '#22c55e',
  '200m': '#65d63c',
  '300m': '#a3e635',
  '400m': '#d4e13d',
  '500m': '#fbbf24',
  '600m': '#fb923c',
  '700m': '#f97316',
  '800m': '#ef4444',
};

export const BAND_COLOR_FALLBACK = '#374151';

export const STATION_COLORS = {
  retained: '#16a34a',
  new: '#2563eb',
  removed: '#94a3b8',
  default: '#64748b',
};

export function matchExprFor(property, map, fallback) {
  const expr = ['match', ['get', property]];
  for (const [k, v] of Object.entries(map)) expr.push(k, v);
  expr.push(fallback);
  return expr;
}

# Dbizi Dashboard — Dual-Display Station Visualization

A two-window visualization for a public exhibit: a horizontal projector display
showing a map of the selected bike-station layout plus scenario controls, and a
perpendicular vertical monitor showing a coverage choropleth and headline
metrics. Both windows run on the same machine and stay in sync via
`BroadcastChannel`.

## First-time setup

```bash
cd Dashboard
npm install
npm run sync-data    # copies ../simulations/YESSIR2 into public/data
```

## Development

```bash
npm run dev
```

Open `http://localhost:5173/` — the launcher page has two buttons:

- **Open map window** → horizontal projector display (controls + station map)
- **Open coverage window** → vertical screen (coverage choropleth + metrics)

Drag each popup to its target display; press `F11` for fullscreen. Any control
change in the map window is broadcast to the coverage window within one frame.

## Production / exhibit mode

```bash
npm run build
npm run preview      # serves dist/ on http://localhost:4173
```

Copy the `dist/` folder (plus `public/data/`) to the exhibit machine and serve
it with any static server.

## Keyboard shortcuts (map window)

- `F` — toggle fullscreen
- `R` — toggle adaptive-radius rings
- `←` / `→` — cycle through the `N` values

## Data source

All visualization data is static, pre-computed in
`../simulations/YESSIR2/` (stations and accessibility GeoJSONs, plus summary
JSONs). Parameter values (`N`, `W`, `POP`, `LAM`) and feasibility flags are
discovered at runtime from `optimisation_summary.json` — regenerating YESSIR2
with a different parameter grid requires no code change.

## Cross-platform

Pure Node + Vite + React, no shell scripts. Developed on Linux, deployed to
Windows: same commands in both.

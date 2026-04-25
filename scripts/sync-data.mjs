import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../simulations/YESSIR2');
const DEST = resolve(__dirname, '../public/data');

// EPSG:25830 = ETRS89 / UTM zone 30N (used for Basque Country / San Sebastián)
proj4.defs(
  'EPSG:25830',
  '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
);
const toWGS84 = proj4('EPSG:25830', 'EPSG:4326');

async function main() {
  try {
    await stat(SRC);
  } catch {
    console.error(`[sync-data] source missing: ${SRC}`);
    process.exit(1);
  }

  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  await cp(SRC, DEST, { recursive: true });
  console.log(`[sync-data] copied ${SRC} -> ${DEST}`);

  const reprojected = await reprojectAllGeojson(DEST);
  console.log(`[sync-data] reprojected ${reprojected} geojson file(s) to EPSG:4326`);
}

async function reprojectAllGeojson(dir) {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      count += await reprojectAllGeojson(full);
      continue;
    }
    if (extname(entry.name).toLowerCase() !== '.geojson') continue;
    const raw = await readFile(full, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`[sync-data] skip (invalid json): ${full}`);
      continue;
    }
    if (!needsReprojection(data)) continue;
    reprojectGeoJson(data);
    data.crs = {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    };
    await writeFile(full, JSON.stringify(data));
    count += 1;
  }
  return count;
}

function needsReprojection(geojson) {
  const name = geojson?.crs?.properties?.name || '';
  return /EPSG::?25830/i.test(name);
}

function reprojectGeoJson(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  for (const f of features) {
    if (!f || !f.geometry) continue;
    f.geometry = reprojectGeometry(f.geometry);
  }
}

function reprojectGeometry(geom) {
  switch (geom.type) {
    case 'Point':
      return { ...geom, coordinates: reprojectCoord(geom.coordinates) };
    case 'MultiPoint':
    case 'LineString':
      return { ...geom, coordinates: geom.coordinates.map(reprojectCoord) };
    case 'MultiLineString':
    case 'Polygon':
      return {
        ...geom,
        coordinates: geom.coordinates.map((ring) => ring.map(reprojectCoord)),
      };
    case 'MultiPolygon':
      return {
        ...geom,
        coordinates: geom.coordinates.map((poly) =>
          poly.map((ring) => ring.map(reprojectCoord))
        ),
      };
    case 'GeometryCollection':
      return {
        ...geom,
        geometries: geom.geometries.map(reprojectGeometry),
      };
    default:
      return geom;
  }
}

function reprojectCoord(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return coord;
  const [x, y, ...rest] = coord;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return coord;
  const [lng, lat] = toWGS84.forward([x, y]);
  return rest.length ? [lng, lat, ...rest] : [lng, lat];
}

main().catch((err) => {
  console.error('[sync-data] failed:', err);
  process.exit(1);
});

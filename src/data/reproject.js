import proj4 from 'proj4';

const UTM30N = '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs';

function isProjected(geojson) {
  const first = geojson?.features?.[0];
  const geom = first?.geometry;
  if (!geom) return false;
  let sample;
  if (geom.type === 'Polygon') sample = geom.coordinates[0]?.[0];
  else if (geom.type === 'MultiPolygon') sample = geom.coordinates[0]?.[0]?.[0];
  else if (geom.type === 'Point') sample = geom.coordinates;
  else if (geom.type === 'LineString' || geom.type === 'MultiPoint') sample = geom.coordinates[0];
  return Array.isArray(sample) && Math.abs(sample[0]) > 180;
}

function convertCoord(c) {
  return proj4(UTM30N, 'WGS84', [c[0], c[1]]);
}

function reprojectGeometry(geom) {
  if (!geom) return geom;
  switch (geom.type) {
    case 'Point':
      return { ...geom, coordinates: convertCoord(geom.coordinates) };
    case 'MultiPoint':
    case 'LineString':
      return { ...geom, coordinates: geom.coordinates.map(convertCoord) };
    case 'MultiLineString':
    case 'Polygon':
      return { ...geom, coordinates: geom.coordinates.map((ring) => ring.map(convertCoord)) };
    case 'MultiPolygon':
      return {
        ...geom,
        coordinates: geom.coordinates.map((poly) => poly.map((ring) => ring.map(convertCoord))),
      };
    default:
      return geom;
  }
}

export function ensureWGS84(geojson) {
  if (!geojson || !isProjected(geojson)) return geojson;
  return {
    ...geojson,
    features: geojson.features.map((f) => ({ ...f, geometry: reprojectGeometry(f.geometry) })),
  };
}

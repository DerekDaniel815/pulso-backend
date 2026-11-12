// Recuadro ampliado de Perú para el respaldo CELL. No se aplica a GNSS:
// el producto debe poder registrar un fix satelital fuera del país.
// Cada límite se puede sustituir con su variable de entorno.
const DEFAULT_CELL_SERVICE_AREA = {
  minLatitude: -20,
  maxLatitude: 1,
  minLongitude: -84,
  maxLongitude: -68,
} as const;

function readBound(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function cellServiceArea() {
  return {
    minLatitude: readBound('CELL_SERVICE_MIN_LATITUDE', DEFAULT_CELL_SERVICE_AREA.minLatitude),
    maxLatitude: readBound('CELL_SERVICE_MAX_LATITUDE', DEFAULT_CELL_SERVICE_AREA.maxLatitude),
    minLongitude: readBound('CELL_SERVICE_MIN_LONGITUDE', DEFAULT_CELL_SERVICE_AREA.minLongitude),
    maxLongitude: readBound('CELL_SERVICE_MAX_LONGITUDE', DEFAULT_CELL_SERVICE_AREA.maxLongitude),
  };
}

export function isCellCoordinateInServiceArea(latitude: number, longitude: number): boolean {
  const area = cellServiceArea();
  return (
    latitude >= area.minLatitude &&
    latitude <= area.maxLatitude &&
    longitude >= area.minLongitude &&
    longitude <= area.maxLongitude
  );
}

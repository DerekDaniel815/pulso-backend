export const HISTORY_GNSS_MOVE_METERS = 50;
export const HISTORY_RAW_LIMIT = 10000;
export const HISTORY_RESULT_LIMIT = 500;

export interface HistoryPoint {
  latitud: number;
  longitud: number;
  precisionGps?: number | null;
  locationSource?: string | null;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earth = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

function moveThresholdMeters(previous: HistoryPoint, next: HistoryPoint): number {
  const approximate =
    previous.locationSource === 'NETWORK' ||
    previous.locationSource === 'CELL' ||
    next.locationSource === 'NETWORK' ||
    next.locationSource === 'CELL';
  if (!approximate) return HISTORY_GNSS_MOVE_METERS;
  const accuracy = Math.max(
    finite(previous.precisionGps ?? NaN) ? Number(previous.precisionGps) : 0,
    finite(next.precisionGps ?? NaN) ? Number(next.precisionGps) : 0,
  );
  return Math.max(HISTORY_GNSS_MOVE_METERS, Math.min(accuracy, 500));
}

/** El arreglo llega del más nuevo al más antiguo. La base no se modifica. */
export function selectSignificantHistory<T extends HistoryPoint>(newestFirst: T[]): T[] {
  const kept: T[] = [];
  for (const point of newestFirst) {
    if (!finite(point.latitud) || !finite(point.longitud)) continue;
    const previous = kept[kept.length - 1];
    if (!previous) {
      kept.push(point);
      continue;
    }
    const distance = haversineMeters(previous.latitud, previous.longitud, point.latitud, point.longitud);
    if (distance >= moveThresholdMeters(previous, point)) kept.push(point);
    if (kept.length >= HISTORY_RESULT_LIMIT) break;
  }
  return kept;
}

export interface LteCellQuery {
  mcc: number;
  mnc: number;
  tac: number;
  eci: number;
  rsrp?: number;
}

export type GoogleGeolocationOutcome =
  | { kind: 'located'; latitude: number; longitude: number; accuracy: number }
  | { kind: 'unavailable' }
  | { kind: 'quota' }
  | { kind: 'timeout' }
  | { kind: 'failed' };

const LTE_ECI_MAX = 268435455;

export function googleCellIsUsable(cell: LteCellQuery): boolean {
  return (
    cell.mcc >= 100 &&
    cell.mcc <= 999 &&
    cell.mnc >= 0 &&
    cell.mnc <= 999 &&
    cell.tac >= 1 &&
    cell.tac <= 65535 &&
    cell.eci > 255 &&
    cell.eci <= LTE_ECI_MAX
  );
}

export function googleCoordinateIsUsable(latitude: number, longitude: number, accuracy: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
    return false;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false;
  }
  if (Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001) {
    return false;
  }
  return accuracy > 0 && accuracy <= 100000;
}

export class GoogleGeolocationClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async locate(cell: LteCellQuery, apiKey: string, timeoutMs = 8000): Promise<GoogleGeolocationOutcome> {
    if (!googleCellIsUsable(cell) || apiKey.trim() === '') {
      return { kind: 'failed' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(
        `https://www.googleapis.com/geolocation/v1/geolocate?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            considerIp: false,
            radioType: 'lte',
            cellTowers: [
              {
                cellId: cell.eci,
                locationAreaCode: cell.tac,
                mobileCountryCode: cell.mcc,
                mobileNetworkCode: cell.mnc,
                ...(cell.rsrp == null ? {} : { signalStrength: cell.rsrp }),
              },
            ],
          }),
          signal: controller.signal,
        },
      );
      if (response.status === 404) {
        return { kind: 'unavailable' };
      }
      if (response.status === 429 || response.status === 403) {
        return { kind: 'quota' };
      }
      if (!response.ok) {
        return { kind: 'failed' };
      }
      const body = (await response.json()) as {
        location?: { lat?: unknown; lng?: unknown };
        accuracy?: unknown;
        error?: { status?: string };
      };
      const status = body.error?.status ?? '';
      if (status === 'NOT_FOUND' || status === 'ZERO_RESULTS') {
        return { kind: 'unavailable' };
      }
      if (status === 'OVER_QUERY_LIMIT' || status === 'RESOURCE_EXHAUSTED') {
        return { kind: 'quota' };
      }
      const latitude = Number(body.location?.lat);
      const longitude = Number(body.location?.lng);
      const accuracy = Number(body.accuracy);
      if (!googleCoordinateIsUsable(latitude, longitude, accuracy)) {
        return { kind: 'unavailable' };
      }
      return { kind: 'located', latitude, longitude, accuracy };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { kind: 'timeout' };
      }
      return { kind: 'failed' };
    } finally {
      clearTimeout(timer);
    }
  }
}

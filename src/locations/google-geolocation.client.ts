export interface LteCellQuery {
  mcc: number;
  mnc: number;
  tac: number;
  eci: number;
  rsrp?: number;
}

export type GoogleFailureCategory =
  | 'clave-invalida'
  | 'restriccion-aplicacion'
  | 'api-deshabilitada'
  | 'facturacion'
  | 'cuota'
  | 'json-invalido'
  | 'timeout'
  | 'temporal'
  | 'configuracion'
  | 'sin-resultado'
  | 'ubicada';

export interface GoogleFailureDiagnostic {
  httpStatus: number | null;
  category: GoogleFailureCategory;
  status: string | null;
  reason: string | null;
}

export type GoogleGeolocationOutcome =
  | { kind: 'located'; latitude: number; longitude: number; accuracy: number; diagnostic: GoogleFailureDiagnostic }
  | { kind: 'unavailable'; diagnostic: GoogleFailureDiagnostic }
  | { kind: 'quota'; diagnostic: GoogleFailureDiagnostic }
  | { kind: 'rejected'; diagnostic: GoogleFailureDiagnostic }
  | { kind: 'timeout'; diagnostic: GoogleFailureDiagnostic }
  | { kind: 'failed'; diagnostic?: GoogleFailureDiagnostic };

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

const SAFE_REASON = /^[A-Za-z0-9_]{1,64}$/;

export function sanitizeGoogleReason(value: unknown): string | null {
  if (typeof value !== 'string' || !SAFE_REASON.test(value)) {
    return null;
  }
  return value;
}

export function formatGoogleDiagnostic(diagnostic: GoogleFailureDiagnostic): string {
  const http = diagnostic.httpStatus == null ? 'none' : String(diagnostic.httpStatus);
  const status = sanitizeGoogleReason(diagnostic.status);
  const reason = sanitizeGoogleReason(diagnostic.reason);
  return `[GEOLOCATION] http=${http}${status == null ? '' : ` status=${status}`}${reason == null ? '' : ` reason=${reason}`}`;
}

function diagnostic(
  httpStatus: number | null,
  category: GoogleFailureCategory,
  reason: string | null,
  status: string | null,
): GoogleFailureDiagnostic {
  return {
    httpStatus,
    category,
    status: sanitizeGoogleReason(status),
    reason: sanitizeGoogleReason(reason),
  };
}

const GENERIC_GOOGLE_REASONS = new Set(['forbidden']);

function rememberReason(raw: unknown, specific: string[], generic: string[]): void {
  const clean = sanitizeGoogleReason(raw);
  if (clean == null) {
    return;
  }
  if (GENERIC_GOOGLE_REASONS.has(clean.toLowerCase())) {
    generic.push(clean);
    return;
  }
  specific.push(clean);
}

function googleTokens(body: unknown): { reason: string | null; status: string | null } {
  if (body == null || typeof body !== 'object') {
    return { reason: null, status: null };
  }
  const error = (body as { error?: unknown }).error;
  if (error == null || typeof error !== 'object') {
    return { reason: null, status: null };
  }
  const record = error as { status?: unknown; errors?: unknown; details?: unknown };
  const specific: string[] = [];
  const generic: string[] = [];
  const errorInfo: unknown[] = [];
  const otherDetails: unknown[] = [];
  if (Array.isArray(record.details)) {
    for (const detail of record.details) {
      if (detail == null || typeof detail !== 'object') {
        continue;
      }
      const typeName = (detail as { '@type'?: unknown })['@type'];
      const bucket = typeof typeName === 'string' && typeName.includes('ErrorInfo') ? errorInfo : otherDetails;
      bucket.push((detail as { reason?: unknown }).reason);
    }
  }
  for (const reason of [...errorInfo, ...otherDetails]) {
    rememberReason(reason, specific, generic);
  }
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      if (item != null && typeof item === 'object') {
        rememberReason((item as { reason?: unknown }).reason, specific, generic);
      }
    }
  }
  return {
    reason: specific[0] ?? generic[0] ?? null,
    status: sanitizeGoogleReason(record.status),
  };
}

function tokenOf(reason: string | null, status: string | null): string {
  return (reason ?? status ?? '').toUpperCase();
}

export function classifyGoogleFailure(httpStatus: number, body: unknown): GoogleGeolocationOutcome {
  const { reason, status } = googleTokens(body);
  const token = tokenOf(reason, status);
  const info = diagnostic(httpStatus, 'temporal', reason, status);
  const rejected = (category: GoogleFailureCategory): GoogleGeolocationOutcome => ({
    kind: 'rejected',
    diagnostic: diagnostic(httpStatus, category, reason, status),
  });

  if (token === 'API_KEY_INVALID' || token === 'KEYINVALID') {
    return rejected('clave-invalida');
  }
  if (token === 'SERVICE_DISABLED' || token === 'ACCESSNOTCONFIGURED' || token === 'CONSUMER_INVALID') {
    return rejected('api-deshabilitada');
  }
  if (token.startsWith('API_KEY_') || token === 'REQUEST_DENIED' || token === 'FORBIDDEN') {
    return rejected('restriccion-aplicacion');
  }
  if (token === 'BILLING_DISABLED' || token === 'BILLINGNOTENABLED') {
    return rejected('facturacion');
  }
  if (
    httpStatus === 429 ||
    token === 'OVER_QUERY_LIMIT' ||
    token === 'RESOURCE_EXHAUSTED' ||
    token === 'RATE_LIMIT_EXCEEDED' ||
    token === 'USER_RATE_LIMIT_EXCEEDED' ||
    token === 'DAILY_LIMIT_EXCEEDED' ||
    token === 'DAILYLIMITEXCEEDED' ||
    token === 'USERRATELIMITEXCEEDED' ||
    token === 'RATELIMITEXCEEDED'
  ) {
    return { kind: 'quota', diagnostic: diagnostic(httpStatus, 'cuota', reason, status) };
  }
  if (httpStatus === 404 || token === 'NOT_FOUND' || token === 'ZERO_RESULTS') {
    return { kind: 'unavailable', diagnostic: diagnostic(httpStatus, 'sin-resultado', reason, status) };
  }
  if (token === 'PARSEERROR' || token === 'INVALID_ARGUMENT') {
    return { kind: 'failed', diagnostic: diagnostic(httpStatus, 'json-invalido', reason, status) };
  }
  if (httpStatus === 400 || httpStatus === 403) {
    return rejected('configuracion');
  }
  if (httpStatus >= 500) {
    return { kind: 'failed', diagnostic: { ...info, category: 'temporal' } };
  }
  return { kind: 'failed', diagnostic: info };
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
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return {
          kind: 'failed',
          diagnostic: diagnostic(response.status, 'json-invalido', null, null),
        };
      }
      if (!response.ok || (body != null && typeof body === 'object' && 'error' in body)) {
        const classified = classifyGoogleFailure(response.status, body);
        if (classified.kind !== 'failed' || response.status !== 200) {
          return classified;
        }
      }
      const located = body as { location?: { lat?: unknown; lng?: unknown }; accuracy?: unknown };
      const latitude = Number(located.location?.lat);
      const longitude = Number(located.location?.lng);
      const accuracy = Number(located.accuracy);
      if (!googleCoordinateIsUsable(latitude, longitude, accuracy)) {
        return { kind: 'unavailable', diagnostic: diagnostic(response.status, 'sin-resultado', null, null) };
      }
      return {
        kind: 'located',
        latitude,
        longitude,
        accuracy,
        diagnostic: diagnostic(response.status, 'ubicada', null, null),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { kind: 'timeout', diagnostic: diagnostic(null, 'timeout', null, null) };
      }
      return { kind: 'failed', diagnostic: diagnostic(null, 'temporal', null, null) };
    } finally {
      clearTimeout(timer);
    }
  }
}

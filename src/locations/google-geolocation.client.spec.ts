import { describe, expect, it, vi } from 'vitest';
import {
  classifyGoogleFailure,
  formatGoogleDiagnostic,
  GoogleGeolocationClient,
  googleCoordinateIsUsable,
} from './google-geolocation.client.js';

const cell = { mcc: 716, mnc: 17, tac: 23100, eci: 1234567, rsrp: -95 };

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('GoogleGeolocationClient', () => {
  it('pide solo la celda LTE y no usa la IP del servidor', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(200, { location: { lat: -12.0464, lng: -77.0428 }, accuracy: 850 }),
    );
    const client = new GoogleGeolocationClient(fetchImpl);
    const result = await client.locate(cell, 'server-key');

    expect(result).toMatchObject({
      kind: 'located',
      latitude: -12.0464,
      longitude: -77.0428,
      accuracy: 850,
      diagnostic: { httpStatus: 200, category: 'ubicada', reason: null },
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/geolocate?key=');
    const payload = JSON.parse(String(init.body));
    expect(payload).toEqual({
      considerIp: false,
      radioType: 'lte',
      cellTowers: [
        {
          cellId: 1234567,
          locationAreaCode: 23100,
          mobileCountryCode: 716,
          mobileNetworkCode: 17,
          signalStrength: -95,
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toMatch(/imsi|iccid|imei/i);
  });

  it('distingue ausencia, cuota, timeout y caída temporal', async () => {
    const client = new GoogleGeolocationClient(vi.fn().mockResolvedValue(response(404, {})));
    await expect(client.locate(cell, 'server-key')).resolves.toMatchObject({
      kind: 'unavailable',
      diagnostic: { category: 'sin-resultado' },
    });

    const quota = new GoogleGeolocationClient(vi.fn().mockResolvedValue(response(429, {})));
    await expect(quota.locate(cell, 'server-key')).resolves.toMatchObject({
      kind: 'quota',
      diagnostic: { httpStatus: 429, category: 'cuota' },
    });

    const aborted = new GoogleGeolocationClient(
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    await expect(aborted.locate(cell, 'server-key')).resolves.toMatchObject({
      kind: 'timeout',
      diagnostic: { httpStatus: null, category: 'timeout' },
    });

    const down = new GoogleGeolocationClient(vi.fn().mockRejectedValue(new Error('network')));
    await expect(down.locate(cell, 'server-key')).resolves.toMatchObject({
      kind: 'failed',
      diagnostic: { httpStatus: null, category: 'temporal' },
    });

    const outage = new GoogleGeolocationClient(vi.fn().mockResolvedValue(response(503, {})));
    await expect(outage.locate(cell, 'server-key')).resolves.toMatchObject({
      kind: 'failed',
      diagnostic: { httpStatus: 503, category: 'temporal' },
    });
  });

  it('no trata un 400 o 403 de credencial como una caída temporal', () => {
    expect(classifyGoogleFailure(400, { error: { errors: [{ reason: 'keyInvalid' }], code: 400 } })).toMatchObject({
      kind: 'rejected',
      diagnostic: { httpStatus: 400, category: 'clave-invalida', reason: 'keyInvalid' },
    });
    expect(classifyGoogleFailure(403, {
      error: { status: 'PERMISSION_DENIED', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] },
    })).toMatchObject({
      kind: 'rejected',
      diagnostic: {
        httpStatus: 403,
        category: 'restriccion-aplicacion',
        status: 'PERMISSION_DENIED',
        reason: 'API_KEY_HTTP_REFERRER_BLOCKED',
      },
    });
    expect(classifyGoogleFailure(403, {
      error: {
        code: 403,
        message: 'Requests from referer are blocked. key=AIzaSecret https://maps.googleapis.com/geolocate?key=AIzaSecret',
        errors: [{ domain: 'global', reason: 'forbidden', message: 'cell 716-17-23100-1234567' }],
        status: 'PERMISSION_DENIED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'API_KEY_IP_ADDRESS_BLOCKED',
            metadata: { callerIp: '203.0.113.10', consumer: 'projects/pulso' },
          },
        ],
      },
    })).toMatchObject({
      kind: 'rejected',
      diagnostic: {
        httpStatus: 403,
        status: 'PERMISSION_DENIED',
        reason: 'API_KEY_IP_ADDRESS_BLOCKED',
      },
    });
    const legacyForbidden = classifyGoogleFailure(403, {
      error: {
        code: 403,
        message: 'Requests to this API geolocation.googleapis.com method google.geolocation.v1.GeolocationService.Geolocate are blocked.',
        errors: [{
          domain: 'global',
          reason: 'forbidden',
          message: 'key=AIzaSecret https://maps.googleapis.com/geolocate?key=AIzaSecret 716-17-23100-1234567',
        }],
      },
    });
    expect(legacyForbidden).toMatchObject({
      kind: 'rejected',
      diagnostic: {
        httpStatus: 403,
        status: null,
        reason: 'API_KEY_SERVICE_BLOCKED',
      },
    });
    expect(formatGoogleDiagnostic(legacyForbidden.diagnostic!)).toBe(
      '[GEOLOCATION] http=403 reason=API_KEY_SERVICE_BLOCKED',
    );
    expect(formatGoogleDiagnostic(legacyForbidden.diagnostic!)).not.toMatch(/forbidden|AIza|googleapis|geolocate|716|23100|1234567/);
    const legacyText = classifyGoogleFailure(403, {
      error: {
        code: 403,
        message: 'The caller does not have permission. key=AIzaSecret https://maps.googleapis.com/geolocate?key=AIzaSecret',
        errors: [{ domain: 'global', reason: 'forbidden' }],
      },
    });
    expect(formatGoogleDiagnostic(legacyText.diagnostic!)).toBe(
      '[GEOLOCATION] http=403 reason=The_caller_does_not_have_permission',
    );
    expect(formatGoogleDiagnostic(legacyText.diagnostic!)).not.toMatch(/forbidden|AIza|googleapis/);
    expect(classifyGoogleFailure(403, { error: { errors: [{ reason: 'accessNotConfigured' }] } })).toMatchObject({
      kind: 'rejected',
      diagnostic: { category: 'api-deshabilitada', reason: 'accessNotConfigured' },
    });
    expect(classifyGoogleFailure(403, { error: { status: 'BILLING_DISABLED' } })).toMatchObject({
      kind: 'rejected',
      diagnostic: { category: 'facturacion', status: 'BILLING_DISABLED', reason: null },
    });
    expect(classifyGoogleFailure(403, {})).toMatchObject({
      kind: 'rejected',
      diagnostic: { httpStatus: 403, category: 'configuracion', reason: null },
    });
    expect(classifyGoogleFailure(400, { error: { errors: [{ reason: 'parseError' }] } })).toMatchObject({
      kind: 'failed',
      diagnostic: { category: 'json-invalido', reason: 'parseError' },
    });
  });

  it('un cuerpo ilegible no se convierte en caída ni en rechazo de clave', async () => {
    const client = new GoogleGeolocationClient(vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as Response));
    await expect(client.locate(cell, 'server-key')).resolves.toMatchObject({
      kind: 'failed',
      diagnostic: { httpStatus: 400, category: 'json-invalido', reason: null },
    });
  });

  it('el registro solo conserva el código, el status y el motivo específico', () => {
    const blocked = classifyGoogleFailure(403, {
      error: {
        message: 'key=AIzaSecret https://www.googleapis.com/geolocation/v1/geolocate?key=AIzaSecret',
        errors: [{ reason: 'forbidden', message: '716 17 23100 1234567' }],
        status: 'PERMISSION_DENIED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_IP_ADDRESS_BLOCKED' }],
      },
    });
    const line = formatGoogleDiagnostic(blocked.diagnostic!);
    expect(line).toBe('[GEOLOCATION] http=403 status=PERMISSION_DENIED reason=API_KEY_IP_ADDRESS_BLOCKED');
    expect(line).not.toMatch(/AIza|googleapis|geolocate|716|23100|1234567|203\.0\.113/);
    expect(formatGoogleDiagnostic({
      httpStatus: 400,
      category: 'clave-invalida',
      status: 'INVALID_ARGUMENT',
      reason: 'AIzaSysecret?key=abc https://maps.googleapis.com 716-17',
    })).toBe('[GEOLOCATION] http=400 status=INVALID_ARGUMENT');
  });

  it('descarta una coordenada o un radio inválidos', () => {
    expect(googleCoordinateIsUsable(-12, -77, 800)).toBe(true);
    expect(googleCoordinateIsUsable(0, 0, 10)).toBe(false);
    expect(googleCoordinateIsUsable(91, 0, 10)).toBe(false);
    expect(googleCoordinateIsUsable(-12, -77, 0)).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { GoogleGeolocationClient, googleCoordinateIsUsable } from './google-geolocation.client.js';

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

    expect(result).toEqual({ kind: 'located', latitude: -12.0464, longitude: -77.0428, accuracy: 850 });
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

  it('distingue ausencia, cuota, timeout y fallo', async () => {
    const client = new GoogleGeolocationClient(vi.fn().mockResolvedValue(response(404, {})));
    await expect(client.locate(cell, 'server-key')).resolves.toEqual({ kind: 'unavailable' });

    const quota = new GoogleGeolocationClient(vi.fn().mockResolvedValue(response(429, {})));
    await expect(quota.locate(cell, 'server-key')).resolves.toEqual({ kind: 'quota' });

    const aborted = new GoogleGeolocationClient(
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    await expect(aborted.locate(cell, 'server-key')).resolves.toEqual({ kind: 'timeout' });

    const down = new GoogleGeolocationClient(vi.fn().mockRejectedValue(new Error('network')));
    await expect(down.locate(cell, 'server-key')).resolves.toEqual({ kind: 'failed' });
  });

  it('descarta una coordenada o un radio inválidos', () => {
    expect(googleCoordinateIsUsable(-12, -77, 800)).toBe(true);
    expect(googleCoordinateIsUsable(0, 0, 10)).toBe(false);
    expect(googleCoordinateIsUsable(91, 0, 10)).toBe(false);
    expect(googleCoordinateIsUsable(-12, -77, 0)).toBe(false);
  });
});

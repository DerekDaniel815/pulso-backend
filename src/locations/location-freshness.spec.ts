import { describe, expect, it } from 'vitest';
import {
  applyLiveMetadata,
  assertDeviceTimestampNotInFuture,
  locationLiveTtlSeconds,
} from './location-freshness.js';
import type { LocationResponseDto } from './dto/location-response.dto.js';

function point(overrides: Partial<LocationResponseDto>): LocationResponseDto {
  return {
    idUbicacion: '1',
    idUsuarioDispositivo: 10,
    latitud: 1,
    longitud: 2,
    altitud: null,
    precisionGps: null,
    velocidad: null,
    fechaHoraDispositivo: '2026-10-22T20:00:00.000Z',
    fechaHoraServidor: '2026-10-22T20:00:01.000Z',
    fueSincronizadaOffline: false,
    isLive: false,
    liveExpiresAt: null,
    ...overrides,
  };
}

describe('frescura de ubicación normal', () => {
  it('el TTL predeterminado es 25 segundos', () => {
    const previous = process.env.LOCATION_LIVE_TTL_SECONDS;
    delete process.env.LOCATION_LIVE_TTL_SECONDS;
    expect(locationLiveTtlSeconds()).toBe(25);
    if (previous == null) delete process.env.LOCATION_LIVE_TTL_SECONDS;
    else process.env.LOCATION_LIVE_TTL_SECONDS = previous;
  });

  const now = new Date('2026-10-22T20:01:00.000Z');

  it('un punto online dentro de 90 s está en vivo', () => {
    const live = applyLiveMetadata(
      point({ fechaHoraServidor: '2026-10-22T20:00:00.000Z' }),
      now,
      90,
    );
    expect(live.isLive).toBe(true);
    expect(live.liveExpiresAt).toBe('2026-10-22T20:01:30.000Z');
  });

  it('un punto online anterior al TTL no está en vivo y conserva liveExpiresAt', () => {
    const stale = applyLiveMetadata(
      point({ fechaHoraServidor: '2026-10-22T19:58:00.000Z' }),
      now,
      90,
    );
    expect(stale.isLive).toBe(false);
    expect(stale.liveExpiresAt).toBe('2026-10-22T19:59:30.000Z');
  });

  it('offlineSync true nunca está en vivo', () => {
    const offline = applyLiveMetadata(
      point({
        fueSincronizadaOffline: true,
        fechaHoraServidor: '2026-10-22T20:00:50.000Z',
      }),
      now,
      90,
    );
    expect(offline.isLive).toBe(false);
    expect(offline.liveExpiresAt).toBeNull();
  });

  it('acepta una hora de dispositivo antigua y rechaza una futura de más de dos minutos', () => {
    expect(() => assertDeviceTimestampNotInFuture('2020-01-01T00:00:00.000Z', now)).not.toThrow();
    expect(() =>
      assertDeviceTimestampNotInFuture('2026-10-22T20:04:00.000Z', now),
    ).toThrow(/futuro/);
  });
});

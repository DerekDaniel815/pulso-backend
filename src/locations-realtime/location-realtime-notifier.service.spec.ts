import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationRealtimeNotifier } from './location-realtime-notifier.service.js';
import type { LocationsRealtimeGateway } from './locations-realtime.gateway.js';
import type { LocationUpdatedPayload } from './location-updated.payload.js';

const payload: LocationUpdatedPayload = {
  location: {
    idUbicacion: '6',
    idUsuarioDispositivo: 1,
    latitud: 37.421998,
    longitud: -122.084,
    altitud: 5,
    precisionGps: 5,
    velocidad: 0,
    fechaHoraDispositivo: '2026-09-10T06:00:00.000Z',
    fechaHoraServidor: '2026-09-10T06:00:01.000Z',
    fueSincronizadaOffline: false,
  },
  assignment: {
    idUsuarioDispositivo: 1,
    idUsuario: 1,
    alias: 'Derek gps simulado',
    codigoDispositivo: 'PUL-X7K4M92Q',
  },
};

describe('LocationRealtimeNotifier', () => {
  let gateway: { emitLocationUpdated: ReturnType<typeof vi.fn> };
  let notifier: LocationRealtimeNotifier;

  beforeEach(() => {
    gateway = { emitLocationUpdated: vi.fn() };
    notifier = new LocationRealtimeNotifier(gateway as unknown as LocationsRealtimeGateway);
  });

  it('emite al propietario y no hace broadcast global', () => {
    notifier.notifyLocationSaved(payload);

    expect(gateway.emitLocationUpdated).toHaveBeenCalledOnce();
    expect(gateway.emitLocationUpdated).toHaveBeenCalledWith(1, payload);
  });
});

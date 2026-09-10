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
  let gateway: {
    emitLocationUpdated: ReturnType<typeof vi.fn>;
    emitLocationPublicUpdated: ReturnType<typeof vi.fn>;
    emitEmergencyPublicUpdated: ReturnType<typeof vi.fn>;
    emitEmergencyPublicEnded: ReturnType<typeof vi.fn>;
    emitLocationPublicRemoved: ReturnType<typeof vi.fn>;
  };
  let notifier: LocationRealtimeNotifier;

  beforeEach(() => {
    gateway = {
      emitLocationUpdated: vi.fn(),
      emitLocationPublicUpdated: vi.fn(),
      emitEmergencyPublicUpdated: vi.fn(),
      emitEmergencyPublicEnded: vi.fn(),
      emitLocationPublicRemoved: vi.fn(),
    };
    notifier = new LocationRealtimeNotifier(gateway as unknown as LocationsRealtimeGateway);
  });

  it('emite al propietario y no hace broadcast global', () => {
    notifier.notifyLocationSaved(payload, [1]);

    expect(gateway.emitLocationUpdated).toHaveBeenCalledOnce();
    expect(gateway.emitLocationUpdated).toHaveBeenCalledWith([1], payload);
  });

  it('emite location.public.updated cuando hay payload público', () => {
    const publicPayload = {
      clavePublica: 'VIS-1',
      origen: 'PUBLICO' as const,
      codigoPublico: null,
      ubicacion: {
        latitud: 37.42,
        longitud: -122.08,
        altitud: null,
        fechaHoraDispositivo: '2026-09-10T06:00:00.000Z',
      },
    };

    notifier.notifyLocationSaved(payload, [1, 2, 2], publicPayload);

    expect(gateway.emitLocationUpdated).toHaveBeenCalledWith([1, 2], payload);
    expect(gateway.emitLocationPublicUpdated).toHaveBeenCalledWith(publicPayload);
  });

  it('emite location.public.removed solo si deja de ser público', () => {
    notifier.notifyIfPublicAudienceLost(
      { isPublic: true, clavePublica: 'VIS-10' },
      { isPublic: false },
    );

    expect(gateway.emitLocationPublicRemoved).toHaveBeenCalledWith({ clavePublica: 'VIS-10' });
  });

  it('no emite location.public.removed si sigue público por SOS', () => {
    notifier.notifyIfPublicAudienceLost(
      { isPublic: true, clavePublica: 'VIS-10' },
      { isPublic: true },
    );

    expect(gateway.emitLocationPublicRemoved).not.toHaveBeenCalled();
  });
});

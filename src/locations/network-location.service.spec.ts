import { describe, expect, it, vi } from 'vitest';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { GoogleGeolocationClient } from './google-geolocation.client.js';
import { NetworkLocationService } from './network-location.service.js';

const device: AuthenticatedDevice = {
  idDispositivo: 5,
  codigoDispositivo: 'PUL-X7K4M92Q',
  idUsuarioDispositivo: 1,
  idUsuario: 1,
  dispositivoEstado: EstadoDispositivo.ASIGNADO,
  ubicacionActiva: true,
};

const observation = {
  radioType: 'lte' as const,
  mcc: 716,
  mnc: 17,
  tac: 23100,
  eci: 1234567,
  rsrp: -95,
  deviceTimestamp: '2026-11-15T22:00:00.000Z',
  clientLocationId: 'b0000000100000002',
};

function serviceFor(options: {
  key?: string;
  locate?: ReturnType<typeof vi.fn>;
  store?: ReturnType<typeof vi.fn>;
  emergency?: boolean;
  prisma?: { emergencia: { findMany: ReturnType<typeof vi.fn> }; ubicacion: { findFirst: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> } };
}) {
  const locate = options.locate ?? vi.fn();
  const store = options.store ?? vi.fn().mockResolvedValue({
    location: { fechaHoraServidor: '2026-11-15T22:00:01.000Z' },
    created: true,
  });
  const service = new NetworkLocationService(
    { get: (name: string) => (name === 'GOOGLE_GEOLOCATION_API_KEY' ? options.key : undefined) } as never,
    { storeDeviceLocation: store } as never,
    { touchConnection: vi.fn().mockResolvedValue(new Date()) } as never,
    { hasActiveEmergency: vi.fn().mockResolvedValue(options.emergency ?? false) } as never,
    (options.prisma ?? { emergencia: { findMany: vi.fn() }, ubicacion: { findFirst: vi.fn(), deleteMany: vi.fn() } }) as never,
    { locate } as unknown as GoogleGeolocationClient,
  );
  return { service, locate, store };
}

describe('NetworkLocationService', () => {
  it('queda apagado y no consulta Google cuando falta la clave', async () => {
    const { service, locate, store } = serviceFor({ key: '   ' });
    await expect(service.report(device, observation)).resolves.toMatchObject({
      status: 'disabled',
      retryAfterSeconds: 300,
    });
    expect(locate).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it('guarda NETWORK con la respuesta validada y reutiliza la caché de la misma celda', async () => {
    const locate = vi.fn().mockResolvedValue({ kind: 'located', latitude: -12.05, longitude: -77.04, accuracy: 900 });
    const { service, store } = serviceFor({ key: 'server-key', locate });

    await expect(service.report(device, observation)).resolves.toMatchObject({ status: 'located', retryAfterSeconds: 60 });
    await expect(service.report(device, { ...observation, clientLocationId: 'b0000000100000003' })).resolves.toMatchObject({
      status: 'cached',
    });

    expect(locate).toHaveBeenCalledOnce();
    expect(store).toHaveBeenNthCalledWith(1, 1, 5, expect.objectContaining({
      fuente: 'NETWORK',
      latitud: -12.05,
      longitud: -77.04,
      precisionGps: 900,
      clientLocationId: 'b0000000100000002',
    }));
    expect(store).toHaveBeenNthCalledWith(2, 1, 5, expect.objectContaining({
      clientLocationId: 'b0000000100000003',
    }));
  });

  it('espera más ante cuota y no guarda una ausencia', async () => {
    const quota = serviceFor({ key: 'server-key', locate: vi.fn().mockResolvedValue({ kind: 'quota' }) });
    await expect(quota.service.report(device, observation)).resolves.toMatchObject({ status: 'retry', retryAfterSeconds: 900 });
    expect(quota.store).not.toHaveBeenCalled();

    const missing = serviceFor({ key: 'server-key', locate: vi.fn().mockResolvedValue({ kind: 'unavailable' }) });
    await expect(missing.service.report(device, observation)).resolves.toMatchObject({
      status: 'unavailable',
      retryAfterSeconds: 120,
    });
    expect(missing.store).not.toHaveBeenCalled();
  });

  it('depura NETWORK vencido y conserva GNSS y el punto de una emergencia activa', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const findFirst = vi.fn().mockResolvedValue({ idUbicacion: 90n, fuente: 'NETWORK' });
    const { service } = serviceFor({
      prisma: {
        emergencia: { findMany: vi.fn().mockResolvedValue([{ idUsuarioDispositivo: 7 }]) },
        ubicacion: { findFirst, deleteMany },
      },
    });

    await expect(service.purgeExpired(new Date('2026-11-15T00:00:00.000Z'))).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        fuente: 'NETWORK',
        fechaHoraServidor: { lt: new Date('2026-10-16T00:00:00.000Z') },
        idUbicacion: { notIn: [90n] },
      },
    });
  });
});

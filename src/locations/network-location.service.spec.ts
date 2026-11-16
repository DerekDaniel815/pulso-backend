import { Logger } from '@nestjs/common';
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
  prisma?: {
    emergencia: { findMany: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn> };
    ubicacion: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany?: ReturnType<typeof vi.fn>;
      deleteMany?: ReturnType<typeof vi.fn>;
      update?: ReturnType<typeof vi.fn>;
    };
  };
}) {
  const locate = options.locate ?? vi.fn();
  const store = options.store ?? vi.fn().mockResolvedValue({
    location: { fechaHoraServidor: '2026-11-15T22:00:01.000Z' },
    created: true,
  });
  const publishLatestForAssignment = vi.fn();
  const service = new NetworkLocationService(
    { get: (name: string) => (name === 'GOOGLE_GEOLOCATION_API_KEY' ? options.key : undefined) } as never,
    { storeDeviceLocation: store, publishLatestForAssignment } as never,
    { touchConnection: vi.fn().mockResolvedValue(new Date()) } as never,
    { hasActiveEmergency: vi.fn().mockResolvedValue(options.emergency ?? false) } as never,
    (options.prisma ?? {
      emergencia: { findMany: vi.fn(), update: vi.fn() },
      ubicacion: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    }) as never,
    { locate } as unknown as GoogleGeolocationClient,
  );
  return { service, locate, store, publishLatestForAssignment };
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

  it('guarda la hora de la estimación y renueva el mismo punto sin otra consulta', async () => {
    const locate = vi.fn().mockResolvedValue({ kind: 'located', latitude: -12.05, longitude: -77.04, accuracy: 900 });
    let estimate = '';
    const findFirst = vi.fn(async (args: { where?: { clientLocationId?: string } }) => {
      if (args?.where?.clientLocationId || estimate === '') return null;
      return {
        idUbicacion: 4n,
        fuente: 'NETWORK',
        fechaHoraDispositivo: new Date(estimate),
        fechaHoraServidor: new Date('2026-11-15T22:00:01.000Z'),
      };
    });
    const update = vi.fn().mockResolvedValue({ fechaHoraServidor: new Date('2026-11-15T22:00:11.000Z') });
    const store = vi.fn(async (_assignment: number, _deviceId: number, input: { fechaHoraDispositivo: string }) => {
      estimate = input.fechaHoraDispositivo;
      return { location: { fechaHoraServidor: '2026-11-15T22:00:01.000Z' }, created: true };
    });
    const { service, publishLatestForAssignment } = serviceFor({
      key: 'server-key',
      locate,
      store,
      prisma: {
        emergencia: { findMany: vi.fn() },
        ubicacion: { findFirst, update },
      },
    });

    await expect(service.report(device, observation)).resolves.toMatchObject({
      status: 'located',
      retryAfterSeconds: 10,
    });
    await expect(service.report(device, { ...observation, clientLocationId: 'b0000000100000003' })).resolves.toMatchObject({
      status: 'cached',
      retryAfterSeconds: 10,
      receivedAt: '2026-11-15T22:00:11.000Z',
    });

    expect(locate).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledOnce();
    expect(store.mock.calls[0][2].fechaHoraDispositivo).not.toBe(observation.deviceTimestamp);
    expect(update).toHaveBeenCalledWith({
      where: { idUbicacion: 4n },
      data: { fechaHoraServidor: expect.any(Date) },
    });
    expect(publishLatestForAssignment).toHaveBeenCalledWith(1);
  });

  it('no pisa un GNSS que llegó después de la lectura de celda', async () => {
    const locate = vi.fn().mockResolvedValue({ kind: 'located', latitude: -12.05, longitude: -77.04, accuracy: 900 });
    const findFirst = vi.fn().mockResolvedValue({
      fuente: 'GNSS',
      fechaHoraServidor: new Date('2026-11-15T22:00:05.000Z'),
      fechaHoraDispositivo: new Date('2026-11-15T22:00:05.000Z'),
    });
    const { service, store } = serviceFor({
      key: 'server-key',
      locate,
      prisma: { emergencia: { findMany: vi.fn() }, ubicacion: { findFirst } },
    });

    await expect(service.report(device, observation)).resolves.toMatchObject({
      status: 'located',
      receivedAt: '2026-11-15T22:00:05.000Z',
    });
    expect(store).not.toHaveBeenCalled();
  });

  it('un rechazo de configuración espera 900 s y no se registra como caída temporal', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const rejected = serviceFor({
      key: 'server-key',
      locate: vi.fn().mockResolvedValue({
        kind: 'rejected',
        diagnostic: { httpStatus: 403, category: 'restriccion-aplicacion', reason: 'API_KEY_HTTP_REFERRER_BLOCKED' },
      }),
    });
    await expect(rejected.service.report(device, observation)).resolves.toMatchObject({
      status: 'retry',
      retryAfterSeconds: 900,
    });
    expect(rejected.store).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[GEOLOCATION] http=403 categoria=restriccion-aplicacion reason=API_KEY_HTTP_REFERRER_BLOCKED',
    );
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).not.toMatch(/server-key|716|23100|1234567|geolocate|AIza/);

    const outage = serviceFor({
      key: 'server-key',
      locate: vi.fn().mockResolvedValue({
        kind: 'failed',
        diagnostic: { httpStatus: 503, category: 'temporal', reason: null },
      }),
    });
    await expect(outage.service.report(device, observation)).resolves.toMatchObject({
      status: 'retry',
      retryAfterSeconds: 60,
    });
    warn.mockRestore();
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

  it('depura la coordenada Google vencida aunque sea la última de una emergencia activa', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn();
    const findMany = vi.fn().mockResolvedValue([{ idUbicacion: 90n, idUsuarioDispositivo: 7 }]);
    const findFirst = vi.fn().mockResolvedValue({
      idUbicacion: 90n,
      fechaHoraServidor: new Date('2026-10-01T00:00:00.000Z'),
    });
    const { service } = serviceFor({
      prisma: {
        emergencia: {
          findMany: vi.fn().mockResolvedValue([{ idEmergencia: 3n, idUsuarioDispositivo: 7 }]),
          update,
        },
        ubicacion: { findMany, findFirst, deleteMany },
      },
    });

    await expect(service.purgeExpired(new Date('2026-11-15T00:00:00.000Z'))).resolves.toBe(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { fuente: 'NETWORK', fechaHoraDispositivo: { lt: new Date('2026-10-16T00:00:00.000Z') } },
      select: { idUbicacion: true, idUsuarioDispositivo: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { idEmergencia: 3n },
      data: { ubicacionSuprimidaDesde: new Date('2026-10-01T00:00:00.000Z') },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { idUbicacion: { in: [90n] }, fuente: 'NETWORK' },
    });
  });
});

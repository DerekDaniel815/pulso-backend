import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocationAccessService } from './location-access.service.js';
import { LocationsService } from './locations.service.js';

const savedRow = {
  idUbicacion: 6n,
  idUsuarioDispositivo: 1,
  latitud: 37.421998,
  longitud: -122.084,
  altitud: 5,
  precisionGps: 5,
  velocidad: 0,
  fechaHoraDispositivo: new Date('2026-09-10T06:00:00.000Z'),
  fechaHoraServidor: new Date('2026-09-10T06:00:01.000Z'),
  fueSincronizadaOffline: false,
};

const assignment = {
  idUsuarioDispositivo: 1,
  idUsuario: 1,
  alias: 'Derek gps simulado',
  dispositivo: { codigoDispositivo: 'PUL-X7K4M92Q' },
};

describe('LocationsService realtime', () => {
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    usuarioDispositivo: { findUnique: ReturnType<typeof vi.fn> };
    ubicacion: { create: ReturnType<typeof vi.fn> };
    dispositivo: { update: ReturnType<typeof vi.fn> };
  };
  let notifier: { notifyLocationSaved: ReturnType<typeof vi.fn> };
  let service: LocationsService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn(),
      usuarioDispositivo: { findUnique: vi.fn() },
      ubicacion: { create: vi.fn() },
      dispositivo: { update: vi.fn() },
    };
    notifier = { notifyLocationSaved: vi.fn() };
    service = new LocationsService(
      prisma as unknown as PrismaService,
      {} as LocationAccessService,
      notifier as unknown as LocationRealtimeNotifier,
    );
  });

  it('emite location.updated al propietario después de persistir sin tx', async () => {
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => {
      prisma.ubicacion.create.mockResolvedValue(savedRow);
      prisma.dispositivo.update.mockResolvedValue({});
      return callback(prisma);
    });
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(assignment);

    await service.createForAssignment(1, 5, {
      latitud: 37.421998,
      longitud: -122.084,
      precisionGps: 5,
      fechaHoraDispositivo: '2026-09-10T06:00:00.000Z',
    });

    expect(notifier.notifyLocationSaved).toHaveBeenCalledOnce();
    expect(notifier.notifyLocationSaved).toHaveBeenCalledWith({
      location: expect.objectContaining({
        idUbicacion: '6',
        idUsuarioDispositivo: 1,
        latitud: 37.421998,
        longitud: -122.084,
        fueSincronizadaOffline: false,
      }),
      assignment: {
        idUsuarioDispositivo: 1,
        idUsuario: 1,
        alias: 'Derek gps simulado',
        codigoDispositivo: 'PUL-X7K4M92Q',
      },
    });
  });

  it('NO emite cuando createForAssignment recibe una transacción externa', async () => {
    const tx = {
      ubicacion: { create: vi.fn().mockResolvedValue(savedRow) },
      dispositivo: { update: vi.fn().mockResolvedValue({}) },
    };

    await service.createForAssignment(
      1,
      5,
      {
        latitud: 37.421998,
        longitud: -122.084,
        fechaHoraDispositivo: '2026-09-10T06:00:00.000Z',
      },
      tx as never,
    );

    expect(notifier.notifyLocationSaved).not.toHaveBeenCalled();
    expect(tx.ubicacion.create).toHaveBeenCalledOnce();
  });
});

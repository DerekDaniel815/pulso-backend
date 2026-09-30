import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
      {
        getAuthorizedPrivateViewerUserIds: vi.fn().mockResolvedValue([1]),
        getPublicAudience: vi.fn().mockResolvedValue({ isPublic: false }),
        hasActiveEmergency: vi.fn().mockResolvedValue(false),
      } as never,
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
    expect(notifier.notifyLocationSaved).toHaveBeenCalledWith(
      {
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
        emergenciaActiva: false,
      },
      [1],
      undefined,
    );
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

describe('LocationsService mapa en vivo', () => {
  const locationRow = {
    ...savedRow,
    idUsuarioDispositivo: 10,
  };

  const deviceRow = {
    idUsuarioDispositivo: 10,
    idUsuario: 1,
    alias: 'Pulsera',
    visibilidadPreferida: 'SOLO_YO',
    ubicacionActiva: true,
    dispositivo: { codigoDispositivo: 'PUL-TEST1234' },
  };

  let prisma: {
    usuarioDispositivo: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    ubicacion: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let findVisibleAssignments: ReturnType<typeof vi.fn>;
  let hasActiveEmergency: ReturnType<typeof vi.fn>;
  let getPublicAudience: ReturnType<typeof vi.fn>;
  let canViewAssignment: ReturnType<typeof vi.fn>;
  let service: LocationsService;

  beforeEach(() => {
    prisma = {
      usuarioDispositivo: {
        findUnique: vi.fn().mockResolvedValue(deviceRow),
        findMany: vi.fn().mockResolvedValue([]),
      },
      ubicacion: {
        findFirst: vi.fn().mockResolvedValue(locationRow),
        findMany: vi.fn().mockResolvedValue([locationRow]),
      },
    };
    findVisibleAssignments = vi.fn().mockResolvedValue([
      {
        idUsuarioDispositivo: 10,
        idUsuario: 1,
        visibilidadPreferida: 'SOLO_YO',
        estado: true,
      },
    ]);
    hasActiveEmergency = vi.fn().mockResolvedValue(false);
    getPublicAudience = vi.fn();
    canViewAssignment = vi.fn().mockResolvedValue(true);
    service = new LocationsService(
      prisma as unknown as PrismaService,
      {
        findVisibleAssignments,
        hasActiveEmergency,
        getPublicAudience,
        canViewAssignment,
      } as never,
      { notifyLocationSaved: vi.fn() } as unknown as LocationRealtimeNotifier,
    );
  });

  it('A/D. visible incluye tracking ON y excluye tracking OFF sin emergencia', async () => {
    const visible = await service.findVisibleForUser(2);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.assignment.idUsuarioDispositivo).toBe(10);
    expect(visible[0]?.location.idUbicacion).toBe('6');

    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      ...deviceRow,
      ubicacionActiva: false,
    });

    await expect(service.findVisibleForUser(2)).resolves.toEqual([]);
  });

  it('C. visible conserva el marker si hay emergencia ACTIVA con tracking OFF', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      ...deviceRow,
      ubicacionActiva: false,
    });
    hasActiveEmergency.mockResolvedValue(true);

    const visible = await service.findVisibleForUser(2);

    expect(visible).toHaveLength(1);
    expect(visible[0]?.emergenciaActiva).toBe(true);
    expect(visible[0]?.location.idUbicacion).toBe('6');
  });

  it('B/E. public solo devuelve tracking ON', async () => {
    prisma.usuarioDispositivo.findMany.mockResolvedValue([
      {
        idUsuarioDispositivo: 10,
        idUsuario: 1,
        visibilidadPreferida: 'PUBLICO',
        ubicacionActiva: true,
        estado: true,
      },
      {
        idUsuarioDispositivo: 11,
        idUsuario: 1,
        visibilidadPreferida: 'PUBLICO',
        ubicacionActiva: false,
        estado: true,
      },
    ]);
    getPublicAudience.mockImplementation(async (row: { idUsuarioDispositivo: number; ubicacionActiva: boolean }) => {
      if (!row.ubicacionActiva) {
        return { isPublic: false, origen: null, clavePublica: null, codigoPublico: null };
      }
      return {
        isPublic: true,
        origen: 'PUBLICO',
        clavePublica: `VIS-${row.idUsuarioDispositivo}`,
        codigoPublico: null,
      };
    });

    const markers = await service.findPublicMarkers();

    expect(prisma.usuarioDispositivo.findMany).toHaveBeenCalledWith({
      where: {
        estado: true,
        visibilidadPreferida: 'PUBLICO',
        ubicacionActiva: true,
      },
    });
    expect(markers).toEqual([
      expect.objectContaining({ clavePublica: 'VIS-10', origen: 'PUBLICO' }),
    ]);
  });

  it('F. latest e historial conservan la ubicación con tracking OFF', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      ...deviceRow,
      ubicacionActiva: false,
      estado: true,
    });

    const latest = await service.findLatestByAssignment(2, 10);
    const history = await service.findHistory(2, 10, {});

    expect(latest.idUbicacion).toBe('6');
    expect(history).toHaveLength(1);
    expect(history[0]?.idUbicacion).toBe('6');
    expect(prisma.ubicacion.findFirst).toHaveBeenCalled();
    expect(prisma.ubicacion.findMany).toHaveBeenCalled();
  });
});

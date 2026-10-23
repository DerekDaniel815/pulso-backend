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
      prisma.ubicacion.create.mockResolvedValue({
        ...savedRow,
        fechaHoraDispositivo: new Date(),
        fechaHoraServidor: new Date(),
      });
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

  it('rechaza deviceTimestamp más de dos minutos en el futuro', async () => {
    const future = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    await expect(
      service.createForAssignment(1, 5, {
        latitud: 37.42,
        longitud: -122.08,
        fechaHoraDispositivo: future,
      }),
    ).rejects.toThrow(/futuro/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
    locationRow.fechaHoraServidor = new Date();
    locationRow.fechaHoraDispositivo = new Date();
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
    expect(latest.isLive).toBe(true);
    expect(latest.liveExpiresAt).toEqual(expect.any(String));
    expect(prisma.ubicacion.findFirst).toHaveBeenCalled();
    expect(prisma.ubicacion.findMany).toHaveBeenCalled();
  });

  it('SOLO_YO con ubicación vencida no entra al mapa y latest la conserva', async () => {
    const stale = {
      ...locationRow,
      fechaHoraServidor: new Date(Date.now() - 120_000),
      fechaHoraDispositivo: new Date(Date.now() - 120_000),
    };
    prisma.ubicacion.findFirst.mockImplementation(async (args: { where?: { fechaHoraServidor?: { gte?: Date } } }) => {
      if (args?.where?.fechaHoraServidor?.gte) return null;
      return stale;
    });

    await expect(service.findVisibleForUser(2)).resolves.toEqual([]);
    const latest = await service.findLatestByAssignment(2, 10);
    expect(latest.isLive).toBe(false);
    expect(latest.idUbicacion).toBe('6');
  });

  it('contacto autorizado con ubicación reciente entra y sin reciente no', async () => {
    findVisibleAssignments.mockResolvedValue([
      { idUsuarioDispositivo: 10, idUsuario: 9, visibilidadPreferida: 'SOLO_YO', estado: true },
    ]);
    const visible = await service.findVisibleForUser(2);
    expect(visible).toHaveLength(1);

    prisma.ubicacion.findFirst.mockImplementation(
      async (args: { where?: { fechaHoraServidor?: { gte?: Date } } }) => {
        if (args?.where?.fechaHoraServidor?.gte) return null;
        return {
          ...locationRow,
          fechaHoraServidor: new Date(Date.now() - 120_000),
        };
      },
    );
    await expect(service.findVisibleForUser(2)).resolves.toEqual([]);
  });

  it('contacto no autorizado o miembro excluido no recibe marker aunque exista coordenada', async () => {
    findVisibleAssignments.mockResolvedValue([]);
    await expect(service.findVisibleForUser(2)).resolves.toEqual([]);
  });

  it('grupo autorizado con ubicación reciente entra al mapa', async () => {
    findVisibleAssignments.mockResolvedValue([
      { idUsuarioDispositivo: 10, idUsuario: 9, visibilidadPreferida: 'GRUPO', estado: true },
    ]);
    const visible = await service.findVisibleForUser(4);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.assignment.idUsuarioDispositivo).toBe(10);
  });

  it('público reciente se publica y público vencido no', async () => {
    prisma.usuarioDispositivo.findMany.mockResolvedValue([
      {
        idUsuarioDispositivo: 10,
        visibilidadPreferida: 'PUBLICO',
        ubicacionActiva: true,
        estado: true,
      },
    ]);
    getPublicAudience.mockResolvedValue({
      isPublic: true,
      origen: 'PUBLICO',
      clavePublica: 'VIS-10',
      codigoPublico: null,
    });

    const live = await service.findPublicMarkers();
    expect(live).toHaveLength(1);
    expect(live[0]?.ubicacion.isLive).toBe(true);

    prisma.ubicacion.findFirst.mockImplementation(
      async (args: { where?: { fechaHoraServidor?: { gte?: Date } } }) => {
        if (args?.where?.fechaHoraServidor?.gte) return null;
        return {
          ...locationRow,
          fechaHoraServidor: new Date(Date.now() - 120_000),
        };
      },
    );
    await expect(service.findPublicMarkers()).resolves.toEqual([]);
  });

  it('emergencia activa conserva la última coordenada aunque supere el TTL', async () => {
    hasActiveEmergency.mockResolvedValue(true);
    prisma.ubicacion.findFirst.mockResolvedValue({
      ...locationRow,
      fechaHoraServidor: new Date(Date.now() - 120_000),
    });

    const visible = await service.findVisibleForUser(2);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.emergenciaActiva).toBe(true);
    expect(visible[0]?.location.isLive).toBe(false);
  });

  it('una reactivación no devuelve la coordenada anterior al corte', async () => {
    const resumedAt = new Date();
    const previous = new Date(resumedAt.getTime() - 10_000);
    locationRow.fechaHoraServidor = previous;
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      ...deviceRow,
      ubicacionActiva: true,
      ubicacionVisibleDesde: resumedAt,
    });
    prisma.ubicacion.findFirst.mockImplementation(
      async (args: { where?: { fechaHoraServidor?: { gte?: Date } } }) => {
        const since = args?.where?.fechaHoraServidor?.gte;
        if (since && previous < since) return null;
        return locationRow;
      },
    );

    await expect(service.findVisibleForUser(2)).resolves.toEqual([]);
    expect(prisma.ubicacion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fechaHoraServidor: { gte: resumedAt },
        }),
      }),
    );
  });

  it('una emergencia ACTIVA ignora el corte de reactivación y el TTL corto', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      ...deviceRow,
      ubicacionActiva: false,
      ubicacionVisibleDesde: new Date(),
    });
    hasActiveEmergency.mockResolvedValue(true);
    prisma.ubicacion.findFirst.mockImplementation(
      async (args: { where?: { fechaHoraServidor?: { gte?: Date } } }) => {
        if (args?.where?.fechaHoraServidor?.gte) return null;
        return {
          ...locationRow,
          fechaHoraServidor: new Date(Date.now() - 120_000),
        };
      },
    );

    const visible = await service.findVisibleForUser(2);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.emergenciaActiva).toBe(true);
    expect(visible[0]?.location.isLive).toBe(false);
  });

  it('al cerrar SOS no republica una ubicación normal vencida', async () => {
    const notifyPrivateLocationRemoved = vi.fn();
    const notifyLocationPublicRemoved = vi.fn();
    const notifier = {
      notifyLocationSaved: vi.fn(),
      notifyPrivateLocationRemoved,
      notifyLocationPublicRemoved,
    };
    const closing = new LocationsService(
      prisma as unknown as PrismaService,
      {
        findVisibleAssignments,
        hasActiveEmergency,
        getPublicAudience,
        canViewAssignment,
        getAuthorizedPrivateViewerUserIds: vi.fn().mockResolvedValue([1, 2]),
      } as never,
      notifier as unknown as LocationRealtimeNotifier,
    );
    prisma.ubicacion.findFirst.mockImplementation(
      async (args: { where?: { fechaHoraServidor?: { gte?: Date } } }) => {
        if (args?.where?.fechaHoraServidor?.gte) return null;
        return {
          ...locationRow,
          fechaHoraServidor: new Date(Date.now() - 120_000),
        };
      },
    );
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      ...deviceRow,
      visibilidadPreferida: 'PUBLICO',
    });

    await closing.publishAfterEmergencyEnded(10);

    expect(notifier.notifyLocationSaved).not.toHaveBeenCalled();
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(1, 10, 'EMERGENCY_ENDED');
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(2, 10, 'EMERGENCY_ENDED');
    expect(notifyLocationPublicRemoved).toHaveBeenCalledWith('VIS-10');
  });
});

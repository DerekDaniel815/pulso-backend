import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoEmergencia, EstadoSimulationSession, VisibilidadPreferida } from '../common/enums.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SimulationSessionService } from './simulation-session.service.js';

function buildSession(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-09-10T12:00:00.000Z');
  return {
    idSimulationSession: 99,
    idUsuario: 1,
    idUsuarioDispositivo: 10,
    estado: EstadoSimulationSession.ACTIVA,
    ultimaActividad: now,
    expiraEn: new Date(now.getTime() + 45_000),
    fechaInicio: now,
    fechaFin: null,
    ubicacionActivaPrevia: false,
    habilitoUbicacionActiva: false,
    ...overrides,
  };
}

describe('SimulationSessionService', () => {
  let service: SimulationSessionService;
  let prisma: {
    usuarioDispositivo: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    simulationSession: {
      findFirst: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    emergencia: {
      updateMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    dispositivo: { update: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let hasActiveEmergency: ReturnType<typeof vi.fn>;
  let getAuthorizedPrivateViewerUserIds: ReturnType<typeof vi.fn>;
  let getPublicAudience: ReturnType<typeof vi.fn>;
  let notifyPrivateLocationRemoved: ReturnType<typeof vi.fn>;
  let notifyLocationPublicRemoved: ReturnType<typeof vi.fn>;
  let notifyEmergencyPublicEnded: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      usuarioDispositivo: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      simulationSession: {
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
      emergencia: {
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      dispositivo: { update: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
    };
    hasActiveEmergency = vi.fn().mockResolvedValue(false);
    getAuthorizedPrivateViewerUserIds = vi.fn().mockResolvedValue([]);
    getPublicAudience = vi.fn().mockResolvedValue({
      isPublic: false,
      origen: null,
      codigoPublico: null,
      clavePublica: null,
    });
    notifyPrivateLocationRemoved = vi.fn();
    notifyLocationPublicRemoved = vi.fn();
    notifyEmergencyPublicEnded = vi.fn();

    const configService = {
      get: vi.fn((key: string) => {
        if (key === 'SIMULATION_LEASE_SECONDS') return '45';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new SimulationSessionService(
      prisma as unknown as PrismaService,
      configService,
      {
        hasActiveEmergency,
        getAuthorizedPrivateViewerUserIds,
        getPublicAudience,
      } as unknown as LocationAccessService,
      {
        notifyPrivateLocationRemoved,
        notifyLocationPublicRemoved,
        notifyEmergencyPublicEnded,
      } as unknown as LocationRealtimeNotifier,
    );
  });

  it('A. crea sesión ACTIVA con expiraEn = now + lease', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: false,
    });
    prisma.simulationSession.findFirst.mockResolvedValue(null);

    const createdAt = new Date('2026-09-10T12:00:00.000Z');
    vi.setSystemTime(createdAt);

    prisma.simulationSession.create.mockImplementation(({ data }) =>
      Promise.resolve(
        buildSession({
          ultimaActividad: data.ultimaActividad,
          expiraEn: data.expiraEn,
          ubicacionActivaPrevia: data.ubicacionActivaPrevia,
          habilitoUbicacionActiva: data.habilitoUbicacionActiva,
        }),
      ),
    );

    const result = await service.ensureSession(1, 10);

    expect(result.estado).toBe(EstadoSimulationSession.ACTIVA);
    expect(result.expiraEn).toBe('2026-09-10T12:00:45.000Z');
    expect(prisma.simulationSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ubicacionActivaPrevia: false,
          habilitoUbicacionActiva: false,
        }),
      }),
    );

    vi.useRealTimers();
  });

  it('B. heartbeat renueva expiraEn al reutilizar sesión existente', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: false,
    });

    const existing = buildSession();
    prisma.simulationSession.findFirst.mockResolvedValue(existing);

    const renewedAt = new Date('2026-09-10T12:01:00.000Z');
    vi.setSystemTime(renewedAt);

    prisma.simulationSession.update.mockResolvedValue(
      buildSession({
        ultimaActividad: renewedAt,
        expiraEn: new Date(renewedAt.getTime() + 45_000),
      }),
    );

    const result = await service.renewSession(1, 10);

    expect(result.expiraEn).toBe('2026-09-10T12:01:45.000Z');
    expect(prisma.simulationSession.update).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('F. expiración DEV puro restaura ubicacionActiva=false cuando habilito=true', async () => {
    const session = buildSession({
      habilitoUbicacionActiva: true,
      ubicacionActivaPrevia: false,
    });

    prisma.simulationSession.findMany.mockResolvedValue([session]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...session,
      estado: EstadoSimulationSession.EXPIRADA,
    });
    prisma.emergencia.updateMany.mockResolvedValue({ count: 0 });

    await service.expireSessions();

    expect(prisma.usuarioDispositivo.update).toHaveBeenCalledWith({
      where: { idUsuarioDispositivo: 10 },
      data: { ubicacionActiva: false },
    });
  });

  it('G. expiración no cambia ubicacionActiva si previa=true', async () => {
    const session = buildSession({
      habilitoUbicacionActiva: false,
      ubicacionActivaPrevia: true,
    });

    prisma.simulationSession.findMany.mockResolvedValue([session]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...session,
      estado: EstadoSimulationSession.EXPIRADA,
    });
    prisma.emergencia.updateMany.mockResolvedValue({ count: 0 });

    await service.expireSessions();

    expect(prisma.usuarioDispositivo.update).not.toHaveBeenCalled();
  });

  it('I. expiración no finaliza emergencias hardware (idSimulationSession=null)', async () => {
    const session = buildSession({ idSimulationSession: 77 });

    prisma.simulationSession.findMany.mockResolvedValue([session]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...session,
      estado: EstadoSimulationSession.EXPIRADA,
    });
    prisma.emergencia.updateMany.mockResolvedValue({ count: 0 });

    await service.expireSessions();

    const where = prisma.emergencia.updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      idSimulationSession: 77,
      estado: EstadoEmergencia.ACTIVA,
    });
    expect(where).not.toHaveProperty('idUsuarioDispositivo');
    expect(where).not.toHaveProperty('activadaDesde');
  });

  it('H. expiración finaliza solo emergencias con idSimulationSession de la sesión', async () => {
    const session = buildSession({ idSimulationSession: 77 });

    prisma.simulationSession.findMany.mockResolvedValue([session]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...session,
      estado: EstadoSimulationSession.EXPIRADA,
    });
    prisma.emergencia.updateMany.mockResolvedValue({ count: 1 });

    await service.expireSessions();

    expect(prisma.emergencia.updateMany).toHaveBeenCalledWith({
      where: {
        idSimulationSession: 77,
        estado: EstadoEmergencia.ACTIVA,
      },
      data: {
        estado: EstadoEmergencia.FINALIZADA,
        fechaFin: expect.any(Date),
      },
    });
  });

  it('K. expiración idempotente skip cuando claim affected=0', async () => {
    const session = buildSession();
    prisma.simulationSession.findMany.mockResolvedValue([session]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 0 });

    const processed = await service.expireSessions();

    expect(processed).toBe(0);
    expect(prisma.emergencia.updateMany).not.toHaveBeenCalled();
    expect(prisma.usuarioDispositivo.update).not.toHaveBeenCalled();
  });

  it('J. session/end marca FINALIZADA y ejecuta cleanup', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: true,
    });

    const session = buildSession({ habilitoUbicacionActiva: true, ubicacionActivaPrevia: false });
    prisma.simulationSession.findFirst.mockResolvedValue(session);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...session,
      estado: EstadoSimulationSession.FINALIZADA,
      fechaFin: new Date(),
    });
    prisma.emergencia.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.endSession(1, 10);

    expect(result?.estado).toBe(EstadoSimulationSession.FINALIZADA);
    expect(prisma.usuarioDispositivo.update).toHaveBeenCalledWith({
      where: { idUsuarioDispositivo: 10 },
      data: { ubicacionActiva: false },
    });
  });

  it('L. usuario A no puede renovar sesión de usuario B', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: false,
    });
    prisma.simulationSession.findFirst.mockResolvedValue(
      buildSession({ idUsuario: 2 }),
    );

    await expect(service.ensureSession(1, 10)).rejects.toThrow(ForbiddenException);
  });

  it('L. usuario A no puede finalizar sesión ajena por ownership de asignación', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      idUsuario: 2,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: false,
    });

    await expect(service.endSession(1, 10)).rejects.toThrow(ForbiddenException);
  });

  it('setTracking marca habilitoUbicacionActiva solo si previa=false', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: false,
    });

    const session = buildSession({ ubicacionActivaPrevia: false, habilitoUbicacionActiva: false });
    prisma.simulationSession.findFirst.mockResolvedValue(null);
    prisma.simulationSession.create.mockResolvedValue(session);
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue(session);
    prisma.simulationSession.update.mockResolvedValue({
      ...session,
      habilitoUbicacionActiva: true,
    });

    await service.setTracking(1, 10, true);

    expect(prisma.usuarioDispositivo.update).toHaveBeenCalledWith({
      where: { idUsuarioDispositivo: 10 },
      data: { ubicacionActiva: true },
    });
    expect(prisma.simulationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { habilitoUbicacionActiva: true },
      }),
    );
  });

  it('A. simulador activó tracking público: al expirar retira markers privado y público', async () => {
    const assignment = {
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: true,
      visibilidadPreferida: VisibilidadPreferida.PUBLICO,
    };
    prisma.usuarioDispositivo.findUnique.mockImplementation(async () => assignment);
    prisma.usuarioDispositivo.update.mockImplementation(async ({ data }: { data: { ubicacionActiva: boolean } }) => {
      Object.assign(assignment, data);
      return assignment;
    });
    prisma.simulationSession.findMany.mockResolvedValue([
      buildSession({ habilitoUbicacionActiva: true, ubicacionActivaPrevia: false }),
    ]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockImplementation(async () => ({
      ...buildSession({ habilitoUbicacionActiva: true, ubicacionActivaPrevia: false }),
      estado: EstadoSimulationSession.EXPIRADA,
    }));
    getAuthorizedPrivateViewerUserIds.mockResolvedValue([1, 2]);
    getPublicAudience.mockImplementation(async (row: { ubicacionActiva: boolean; idUsuarioDispositivo: number; visibilidadPreferida: string }) => {
      if (row.ubicacionActiva && row.visibilidadPreferida === VisibilidadPreferida.PUBLICO) {
        return {
          isPublic: true,
          origen: 'PUBLICO' as const,
          codigoPublico: null,
          clavePublica: `VIS-${row.idUsuarioDispositivo}`,
        };
      }
      return { isPublic: false, origen: null, codigoPublico: null, clavePublica: null };
    });

    await service.expireSessions();

    expect(assignment.ubicacionActiva).toBe(false);
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(1, 10);
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(2, 10);
    expect(notifyLocationPublicRemoved).toHaveBeenCalledOnce();
    expect(notifyLocationPublicRemoved).toHaveBeenCalledWith('VIS-10');
    expect(notifyEmergencyPublicEnded).not.toHaveBeenCalled();
    expect(prisma.dispositivo.update).not.toHaveBeenCalled();
  });

  it('B. tracking preexistente sigue ON y no emite removed al expirar', async () => {
    const assignment = {
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: true,
      visibilidadPreferida: VisibilidadPreferida.PUBLICO,
    };
    prisma.usuarioDispositivo.findUnique.mockImplementation(async () => assignment);
    prisma.simulationSession.findMany.mockResolvedValue([
      buildSession({ habilitoUbicacionActiva: false, ubicacionActivaPrevia: true }),
    ]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...buildSession({ habilitoUbicacionActiva: false, ubicacionActivaPrevia: true }),
      estado: EstadoSimulationSession.EXPIRADA,
    });
    getAuthorizedPrivateViewerUserIds.mockResolvedValue([1, 2]);
    getPublicAudience.mockResolvedValue({
      isPublic: true,
      origen: 'PUBLICO',
      codigoPublico: null,
      clavePublica: 'VIS-10',
    });

    await service.expireSessions();

    expect(assignment.ubicacionActiva).toBe(true);
    expect(prisma.usuarioDispositivo.update).not.toHaveBeenCalled();
    expect(notifyPrivateLocationRemoved).not.toHaveBeenCalled();
    expect(notifyLocationPublicRemoved).not.toHaveBeenCalled();
    expect(notifyEmergencyPublicEnded).not.toHaveBeenCalled();
  });

  it('C. emergencia simulada se finaliza y emite emergency.public.ended', async () => {
    const emergencies = [
      {
        idSimulationSession: 99,
        idUsuarioDispositivo: 10,
        estado: EstadoEmergencia.ACTIVA,
        codigoPublico: 'EME-SIM',
      },
    ];
    const assignment = {
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: true,
      visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
    };
    prisma.usuarioDispositivo.findUnique.mockImplementation(async () => assignment);
    prisma.usuarioDispositivo.update.mockImplementation(async ({ data }: { data: { ubicacionActiva: boolean } }) => {
      Object.assign(assignment, data);
      return assignment;
    });
    prisma.emergencia.findMany.mockImplementation(async ({ where }: { where: { idSimulationSession: number; estado: string } }) =>
      emergencies.filter(
        (row) => row.idSimulationSession === where.idSimulationSession && row.estado === where.estado,
      ),
    );
    prisma.emergencia.updateMany.mockImplementation(async ({ where, data }: { where: { idSimulationSession: number; estado: string }; data: { estado: string } }) => {
      let count = 0;
      for (const row of emergencies) {
        if (row.idSimulationSession === where.idSimulationSession && row.estado === where.estado) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    });
    hasActiveEmergency.mockImplementation(async () =>
      emergencies.some((row) => row.idUsuarioDispositivo === 10 && row.estado === EstadoEmergencia.ACTIVA),
    );
    getAuthorizedPrivateViewerUserIds.mockResolvedValue([1, 2]);
    getPublicAudience.mockResolvedValue({
      isPublic: true,
      origen: 'EMERGENCIA',
      codigoPublico: 'EME-SIM',
      clavePublica: 'EME-SIM',
    });
    prisma.simulationSession.findMany.mockResolvedValue([
      buildSession({ habilitoUbicacionActiva: true, ubicacionActivaPrevia: false }),
    ]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...buildSession({ habilitoUbicacionActiva: true, ubicacionActivaPrevia: false }),
      estado: EstadoSimulationSession.EXPIRADA,
    });

    await service.expireSessions();

    expect(emergencies[0]?.estado).toBe(EstadoEmergencia.FINALIZADA);
    expect(notifyEmergencyPublicEnded).toHaveBeenCalledOnce();
    expect(notifyEmergencyPublicEnded).toHaveBeenCalledWith('EME-SIM');
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(1, 10);
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(2, 10);
    expect(notifyLocationPublicRemoved).not.toHaveBeenCalled();
  });

  it('D. emergencia real con idSimulationSession null no se finaliza ni emite ended', async () => {
    const emergencies = [
      {
        idSimulationSession: null as number | null,
        idUsuarioDispositivo: 10,
        estado: EstadoEmergencia.ACTIVA,
        codigoPublico: 'EME-REAL',
      },
    ];
    const assignment = {
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: true,
      visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
    };
    prisma.usuarioDispositivo.findUnique.mockImplementation(async () => assignment);
    prisma.emergencia.findMany.mockImplementation(async ({ where }: { where: { idSimulationSession: number; estado: string } }) =>
      emergencies.filter(
        (row) => row.idSimulationSession === where.idSimulationSession && row.estado === where.estado,
      ),
    );
    prisma.emergencia.updateMany.mockImplementation(async ({ where, data }: { where: { idSimulationSession: number; estado: string }; data: { estado: string } }) => {
      let count = 0;
      for (const row of emergencies) {
        if (row.idSimulationSession === where.idSimulationSession && row.estado === where.estado) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    });
    hasActiveEmergency.mockResolvedValue(true);
    getAuthorizedPrivateViewerUserIds.mockResolvedValue([1]);
    prisma.simulationSession.findMany.mockResolvedValue([
      buildSession({ habilitoUbicacionActiva: false, ubicacionActivaPrevia: true }),
    ]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...buildSession({ habilitoUbicacionActiva: false, ubicacionActivaPrevia: true }),
      estado: EstadoSimulationSession.EXPIRADA,
    });

    await service.expireSessions();

    expect(emergencies[0]?.estado).toBe(EstadoEmergencia.ACTIVA);
    expect(notifyEmergencyPublicEnded).not.toHaveBeenCalled();
    expect(notifyPrivateLocationRemoved).not.toHaveBeenCalled();
    expect(prisma.usuarioDispositivo.update).not.toHaveBeenCalled();
    expect(prisma.dispositivo.update).not.toHaveBeenCalled();
  });

  it('E. expirar el simulador no escribe en el dispositivo real', async () => {
    prisma.simulationSession.findMany.mockResolvedValue([buildSession()]);
    prisma.simulationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue({
      ...buildSession(),
      estado: EstadoSimulationSession.EXPIRADA,
    });

    await service.expireSessions();

    expect(prisma.dispositivo.update).not.toHaveBeenCalled();
  });

  it('setTracking no marca habilito si ubicacionActivaPrevia=true', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      idUsuario: 1,
      idUsuarioDispositivo: 10,
      estado: true,
      ubicacionActiva: true,
    });

    const session = buildSession({ ubicacionActivaPrevia: true, habilitoUbicacionActiva: false });
    prisma.simulationSession.findFirst.mockResolvedValue(session);
    prisma.simulationSession.update.mockResolvedValue(session);
    prisma.simulationSession.findUniqueOrThrow.mockResolvedValue(session);

    await service.setTracking(1, 10, true);

    expect(prisma.simulationSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { habilitoUbicacionActiva: true },
      }),
    );
  });

  it('responde not found si la asignación no existe', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(null);

    await expect(service.ensureSession(1, 10)).rejects.toThrow(NotFoundException);
  });
});

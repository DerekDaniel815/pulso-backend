import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivadaDesde, EstadoEmergencia } from '../common/enums.js';
import { EmergenciesService } from './emergencies.service.js';

describe('EmergenciesService.createForDevice', () => {
  let service: EmergenciesService;
  let emergenciaCreate: ReturnType<typeof vi.fn>;
  let prisma: {
    usuarioDispositivo: { findUnique: ReturnType<typeof vi.fn> };
    emergencia: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    dispositivo: { update: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    emergenciaCreate = vi.fn().mockResolvedValue({
      idEmergencia: 1n,
      idUsuarioDispositivo: 10,
      codigoPublico: 'EME-TEST0001',
      estado: EstadoEmergencia.ACTIVA,
      fechaInicio: new Date('2026-09-10T12:00:00.000Z'),
    });

    prisma = {
      usuarioDispositivo: {
        findUnique: vi.fn().mockResolvedValue({
          idUsuario: 1,
          idUsuarioDispositivo: 10,
          estado: true,
        }),
      },
      emergencia: {
        create: emergenciaCreate,
        findFirst: vi.fn().mockResolvedValue(null),
      },
      dispositivo: {
        update: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
    };

    service = new EmergenciesService(
      prisma as never,
      { createForUsers: vi.fn() } as never,
      { canViewAssignmentLocation: vi.fn() } as never,
      { createForAssignment: vi.fn(), publishLatestForAssignment: vi.fn() } as never,
      { notifyEmergencyPublicUpdated: vi.fn(), notifyEmergencyPublicEnded: vi.fn() } as never,
      { sweepOverdue: vi.fn(), finalizeIfActive: vi.fn() } as never,
    );

    vi.spyOn(service as never, 'findEmergencyRecipients').mockResolvedValue([]);
    vi.spyOn(service as never, 'findLatestLocation').mockResolvedValue(undefined);
  });

  it('E. SOS hardware persiste idSimulationSession=null', async () => {
    await service.createForDevice(1, 10, 5, 'SOS');

    expect(emergenciaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idSimulationSession: null,
          activadaDesde: ActivadaDesde.DISPOSITIVO,
        }),
      }),
    );
  });

  it('D. SOS simulada persiste idSimulationSession', async () => {
    await service.createForDevice(1, 10, 5, 'SOS', undefined, 77);

    expect(emergenciaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idSimulationSession: 77,
        }),
      }),
    );
  });

  it('una creación concurrente que choca con el índice único responde 409', async () => {
    emergenciaCreate.mockRejectedValue({ code: 'P2002' });

    await expect(service.createForDevice(1, 10, 5, 'SOS')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('EmergenciesService.finish', () => {
  const ownerEmergency = {
    idEmergencia: 4n,
    codigoPublico: 'EME-1',
    idUsuarioDispositivo: 10,
    tipo: 'SOS',
    estado: 'ACTIVA',
    activadaDesde: 'APP',
    descripcion: null,
    fechaInicio: new Date('2026-10-22T00:00:00.000Z'),
    fechaFin: null,
    motivoFinalizacion: null,
    finalizadaDesde: null,
    usuarioDispositivo: { idUsuario: 7 },
  };

  function build(emergency: typeof ownerEmergency | null) {
    const finalizeIfActive = vi.fn();
    const notifyEmergencyPublicEnded = vi.fn();
    const findUnique = vi.fn().mockResolvedValue(emergency);
    const service = new EmergenciesService(
      {
        emergencia: { findUnique, findFirst: vi.fn() },
        ubicacion: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      { createForUsers: vi.fn() } as never,
      {} as never,
      { publishLatestForAssignment: vi.fn() } as never,
      { notifyEmergencyPublicEnded, notifyEmergencyPublicUpdated: vi.fn() } as never,
      { sweepOverdue: vi.fn(), finalizeIfActive } as never,
    );
    return { service, finalizeIfActive, notifyEmergencyPublicEnded, findUnique };
  }

  it('finaliza una activa con MANUAL_APP y APP', async () => {
    const { service, finalizeIfActive, notifyEmergencyPublicEnded } = build(ownerEmergency);
    finalizeIfActive.mockResolvedValue({
      idEmergencia: '4',
      estado: 'FINALIZADA',
      motivoFinalizacion: 'MANUAL_APP',
      finalizadaDesde: 'APP',
    });

    const result = await service.finish(7, 4n);

    expect(finalizeIfActive).toHaveBeenCalledWith(4n, {
      motivoFinalizacion: 'MANUAL_APP',
      finalizadaDesde: 'APP',
    });
    expect(notifyEmergencyPublicEnded).not.toHaveBeenCalled();
    expect(result.estado).toBe('FINALIZADA');
  });

  it('si ya estaba finalizada responde el estado actual sin eventos', async () => {
    const finished = {
      ...ownerEmergency,
      estado: 'FINALIZADA',
      fechaFin: new Date('2026-10-22T01:00:00.000Z'),
      motivoFinalizacion: 'EXPIRADA',
      finalizadaDesde: 'SISTEMA',
    };
    const { service, finalizeIfActive, notifyEmergencyPublicEnded } = build(finished);

    const result = await service.finish(7, 4n);

    expect(finalizeIfActive).not.toHaveBeenCalled();
    expect(notifyEmergencyPublicEnded).not.toHaveBeenCalled();
    expect(result.motivoFinalizacion).toBe('EXPIRADA');
    expect(result.finalizadaDesde).toBe('SISTEMA');
  });

  it('mantiene 403 para un usuario ajeno y 404 si no existe', async () => {
    const foreign = build(ownerEmergency);
    await expect(foreign.service.finish(99, 4n)).rejects.toBeInstanceOf(ForbiddenException);

    const missing = build(null);
    await expect(missing.service.finish(7, 4n)).rejects.toBeInstanceOf(NotFoundException);
  });
});

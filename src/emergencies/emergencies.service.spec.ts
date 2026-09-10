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
      { createForAssignment: vi.fn() } as never,
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
});

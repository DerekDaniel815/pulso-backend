import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisibilidadPreferida } from '../common/enums.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserDevicesService } from './user-devices.service.js';

const assignment = {
  idUsuarioDispositivo: 10,
  idUsuario: 1,
  idDispositivo: 5,
  estado: true,
  alias: 'Pulsera',
  visibilidadPreferida: VisibilidadPreferida.PUBLICO,
  ubicacionActiva: true,
  fechaAsignacion: new Date('2026-09-10T12:00:00.000Z'),
  fechaDesvinculacion: null,
  dispositivo: { codigoDispositivo: 'PUL-TEST1234', estado: 'ASIGNADO' },
};

describe('UserDevicesService.update visibilidad pública', () => {
  let service: UserDevicesService;
  let prisma: {
    usuarioDispositivo: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let getPublicAudience: ReturnType<typeof vi.fn>;
  let notifyIfPublicAudienceLost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      usuarioDispositivo: {
        findUnique: vi.fn().mockResolvedValue(assignment),
        update: vi.fn(),
      },
    };
    getPublicAudience = vi.fn();
    notifyIfPublicAudienceLost = vi.fn();

    service = new UserDevicesService(
      prisma as unknown as PrismaService,
      {} as never,
      { getPublicAudience } as unknown as LocationAccessService,
      { notifyIfPublicAudienceLost } as unknown as LocationRealtimeNotifier,
    );
  });

  it('PUBLICO -> SOLO_YO emite pérdida de audiencia pública', async () => {
    getPublicAudience
      .mockResolvedValueOnce({ isPublic: true, clavePublica: 'VIS-10', origen: 'PUBLICO' })
      .mockResolvedValueOnce({ isPublic: false, clavePublica: null, origen: null });

    prisma.usuarioDispositivo.update.mockResolvedValue({
      ...assignment,
      visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
    });

    await service.update(1, 10, { visibilidadPreferida: VisibilidadPreferida.SOLO_YO });

    expect(notifyIfPublicAudienceLost).toHaveBeenCalledWith(
      { isPublic: true, clavePublica: 'VIS-10', origen: 'PUBLICO' },
      { isPublic: false, clavePublica: null, origen: null },
    );
  });

  it('PUBLICO -> GRUPO emite pérdida de audiencia pública', async () => {
    getPublicAudience
      .mockResolvedValueOnce({ isPublic: true, clavePublica: 'VIS-10', origen: 'PUBLICO' })
      .mockResolvedValueOnce({ isPublic: false, clavePublica: null, origen: null });

    prisma.usuarioDispositivo.update.mockResolvedValue({
      ...assignment,
      visibilidadPreferida: VisibilidadPreferida.GRUPO,
    });

    await service.update(1, 10, { visibilidadPreferida: VisibilidadPreferida.GRUPO });

    expect(notifyIfPublicAudienceLost).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true, clavePublica: 'VIS-10' }),
      expect.objectContaining({ isPublic: false }),
    );
  });

  it('PUBLICO -> SOLO_YO con SOS activo no pide retirar marker público', async () => {
    getPublicAudience
      .mockResolvedValueOnce({ isPublic: true, clavePublica: 'EME-ABC', origen: 'EMERGENCIA' })
      .mockResolvedValueOnce({ isPublic: true, clavePublica: 'EME-ABC', origen: 'EMERGENCIA' });

    prisma.usuarioDispositivo.update.mockResolvedValue({
      ...assignment,
      visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
    });

    await service.update(1, 10, { visibilidadPreferida: VisibilidadPreferida.SOLO_YO });

    expect(notifyIfPublicAudienceLost).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true }),
      expect.objectContaining({ isPublic: true }),
    );
  });
});

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
  let hasActiveEmergency: ReturnType<typeof vi.fn>;
  let getAuthorizedPrivateViewerUserIds: ReturnType<typeof vi.fn>;
  let notifyIfPublicAudienceLost: ReturnType<typeof vi.fn>;
  let notifyPrivateLocationRemoved: ReturnType<typeof vi.fn>;
  let notifyLocationPublicRemoved: ReturnType<typeof vi.fn>;
  let notifyLostViewers: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      usuarioDispositivo: {
        findUnique: vi.fn().mockResolvedValue(assignment),
        update: vi.fn(),
      },
    };
    getPublicAudience = vi.fn();
    hasActiveEmergency = vi.fn().mockResolvedValue(false);
    getAuthorizedPrivateViewerUserIds = vi.fn().mockResolvedValue([1, 2]);
    notifyIfPublicAudienceLost = vi.fn();
    notifyPrivateLocationRemoved = vi.fn();
    notifyLocationPublicRemoved = vi.fn();
    notifyLostViewers = vi.fn(async (_ownerIds: number[], change: () => Promise<unknown>) => change());

    service = new UserDevicesService(
      prisma as unknown as PrismaService,
      {} as never,
      {
        getPublicAudience,
        hasActiveEmergency,
        getAuthorizedPrivateViewerUserIds,
      } as unknown as LocationAccessService,
      {
        notifyIfPublicAudienceLost,
        notifyPrivateLocationRemoved,
        notifyLocationPublicRemoved,
      } as unknown as LocationRealtimeNotifier,
      { notifyLostViewers } as never,
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

  it('A. tracking OFF emite location.private.removed a los viewers autorizados', async () => {
    getPublicAudience.mockResolvedValue({ isPublic: false, clavePublica: null, origen: null });
    prisma.usuarioDispositivo.update.mockResolvedValue({
      ...assignment,
      visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
      ubicacionActiva: false,
    });

    await service.update(1, 10, { ubicacionActiva: false });

    expect(getAuthorizedPrivateViewerUserIds).toHaveBeenCalledWith(10);
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledTimes(2);
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(1, 10);
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(2, 10);
    expect(notifyLocationPublicRemoved).not.toHaveBeenCalled();
    expect(prisma.usuarioDispositivo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ubicacionActiva: false }),
      }),
    );
  });

  it('B. tracking OFF en PUBLICO emite location.public.removed', async () => {
    getPublicAudience.mockResolvedValue({
      isPublic: true,
      clavePublica: 'VIS-10',
      origen: 'PUBLICO',
    });
    prisma.usuarioDispositivo.update.mockResolvedValue({
      ...assignment,
      ubicacionActiva: false,
    });

    await service.update(1, 10, { ubicacionActiva: false });

    expect(notifyLocationPublicRemoved).toHaveBeenCalledOnce();
    expect(notifyLocationPublicRemoved).toHaveBeenCalledWith('VIS-10');
    expect(notifyPrivateLocationRemoved).toHaveBeenCalledWith(2, 10);
  });

  it('C. tracking OFF con emergencia ACTIVA no retira markers', async () => {
    hasActiveEmergency.mockResolvedValue(true);
    getPublicAudience.mockResolvedValue({
      isPublic: true,
      clavePublica: 'EME-ABC',
      origen: 'EMERGENCIA',
    });
    prisma.usuarioDispositivo.update.mockResolvedValue({
      ...assignment,
      ubicacionActiva: false,
    });

    await service.update(1, 10, { ubicacionActiva: false });

    expect(notifyPrivateLocationRemoved).not.toHaveBeenCalled();
    expect(notifyLocationPublicRemoved).not.toHaveBeenCalled();
  });

  it('tracking ON no republica la última ubicación ni emite removed', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      ...assignment,
      ubicacionActiva: false,
    });
    getPublicAudience.mockResolvedValue({ isPublic: false, clavePublica: null, origen: null });
    prisma.usuarioDispositivo.update.mockResolvedValue({
      ...assignment,
      ubicacionActiva: true,
    });

    await service.update(1, 10, { ubicacionActiva: true });

    expect(notifyPrivateLocationRemoved).not.toHaveBeenCalled();
    expect(notifyLocationPublicRemoved).not.toHaveBeenCalled();
    expect(getAuthorizedPrivateViewerUserIds).not.toHaveBeenCalled();
  });
});

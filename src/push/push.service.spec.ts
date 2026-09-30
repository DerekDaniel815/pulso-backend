import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushService, type PushNotificationSource } from './push.service.js';

const tokenA = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]';
const tokenB = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]';

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    idUsuarioPushToken: 1,
    idUsuario: 1,
    token: tokenA,
    plataforma: 'android',
    activo: true,
    fechaRegistro: new Date('2026-09-30T12:00:00.000Z'),
    fechaActualizacion: new Date('2026-09-30T12:00:00.000Z'),
    ...overrides,
  };
}

function notification(destinatarios: { idNotificacionUsuario: bigint; idUsuario: number }[]): PushNotificationSource {
  return {
    titulo: 'Nueva solicitud de contacto',
    mensaje: 'Alguien quiere agregarte como contacto.',
    tipo: 'SOLICITUD_CONTACTO',
    tipoReferencia: 'CONTACTO',
    idReferencia: 10n,
    destinatarios,
  };
}

describe('PushService', () => {
  let prisma: {
    usuarioPushToken: {
      upsert: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let send: ReturnType<typeof vi.fn>;
  let service: PushService;

  beforeEach(() => {
    prisma = {
      usuarioPushToken: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    send = vi.fn().mockResolvedValue([]);
    service = new PushService(prisma as never, { send } as never);
  });

  it('registra el token del usuario autenticado', async () => {
    prisma.usuarioPushToken.upsert.mockResolvedValue(storedToken());

    const result = await service.register(1, { token: tokenA, platform: 'android' });

    expect(prisma.usuarioPushToken.upsert).toHaveBeenCalledWith({
      where: { token: tokenA },
      create: { idUsuario: 1, token: tokenA, plataforma: 'android', activo: true },
      update: { idUsuario: 1, plataforma: 'android', activo: true },
    });
    expect(result.activo).toBe(true);
    expect(result.plataforma).toBe('android');
  });

  it('un token duplicado se reactiva para el mismo usuario sin crear otra fila', async () => {
    prisma.usuarioPushToken.upsert.mockResolvedValue(storedToken({ activo: true, plataforma: 'ios' }));

    await service.register(1, { token: tokenA, platform: 'ios' });

    expect(prisma.usuarioPushToken.upsert).toHaveBeenCalledOnce();
    expect(prisma.usuarioPushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: tokenA },
        update: { idUsuario: 1, plataforma: 'ios', activo: true },
      }),
    );
  });

  it('reasigna un token que pertenecía a otro usuario', async () => {
    prisma.usuarioPushToken.upsert.mockResolvedValue(storedToken({ idUsuario: 4 }));

    await service.register(4, { token: tokenA, platform: 'android' });

    expect(prisma.usuarioPushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ idUsuario: 4, activo: true }),
      }),
    );
  });

  it('desactiva el token del usuario y conserva la fila', async () => {
    prisma.usuarioPushToken.findUnique.mockResolvedValue(storedToken());
    prisma.usuarioPushToken.update.mockResolvedValue(storedToken({ activo: false }));

    const result = await service.deactivate(1, tokenA);

    expect(result.activo).toBe(false);
    expect(prisma.usuarioPushToken.update).toHaveBeenCalledWith({
      where: { idUsuarioPushToken: 1 },
      data: { activo: false },
    });
  });

  it('no desactiva el token de otro usuario', async () => {
    prisma.usuarioPushToken.findUnique.mockResolvedValue(storedToken({ idUsuario: 9 }));

    await expect(service.deactivate(1, tokenA)).rejects.toThrow(NotFoundException);
    expect(prisma.usuarioPushToken.update).not.toHaveBeenCalled();
  });

  it('envía push a todos los tokens activos de cada destinatario', async () => {
    prisma.usuarioPushToken.findMany.mockResolvedValue([
      storedToken({ idUsuarioPushToken: 1, idUsuario: 2, token: tokenA }),
      storedToken({ idUsuarioPushToken: 2, idUsuario: 2, token: tokenB }),
      storedToken({ idUsuarioPushToken: 3, idUsuario: 3, token: 'ExponentPushToken[cccccccccccccccccccc]' }),
    ]);
    send.mockResolvedValue([{ status: 'ok' }, { status: 'ok' }, { status: 'ok' }]);

    await service.deliver(
      notification([
        { idNotificacionUsuario: 20n, idUsuario: 2 },
        { idNotificacionUsuario: 30n, idUsuario: 3 },
      ]),
    );

    expect(prisma.usuarioPushToken.findMany).toHaveBeenCalledWith({
      where: { activo: true, idUsuario: { in: [2, 3] } },
    });
    expect(send).toHaveBeenCalledOnce();
    const messages = send.mock.calls[0]?.[0];
    expect(messages).toEqual([
      expect.objectContaining({
        to: tokenA,
        title: 'Nueva solicitud de contacto',
        body: 'Alguien quiere agregarte como contacto.',
        data: {
          idNotificacionUsuario: '20',
          tipo: 'SOLICITUD_CONTACTO',
          tipoReferencia: 'CONTACTO',
          idReferencia: '10',
        },
      }),
      expect.objectContaining({ to: tokenB, data: expect.objectContaining({ idNotificacionUsuario: '20' }) }),
      expect.objectContaining({
        to: 'ExponentPushToken[cccccccccccccccccccc]',
        data: expect.objectContaining({ idNotificacionUsuario: '30', tipo: 'SOLICITUD_CONTACTO' }),
      }),
    ]);
  });

  it('no envía push a tokens inactivos', async () => {
    prisma.usuarioPushToken.findMany.mockResolvedValue([]);

    await service.deliver(notification([{ idNotificacionUsuario: 20n, idUsuario: 2 }]));

    expect(prisma.usuarioPushToken.findMany).toHaveBeenCalledWith({
      where: { activo: true, idUsuario: { in: [2] } },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('un fallo de Expo no rechaza deliver', async () => {
    prisma.usuarioPushToken.findMany.mockResolvedValue([
      storedToken({ idUsuario: 2, token: tokenA }),
    ]);
    send.mockRejectedValue(new Error('red caída'));

    await expect(
      service.deliver(notification([{ idNotificacionUsuario: 20n, idUsuario: 2 }])),
    ).resolves.toBeUndefined();
    expect(prisma.usuarioPushToken.updateMany).not.toHaveBeenCalled();
  });

  it('DeviceNotRegistered desactiva solo ese token', async () => {
    prisma.usuarioPushToken.findMany.mockResolvedValue([
      storedToken({ idUsuario: 2, token: tokenA }),
      storedToken({ idUsuarioPushToken: 2, idUsuario: 2, token: tokenB }),
    ]);
    send.mockResolvedValue([
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: 'ticket-b' },
    ]);

    await service.deliver(notification([{ idNotificacionUsuario: 20n, idUsuario: 2 }]));

    expect(prisma.usuarioPushToken.updateMany).toHaveBeenCalledWith({
      where: { token: { in: [tokenA] } },
      data: { activo: false },
    });
  });
});

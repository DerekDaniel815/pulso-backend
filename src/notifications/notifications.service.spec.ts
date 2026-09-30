import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

const notification = {
  idNotificacion: 11n,
  tipo: 'SOLICITUD_CONTACTO',
  alcance: 'USUARIO',
  titulo: 'Nueva solicitud',
  mensaje: 'hola',
  tipoReferencia: 'CONTACTO',
  idReferencia: 10n,
  fechaCreacion: new Date('2026-09-11T12:00:00.000Z'),
};

function recipient(idUsuario: number, overrides: Record<string, unknown> = {}) {
  return {
    idNotificacionUsuario: BigInt(idUsuario),
    idNotificacion: 11n,
    idUsuario,
    leida: false,
    fechaLectura: null,
    notificacion: notification,
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: Record<string, any>;
  let emitNotificationCreated: ReturnType<typeof vi.fn>;
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      notificacion: { create: vi.fn() },
      notificacionUsuario: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
    };
    emitNotificationCreated = vi.fn();
    dispatch = vi.fn();
    service = new NotificationsService(
      prisma as never,
      { emitNotificationCreated } as never,
      { dispatch } as never,
    );
  });

  it('crea destinatarios únicos y emite notification.created a cada uno', async () => {
    prisma.notificacion.create.mockResolvedValue({
      ...notification,
      destinatarios: [recipient(2), recipient(3)],
    });

    await service.createForUsers({
      tipo: 'SOLICITUD_CONTACTO' as never,
      alcance: 'USUARIO' as never,
      titulo: 'Nueva solicitud',
      userIds: [2, 2, 3],
    });

    expect(prisma.notificacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destinatarios: { create: [{ idUsuario: 2 }, { idUsuario: 3 }] },
        }),
      }),
    );
    expect(emitNotificationCreated).toHaveBeenCalledTimes(2);
    expect(emitNotificationCreated).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ notification: expect.objectContaining({ titulo: 'Nueva solicitud' }) }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'SOLICITUD_CONTACTO',
        titulo: 'Nueva solicitud',
        destinatarios: expect.arrayContaining([
          expect.objectContaining({ idUsuario: 2 }),
          expect.objectContaining({ idUsuario: 3 }),
        ]),
      }),
    );
  });

  it('un fallo sincrónico de push no revierte la notificación ni el websocket', async () => {
    prisma.notificacion.create.mockResolvedValue({
      ...notification,
      destinatarios: [recipient(2)],
    });
    dispatch.mockImplementation(() => {
      throw new Error('push caído');
    });

    await expect(
      service.createForUsers({
        tipo: 'SOLICITUD_CONTACTO' as never,
        alcance: 'USUARIO' as never,
        titulo: 'Nueva solicitud',
        userIds: [2],
      }),
    ).resolves.toEqual(expect.objectContaining({ idNotificacion: 11n }));

    expect(emitNotificationCreated).toHaveBeenCalledOnce();
  });

  it('unreadCount solo cuenta las del usuario', async () => {
    prisma.notificacionUsuario.count.mockResolvedValue(4);

    await expect(service.unreadCount(7)).resolves.toBe(4);
    expect(prisma.notificacionUsuario.count).toHaveBeenCalledWith({
      where: { idUsuario: 7, leida: false },
    });
  });

  it('markRead aísla por usuario', async () => {
    prisma.notificacionUsuario.findUnique.mockResolvedValue(null);

    await expect(service.markRead(2, 11n)).rejects.toThrow(NotFoundException);
  });

  it('markRead marca leida', async () => {
    prisma.notificacionUsuario.findUnique.mockResolvedValue(recipient(2));
    prisma.notificacionUsuario.update.mockResolvedValue(
      recipient(2, { leida: true, fechaLectura: new Date() }),
    );

    const result = await service.markRead(2, 11n);
    expect(result.leida).toBe(true);
  });

  it('markAllRead solo actualiza las no leídas del actor', async () => {
    prisma.notificacionUsuario.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.markAllRead(2)).resolves.toBe(3);
    expect(prisma.notificacionUsuario.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 2, leida: false },
      data: expect.objectContaining({ leida: true }),
    });
  });

  it('findMine pagina y ordena reciente primero', async () => {
    prisma.notificacionUsuario.findMany.mockResolvedValue([recipient(2)]);

    await service.findMine(2, { limit: 10, offset: 5 });

    expect(prisma.notificacionUsuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idUsuario: 2 },
        take: 10,
        skip: 5,
        orderBy: { notificacion: { fechaCreacion: 'desc' } },
      }),
    );
  });
});

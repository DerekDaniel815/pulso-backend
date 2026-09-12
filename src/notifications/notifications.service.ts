import { Injectable, NotFoundException } from '@nestjs/common';
import type { AlcanceNotificacion, TipoNotificacion, TipoReferencia } from '../common/enums.js';
import type { Notificacion, NotificacionUsuario, Prisma } from '../generated/prisma/client.js';
import { LocationsRealtimeGateway } from '../locations-realtime/locations-realtime.gateway.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toNotificationResponse, type NotificationResponseDto } from './dto/notification-response.dto.js';

export type CreateNotificationInput = {
  tipo: TipoNotificacion;
  alcance: AlcanceNotificacion;
  titulo: string;
  mensaje?: string;
  tipoReferencia?: TipoReferencia;
  idReferencia?: bigint;
  userIds: number[];
};

type DbClient = Prisma.TransactionClient | PrismaService;

type NotificationWithRecipients = Notificacion & {
  destinatarios: NotificacionUsuario[];
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationsRealtimeGateway: LocationsRealtimeGateway,
  ) {}

  async createForUsers(input: CreateNotificationInput, db: DbClient = this.prisma) {
    const userIds = [...new Set(input.userIds)];

    if (userIds.length === 0) {
      return null;
    }

    const created = await db.notificacion.create({
      data: {
        tipo: input.tipo,
        alcance: input.alcance,
        titulo: input.titulo,
        mensaje: input.mensaje,
        tipoReferencia: input.tipoReferencia,
        idReferencia: input.idReferencia,
        destinatarios: {
          create: userIds.map((idUsuario) => ({ idUsuario })),
        },
      },
      include: { destinatarios: true },
    });

    this.emitCreated(created);
    return created;
  }

  async findMine(
    idUsuario: number,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<NotificationResponseDto[]> {
    const rows = await this.prisma.notificacionUsuario.findMany({
      where: {
        idUsuario,
        ...(options.unreadOnly ? { leida: false } : {}),
      },
      include: { notificacion: true },
      orderBy: { notificacion: { fechaCreacion: 'desc' } },
      take: options.limit ?? 20,
      skip: options.offset ?? 0,
    });

    return rows.map(toNotificationResponse);
  }

  async unreadCount(idUsuario: number): Promise<number> {
    return this.prisma.notificacionUsuario.count({
      where: { idUsuario, leida: false },
    });
  }

  async markRead(idUsuario: number, idNotificacion: bigint): Promise<NotificationResponseDto> {
    const row = await this.prisma.notificacionUsuario.findUnique({
      where: {
        idNotificacion_idUsuario: {
          idNotificacion,
          idUsuario,
        },
      },
      include: { notificacion: true },
    });

    if (!row) {
      throw new NotFoundException('Notificación no encontrada');
    }

    if (row.leida) {
      return toNotificationResponse(row);
    }

    const updated = await this.prisma.notificacionUsuario.update({
      where: { idNotificacionUsuario: row.idNotificacionUsuario },
      data: {
        leida: true,
        fechaLectura: new Date(),
      },
      include: { notificacion: true },
    });

    return toNotificationResponse(updated);
  }

  async markAllRead(idUsuario: number): Promise<number> {
    const result = await this.prisma.notificacionUsuario.updateMany({
      where: { idUsuario, leida: false },
      data: {
        leida: true,
        fechaLectura: new Date(),
      },
    });

    return result.count;
  }

  private emitCreated(created: NotificationWithRecipients): void {
    for (const destinatario of created.destinatarios) {
      this.locationsRealtimeGateway.emitNotificationCreated(destinatario.idUsuario, {
        notification: toNotificationResponse({
          ...destinatario,
          notificacion: created,
        }),
      });
    }
  }
}

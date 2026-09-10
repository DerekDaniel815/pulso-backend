import { Injectable, NotFoundException } from '@nestjs/common';
import type { AlcanceNotificacion, TipoNotificacion, TipoReferencia } from '../common/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
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

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUsers(input: CreateNotificationInput, db: DbClient = this.prisma) {
    const userIds = [...new Set(input.userIds)];

    if (userIds.length === 0) {
      return null;
    }

    return db.notificacion.create({
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
    });
  }

  async findMine(idUsuario: number, unreadOnly = false): Promise<NotificationResponseDto[]> {
    const rows = await this.prisma.notificacionUsuario.findMany({
      where: {
        idUsuario,
        ...(unreadOnly ? { leida: false } : {}),
      },
      include: { notificacion: true },
      orderBy: { notificacion: { fechaCreacion: 'desc' } },
    });

    return rows.map(toNotificationResponse);
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
}

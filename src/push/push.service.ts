import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toIdString } from '../common/utils/serialize.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPushTokenResponse, type PushTokenResponseDto } from './dto/push-token-response.dto.js';
import type { RegisterPushTokenDto } from './dto/register-push-token.dto.js';
import { ExpoPushClient, type ExpoPushMessage, type ExpoPushTicket } from './expo-push.client.js';

export type PushNotificationSource = {
  titulo: string;
  mensaje: string | null;
  tipo: string;
  tipoReferencia: string | null;
  idReferencia: bigint | null;
  destinatarios: { idNotificacionUsuario: bigint; idUsuario: number }[];
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPushClient: ExpoPushClient,
  ) {}

  async register(idUsuario: number, dto: RegisterPushTokenDto): Promise<PushTokenResponseDto> {
    const row = await this.prisma.usuarioPushToken.upsert({
      where: { token: dto.token },
      create: {
        idUsuario,
        token: dto.token,
        plataforma: dto.platform,
        activo: true,
      },
      update: {
        idUsuario,
        plataforma: dto.platform,
        activo: true,
      },
    });

    return toPushTokenResponse(row);
  }

  async deactivate(idUsuario: number, token: string): Promise<PushTokenResponseDto> {
    const row = await this.prisma.usuarioPushToken.findUnique({ where: { token } });

    if (!row || row.idUsuario !== idUsuario) {
      throw new NotFoundException('Token no encontrado');
    }

    if (!row.activo) {
      return toPushTokenResponse(row);
    }

    const updated = await this.prisma.usuarioPushToken.update({
      where: { idUsuarioPushToken: row.idUsuarioPushToken },
      data: { activo: false },
    });

    return toPushTokenResponse(updated);
  }

  dispatch(notification: PushNotificationSource): void {
    void this.deliver(notification);
  }

  async deliver(notification: PushNotificationSource): Promise<void> {
    try {
      const messages = await this.buildMessages(notification);

      if (messages.length === 0) {
        return;
      }

      const tickets = await this.expoPushClient.send(messages);
      await this.deactivateRejectedTokens(messages, tickets);
    } catch (error) {
      this.logger.warn(
        `Push no enviado; la notificación permanece persistida${
          error instanceof Error ? `: ${error.message}` : ''
        }`,
      );
    }
  }

  private async buildMessages(notification: PushNotificationSource): Promise<ExpoPushMessage[]> {
    if (notification.destinatarios.length === 0) {
      return [];
    }

    const tokens = await this.prisma.usuarioPushToken.findMany({
      where: {
        activo: true,
        idUsuario: { in: notification.destinatarios.map((row) => row.idUsuario) },
      },
    });

    const tokensByUser = new Map<number, string[]>();

    for (const token of tokens) {
      const current = tokensByUser.get(token.idUsuario) ?? [];
      current.push(token.token);
      tokensByUser.set(token.idUsuario, current);
    }

    const messages: ExpoPushMessage[] = [];

    for (const destinatario of notification.destinatarios) {
      for (const token of tokensByUser.get(destinatario.idUsuario) ?? []) {
        messages.push({
          to: token,
          title: notification.titulo,
          body: notification.mensaje ?? '',
          data: {
            idNotificacionUsuario: toIdString(destinatario.idNotificacionUsuario),
            tipo: notification.tipo,
            tipoReferencia: notification.tipoReferencia ?? '',
            idReferencia:
              notification.idReferencia == null ? '' : toIdString(notification.idReferencia),
          },
        });
      }
    }

    return messages;
  }

  private async deactivateRejectedTokens(
    messages: ExpoPushMessage[],
    tickets: ExpoPushTicket[],
  ): Promise<void> {
    const rejected: string[] = [];

    for (let index = 0; index < Math.min(messages.length, tickets.length); index++) {
      const ticket = tickets[index];
      const message = messages[index];

      if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && message) {
        rejected.push(message.to);
      }
    }

    if (rejected.length === 0) {
      return;
    }

    await this.prisma.usuarioPushToken.updateMany({
      where: { token: { in: rejected } },
      data: { activo: false },
    });

    this.logger.warn(`Tokens Expo desactivados por DeviceNotRegistered: ${rejected.length}`);
  }
}

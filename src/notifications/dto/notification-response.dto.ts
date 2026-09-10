import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Notificacion, NotificacionUsuario } from '../../generated/prisma/client.js';
import { toIdString, toIso } from '../../common/utils/serialize.js';

export class NotificationResponseDto {
  @ApiProperty()
  idNotificacionUsuario: string;

  @ApiProperty()
  idNotificacion: string;

  @ApiProperty()
  tipo: string;

  @ApiProperty()
  alcance: string;

  @ApiProperty()
  titulo: string;

  @ApiPropertyOptional()
  mensaje: string | null;

  @ApiPropertyOptional()
  tipoReferencia: string | null;

  @ApiPropertyOptional()
  idReferencia: string | null;

  @ApiProperty()
  leida: boolean;

  @ApiPropertyOptional()
  fechaLectura: string | null;

  @ApiProperty()
  fechaCreacion: string;
}

type NotificationWithMeta = NotificacionUsuario & {
  notificacion: Notificacion;
};

export function toNotificationResponse(row: NotificationWithMeta): NotificationResponseDto {
  return {
    idNotificacionUsuario: toIdString(row.idNotificacionUsuario),
    idNotificacion: toIdString(row.idNotificacion),
    tipo: row.notificacion.tipo,
    alcance: row.notificacion.alcance,
    titulo: row.notificacion.titulo,
    mensaje: row.notificacion.mensaje,
    tipoReferencia: row.notificacion.tipoReferencia,
    idReferencia: row.notificacion.idReferencia ? toIdString(row.notificacion.idReferencia) : null,
    leida: row.leida,
    fechaLectura: toIso(row.fechaLectura),
    fechaCreacion: toIso(row.notificacion.fechaCreacion) as string,
  };
}

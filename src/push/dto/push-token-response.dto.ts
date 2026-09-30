import { ApiProperty } from '@nestjs/swagger';
import type { UsuarioPushToken } from '../../generated/prisma/client.js';
import { toIso } from '../../common/utils/serialize.js';

export class PushTokenResponseDto {
  @ApiProperty()
  idUsuarioPushToken: number;

  @ApiProperty()
  token: string;

  @ApiProperty({ enum: ['android', 'ios'] })
  plataforma: string;

  @ApiProperty()
  activo: boolean;

  @ApiProperty()
  fechaRegistro: string;

  @ApiProperty()
  fechaActualizacion: string;
}

export function toPushTokenResponse(row: UsuarioPushToken): PushTokenResponseDto {
  return {
    idUsuarioPushToken: row.idUsuarioPushToken,
    token: row.token,
    plataforma: row.plataforma,
    activo: row.activo,
    fechaRegistro: toIso(row.fechaRegistro) as string,
    fechaActualizacion: toIso(row.fechaActualizacion) as string,
  };
}

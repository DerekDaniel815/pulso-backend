import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Dispositivo, UsuarioDispositivo } from '../../generated/prisma/client.js';
import { DeviceResponseDto, toDeviceResponse } from '../../devices/dto/device-response.dto.js';
import { toIso } from '../../common/utils/serialize.js';

export class UserDeviceResponseDto {
  @ApiProperty()
  idUsuarioDispositivo: number;

  @ApiProperty()
  idUsuario: number;

  @ApiProperty()
  idDispositivo: number;

  @ApiPropertyOptional()
  alias: string | null;

  @ApiProperty()
  ubicacionActiva: boolean;

  @ApiProperty()
  visibilidadPreferida: string;

  @ApiProperty()
  fechaAsignacion: string;

  @ApiPropertyOptional()
  fechaDesvinculacion: string | null;

  @ApiProperty()
  estado: boolean;

  @ApiPropertyOptional({ type: () => DeviceResponseDto })
  dispositivo?: DeviceResponseDto;
}

type AssignmentWithDevice = UsuarioDispositivo & {
  dispositivo?: Dispositivo;
};

export function toUserDeviceResponse(row: AssignmentWithDevice): UserDeviceResponseDto {
  return {
    idUsuarioDispositivo: row.idUsuarioDispositivo,
    idUsuario: row.idUsuario,
    idDispositivo: row.idDispositivo,
    alias: row.alias,
    ubicacionActiva: row.ubicacionActiva,
    visibilidadPreferida: row.visibilidadPreferida,
    fechaAsignacion: toIso(row.fechaAsignacion) as string,
    fechaDesvinculacion: toIso(row.fechaDesvinculacion),
    estado: row.estado,
    dispositivo: row.dispositivo ? toDeviceResponse(row.dispositivo) : undefined,
  };
}

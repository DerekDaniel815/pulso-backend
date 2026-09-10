import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Usuario } from '../../generated/prisma/client.js';
import { RolSistema } from '../../common/enums.js';
import { toIso } from '../../common/utils/serialize.js';

export class UserPublicDto {
  @ApiProperty()
  idUsuario: number;

  @ApiProperty()
  nombres: string;

  @ApiProperty()
  apellidos: string;
}

export class UserSearchDto extends UserPublicDto {
  @ApiProperty({ description: 'Correo visible para identificar al usuario al agregarlo.' })
  correo: string;
}

export class UserResponseDto extends UserSearchDto {
  @ApiPropertyOptional()
  telefono: string | null;

  @ApiProperty({ enum: RolSistema })
  rol: RolSistema;

  @ApiProperty()
  estado: boolean;

  @ApiProperty()
  fechaRegistro: string;

  @ApiProperty()
  fechaActualizacion: string;
}

export function toUserPublic(user: Pick<Usuario, 'idUsuario' | 'nombres' | 'apellidos'>): UserPublicDto {
  return {
    idUsuario: user.idUsuario,
    nombres: user.nombres,
    apellidos: user.apellidos,
  };
}

export function toUserSearch(user: Pick<Usuario, 'idUsuario' | 'nombres' | 'apellidos' | 'correo'>): UserSearchDto {
  return {
    ...toUserPublic(user),
    correo: user.correo,
  };
}

export function toUserResponse(user: Usuario): UserResponseDto {
  return {
    ...toUserSearch(user),
    telefono: user.telefono,
    rol: user.rol as RolSistema,
    estado: user.estado,
    fechaRegistro: toIso(user.fechaRegistro) as string,
    fechaActualizacion: toIso(user.fechaActualizacion) as string,
  };
}

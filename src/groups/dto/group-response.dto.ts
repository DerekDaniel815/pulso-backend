import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Grupo, GrupoUsuario, Usuario } from '../../generated/prisma/client.js';
import { toUserPublic, UserPublicDto } from '../../users/dto/user-response.dto.js';
import { toIso } from '../../common/utils/serialize.js';

export class GroupMemberResponseDto {
  @ApiProperty()
  idGrupoUsuario: number;

  @ApiProperty()
  idGrupo: number;

  @ApiProperty({ type: UserPublicDto })
  usuario: UserPublicDto;

  @ApiProperty()
  rol: string;

  @ApiProperty()
  fechaIngreso: string;

  @ApiProperty()
  estado: boolean;
}

export class GroupResponseDto {
  @ApiProperty()
  idGrupo: number;

  @ApiProperty()
  nombre: string;

  @ApiPropertyOptional()
  descripcion: string | null;

  @ApiProperty()
  idCreador: number;

  @ApiProperty()
  estado: boolean;

  @ApiProperty()
  fechaCreacion: string;

  @ApiPropertyOptional({ type: [GroupMemberResponseDto] })
  miembros?: GroupMemberResponseDto[];
}

type MemberRow = GrupoUsuario & { usuario: Usuario };

export function toGroupMemberResponse(row: MemberRow): GroupMemberResponseDto {
  return {
    idGrupoUsuario: row.idGrupoUsuario,
    idGrupo: row.idGrupo,
    usuario: toUserPublic(row.usuario),
    rol: row.rol,
    fechaIngreso: toIso(row.fechaIngreso) as string,
    estado: row.estado,
  };
}

export function toGroupResponse(
  group: Grupo & { miembros?: MemberRow[] },
): GroupResponseDto {
  return {
    idGrupo: group.idGrupo,
    nombre: group.nombre,
    descripcion: group.descripcion,
    idCreador: group.idCreador,
    estado: group.estado,
    fechaCreacion: toIso(group.fechaCreacion) as string,
    miembros: group.miembros?.map(toGroupMemberResponse),
  };
}

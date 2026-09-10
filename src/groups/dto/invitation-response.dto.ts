import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Grupo, GrupoInvitacion, Usuario } from '../../generated/prisma/client.js';
import { toUserPublic, UserPublicDto } from '../../users/dto/user-response.dto.js';
import { toIso } from '../../common/utils/serialize.js';

export class InvitationResponseDto {
  @ApiProperty()
  idInvitacion: number;

  @ApiProperty()
  idGrupo: number;

  @ApiProperty()
  nombreGrupo: string;

  @ApiProperty({ type: UserPublicDto })
  invitador: UserPublicDto;

  @ApiProperty({ type: UserPublicDto })
  invitado: UserPublicDto;

  @ApiProperty()
  estado: string;

  @ApiProperty()
  fechaInvitacion: string;

  @ApiPropertyOptional()
  fechaRespuesta: string | null;
}

type InvitationRow = GrupoInvitacion & {
  grupo: Grupo;
  invitador: Usuario;
  invitado: Usuario;
};

export function toInvitationResponse(row: InvitationRow): InvitationResponseDto {
  return {
    idInvitacion: row.idInvitacion,
    idGrupo: row.idGrupo,
    nombreGrupo: row.grupo.nombre,
    invitador: toUserPublic(row.invitador),
    invitado: toUserPublic(row.invitado),
    estado: row.estado,
    fechaInvitacion: toIso(row.fechaInvitacion) as string,
    fechaRespuesta: toIso(row.fechaRespuesta),
  };
}

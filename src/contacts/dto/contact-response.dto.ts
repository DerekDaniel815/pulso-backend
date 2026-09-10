import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Usuario, UsuarioContacto } from '../../generated/prisma/client.js';
import { toUserPublic, UserPublicDto } from '../../users/dto/user-response.dto.js';
import { toIso } from '../../common/utils/serialize.js';

export class ContactResponseDto {
  @ApiProperty()
  idUsuarioContacto: number;

  @ApiProperty({ type: UserPublicDto })
  contacto: UserPublicDto;

  @ApiProperty()
  estado: string;

  @ApiProperty({ description: 'Si el usuario autenticado comparte su ubicación con este contacto.' })
  yoCompartoUbicacion: boolean;

  @ApiProperty({ description: 'Si el otro usuario comparte su ubicación con el autenticado.' })
  contactoComparteUbicacion: boolean;

  @ApiProperty()
  soySolicitante: boolean;

  @ApiProperty()
  fechaSolicitud: string;

  @ApiPropertyOptional()
  fechaRespuesta: string | null;
}

type ContactRow = UsuarioContacto & {
  usuario1: Usuario;
  usuario2: Usuario;
};

export function toContactResponse(row: ContactRow, viewerId: number): ContactResponseDto {
  const viewerIsUsuario1 = row.idUsuario1 === viewerId;
  const other = viewerIsUsuario1 ? row.usuario2 : row.usuario1;

  return {
    idUsuarioContacto: row.idUsuarioContacto,
    contacto: toUserPublic(other),
    estado: row.estado,
    yoCompartoUbicacion: viewerIsUsuario1
      ? row.usuario1ComparteUbicacion
      : row.usuario2ComparteUbicacion,
    contactoComparteUbicacion: viewerIsUsuario1
      ? row.usuario2ComparteUbicacion
      : row.usuario1ComparteUbicacion,
    soySolicitante: row.idUsuarioSolicitante === viewerId,
    fechaSolicitud: toIso(row.fechaSolicitud) as string,
    fechaRespuesta: toIso(row.fechaRespuesta),
  };
}

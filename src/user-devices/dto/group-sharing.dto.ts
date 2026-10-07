import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { UserPublicDto } from '../../users/dto/user-response.dto.js';

export class GroupSharingItemDto {
  @ApiProperty()
  idGrupo: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  compartiendo: boolean;

  @ApiProperty({ type: [UserPublicDto] })
  miembrosExcluidos: UserPublicDto[];
}

export class UpdateGroupSharingDto {
  @ApiProperty()
  @IsBoolean()
  comparteUbicacion: boolean;
}

export class UpdateMemberGroupSharingDto {
  @ApiProperty({ description: 'false crea una exclusión en este grupo; true la quita.' })
  @IsBoolean()
  permitido: boolean;
}

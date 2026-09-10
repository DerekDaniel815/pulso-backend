import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty()
  @IsInt()
  idUsuarioInvitado: number;
}

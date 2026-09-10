import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class CreateContactRequestDto {
  @ApiProperty({ description: 'ID del usuario al que se envía la solicitud' })
  @IsInt()
  idUsuarioDestino: number;
}

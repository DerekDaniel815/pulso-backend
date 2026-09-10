import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UserSearchQueryDto {
  @ApiProperty({ description: 'Texto a buscar en nombres, apellidos o correo', minLength: 2 })
  @IsString()
  @MinLength(2)
  q: string;
}

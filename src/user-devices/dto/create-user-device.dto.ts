import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateUserDeviceDto {
  @ApiProperty({
    example: 'PUL-X7K4M92Q',
    description: 'Código impreso en el dispositivo, generado por el backend al crear el inventario.',
  })
  @IsString()
  @MaxLength(50)
  @Matches(/^PUL-[A-HJ-NP-Z2-9]{8}$/, {
    message: 'codigoDispositivo debe tener el formato PUL-XXXXXXXX',
  })
  codigoDispositivo: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'Mi tracker' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  alias?: string;
}

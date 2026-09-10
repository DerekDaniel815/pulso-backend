import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateLocationPermissionDto {
  @ApiProperty({
    description: 'Si es true, el usuario autenticado comparte su ubicación con este contacto.',
  })
  @IsBoolean()
  comparteUbicacion: boolean;
}

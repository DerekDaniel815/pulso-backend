import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EstadoDispositivo } from '../../common/enums.js';

export class UpdateDeviceDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelo?: string;

  @ApiPropertyOptional({ enum: EstadoDispositivo })
  @IsOptional()
  @IsEnum(EstadoDispositivo)
  estado?: EstadoDispositivo;
}

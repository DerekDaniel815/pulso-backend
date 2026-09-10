import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { ActivadaDesde } from '../../common/enums.js';

export class CreateEmergencyDto {
  @ApiProperty()
  @IsInt()
  idUsuarioDispositivo: number;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipo?: string;

  @ApiProperty({ enum: ActivadaDesde })
  @IsEnum(ActivadaDesde)
  activadaDesde: ActivadaDesde;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;
}

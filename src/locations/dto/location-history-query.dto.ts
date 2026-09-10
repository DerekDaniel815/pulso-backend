import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class LocationHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Inicio del rango (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fin del rango (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

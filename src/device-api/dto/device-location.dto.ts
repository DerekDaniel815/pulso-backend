import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class DeviceLocationDto {
  @ApiProperty({ example: -12.046374, minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: -77.042793, minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 154.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  altitude?: number;

  @ApiPropertyOptional({ example: 7.2, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  accuracy?: number;

  @ApiPropertyOptional({ example: 1.4, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  speed?: number;

  @ApiProperty({
    example: '2026-09-09T18:45:20-05:00',
    description: 'Fecha/hora en que el dispositivo obtuvo la coordenada (GNSS).',
  })
  @IsDateString()
  deviceTimestamp: string;

  @ApiPropertyOptional({ default: false, description: 'true si la coordenada se envía en lote offline.' })
  @IsOptional()
  @IsBoolean()
  offlineSync?: boolean;
}

export class DeviceLocationResponseDto {
  @ApiProperty({ example: true })
  ok: boolean;

  @ApiProperty({
    example: '2026-09-09T23:45:21.000Z',
    description: 'Momento en que el backend recibió y almacenó la coordenada (fecha_hora_servidor).',
  })
  receivedAt: string;
}

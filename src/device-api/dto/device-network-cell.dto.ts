import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class DeviceNetworkCellDto {
  @ApiProperty({ enum: ['lte'] })
  @IsIn(['lte'])
  radioType: 'lte';

  @ApiProperty({ minimum: 100, maximum: 999 })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(999)
  mcc: number;

  @ApiProperty({ minimum: 0, maximum: 999 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  mnc: number;

  @ApiProperty({ minimum: 1, maximum: 65535, description: 'TAC de la celda LTE.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  tac: number;

  @ApiProperty({
    minimum: 256,
    maximum: 268435455,
    description: 'ECI completo de 28 bits. No se acepta un identificador de sector de 8 bits.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(256)
  @Max(268435455)
  eci: number;

  @ApiPropertyOptional({ minimum: -140, maximum: -40, description: 'RSRP en dBm, si el módem lo entregó.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-140)
  @Max(-40)
  rsrp?: number;

  @ApiProperty()
  @IsDateString()
  deviceTimestamp: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{8,40}$/)
  clientLocationId?: string;
}

export class DeviceNetworkCellResponseDto {
  @ApiProperty()
  ok: boolean;

  @ApiProperty({ enum: ['disabled', 'located', 'cached', 'unavailable', 'retry'] })
  status: 'disabled' | 'located' | 'cached' | 'unavailable' | 'retry';

  @ApiProperty({ description: 'Segundos que el firmware debe esperar antes de repetir esta celda.' })
  retryAfterSeconds: number;

  @ApiProperty()
  trackingEnabled: boolean;

  @ApiProperty()
  emergencyActive: boolean;

  @ApiPropertyOptional()
  receivedAt?: string;
}

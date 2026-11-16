import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class DeviceWifiAccessPointDto {
  @ApiProperty({ description: 'BSSID. No se envía el SSID ni la contraseña.' })
  @IsString()
  @MaxLength(17)
  macAddress: string;

  @ApiProperty({ description: 'Potencia de la señal en dBm.' })
  @Type(() => Number)
  @IsInt()
  signalStrength: number;
}

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

  @ApiPropertyOptional({
    type: [DeviceWifiAccessPointDto],
    description: 'Puntos de acceso observados, sin conectarse a ellos. Si quedan menos de dos válidos, se usa solo la celda.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => DeviceWifiAccessPointDto)
  wifiAccessPoints?: DeviceWifiAccessPointDto[];

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

  @ApiProperty({
    description:
      'located y cached usan 10. Una caída temporal usa 60. Cuota o un rechazo de clave, restricción, API o facturación usa 900.',
  })
  retryAfterSeconds: number;

  @ApiProperty()
  trackingEnabled: boolean;

  @ApiProperty()
  emergencyActive: boolean;

  @ApiPropertyOptional()
  receivedAt?: string;
}

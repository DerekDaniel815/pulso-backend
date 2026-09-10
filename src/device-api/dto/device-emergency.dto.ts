import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DeviceEmergencyLocationDto {
  @ApiProperty({ example: -12.046374 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: -77.042793 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 6.8, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  accuracy?: number;
}

export class DeviceEmergencyDto {
  @ApiProperty({ example: 'SOS', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  type: string;

  @ApiProperty({ example: '2026-09-09T18:47:12-05:00' })
  @IsDateString()
  deviceTimestamp: string;

  @ApiPropertyOptional({ type: DeviceEmergencyLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceEmergencyLocationDto)
  location?: DeviceEmergencyLocationDto;
}

export class DeviceEmergencyResponseDto {
  @ApiProperty({ example: 'EME-A1B2C3D4' })
  codigoPublico: string;

  @ApiProperty({ example: 'ACTIVA' })
  estado: string;

  @ApiProperty({ example: '2026-09-09T23:47:13.000Z' })
  receivedAt: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Ubicacion } from '../../generated/prisma/client.js';
import { toIdString, toIso, toNumber } from '../../common/utils/serialize.js';

export class LocationResponseDto {
  @ApiProperty()
  idUbicacion: string;

  @ApiProperty()
  idUsuarioDispositivo: number;

  @ApiProperty()
  latitud: number;

  @ApiProperty()
  longitud: number;

  @ApiPropertyOptional()
  altitud: number | null;

  @ApiPropertyOptional()
  precisionGps: number | null;

  @ApiPropertyOptional()
  velocidad: number | null;

  @ApiProperty({ description: 'Fecha real de la coordenada. El frontend calcula el tiempo relativo.' })
  fechaHoraDispositivo: string;

  @ApiProperty()
  fechaHoraServidor: string;

  @ApiProperty()
  fueSincronizadaOffline: boolean;
}

export function toLocationResponse(row: Ubicacion): LocationResponseDto {
  return {
    idUbicacion: toIdString(row.idUbicacion),
    idUsuarioDispositivo: row.idUsuarioDispositivo,
    latitud: toNumber(row.latitud) as number,
    longitud: toNumber(row.longitud) as number,
    altitud: toNumber(row.altitud),
    precisionGps: toNumber(row.precisionGps),
    velocidad: toNumber(row.velocidad),
    fechaHoraDispositivo: toIso(row.fechaHoraDispositivo) as string,
    fechaHoraServidor: toIso(row.fechaHoraServidor) as string,
    fueSincronizadaOffline: row.fueSincronizadaOffline,
  };
}

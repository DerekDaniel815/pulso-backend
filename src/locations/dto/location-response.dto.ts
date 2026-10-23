import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Ubicacion } from '../../generated/prisma/client.js';
import { toIdString, toIso, toNumber } from '../../common/utils/serialize.js';
import { applyLiveMetadata } from '../location-freshness.js';

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

  @ApiProperty({ description: 'true si offlineSync es false y fechaHoraServidor está dentro del TTL.' })
  isLive: boolean;

  @ApiPropertyOptional({ description: 'fechaHoraServidor + TTL. Null si el punto es offline.' })
  liveExpiresAt: string | null;
}

export function toLocationResponse(row: Ubicacion, now = new Date()): LocationResponseDto {
  return applyLiveMetadata(
    {
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
      isLive: false,
      liveExpiresAt: null,
    },
    now,
  );
}

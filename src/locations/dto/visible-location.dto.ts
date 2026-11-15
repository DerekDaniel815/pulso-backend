import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LocationSource } from '../location-source.js';
import { LocationResponseDto } from './location-response.dto.js';

export class VisibleLocationAssignmentDto {
  @ApiProperty()
  idUsuarioDispositivo: number;

  @ApiProperty()
  idUsuario: number;

  @ApiPropertyOptional()
  alias: string | null;

  @ApiProperty()
  codigoDispositivo: string;

  @ApiProperty()
  visibilidadPreferida: string;

  @ApiProperty()
  ubicacionActiva: boolean;
}

export class VisibleLocationResponseDto {
  @ApiProperty({ type: VisibleLocationAssignmentDto })
  assignment: VisibleLocationAssignmentDto;

  @ApiProperty({ type: LocationResponseDto })
  location: LocationResponseDto;

  @ApiProperty()
  emergenciaActiva: boolean;
}

export class PublicLocationPointDto {
  @ApiProperty()
  latitud: number;

  @ApiProperty()
  longitud: number;

  @ApiPropertyOptional()
  altitud: number | null;

  @ApiPropertyOptional()
  precisionGps: number | null;

  @ApiProperty({ enum: ['GNSS', 'CELL', 'NETWORK'] })
  locationSource: LocationSource;

  @ApiProperty()
  isApproximate: boolean;

  @ApiProperty()
  fechaHoraDispositivo: string;

  @ApiProperty()
  fechaHoraServidor: string;

  @ApiProperty()
  offlineSync: boolean;

  @ApiProperty()
  isLive: boolean;

  @ApiPropertyOptional()
  liveExpiresAt: string | null;
}

export class PublicLocationMarkerDto {
  @ApiProperty({ description: 'Clave opaca para upsert del marker (VIS-{id} o codigoPublico)' })
  clavePublica: string;

  @ApiProperty({ enum: ['PUBLICO', 'EMERGENCIA'] })
  origen: 'PUBLICO' | 'EMERGENCIA';

  @ApiPropertyOptional()
  codigoPublico: string | null;

  @ApiProperty({ type: PublicLocationPointDto })
  ubicacion: PublicLocationPointDto;

  @ApiProperty()
  fechaUltimaUbicacion: string;
}

export function toPublicLocationPoint(location: LocationResponseDto): PublicLocationPointDto {
  return {
    latitud: location.latitud,
    longitud: location.longitud,
    altitud: location.altitud,
    precisionGps: location.precisionGps,
    locationSource: location.locationSource,
    isApproximate: location.isApproximate,
    fechaHoraDispositivo: location.fechaHoraDispositivo,
    fechaHoraServidor: location.fechaHoraServidor,
    offlineSync: location.fueSincronizadaOffline,
    isLive: location.isLive,
    liveExpiresAt: location.liveExpiresAt,
  };
}

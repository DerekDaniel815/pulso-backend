import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Emergencia, Ubicacion } from '../../generated/prisma/client.js';
import {
  LocationResponseDto,
  toLocationResponse,
} from '../../locations/dto/location-response.dto.js';
import { toIdString, toIso } from '../../common/utils/serialize.js';
import { type LocationSource } from '../../locations/location-source.js';

export class PublicLocationDto {
  @ApiProperty()
  latitud: number;

  @ApiProperty()
  longitud: number;

  @ApiPropertyOptional()
  altitud: number | null;

  @ApiPropertyOptional()
  precisionGps: number | null;

  @ApiProperty({ enum: ['GNSS', 'CELL'] })
  locationSource: LocationSource;

  @ApiProperty()
  isApproximate: boolean;

  @ApiProperty()
  fechaHoraDispositivo: string;

  @ApiProperty({ description: 'Fecha real de recepción. No se renueva al consultar.' })
  fechaHoraServidor: string;

  @ApiProperty({ description: 'true solo si la coordenada está dentro del TTL normal.' })
  isLive: boolean;

  @ApiPropertyOptional({ description: 'fechaHoraServidor + TTL. Null si el punto es offline.' })
  liveExpiresAt: string | null;
}

export class PublicEmergencyResponseDto {
  @ApiProperty({ description: 'Misma clave del marcador público. En una emergencia es el código público.' })
  clavePublica: string;

  @ApiProperty()
  codigoPublico: string;

  @ApiProperty()
  estado: string;

  @ApiPropertyOptional({ type: PublicLocationDto })
  ubicacion: PublicLocationDto | null;

  @ApiPropertyOptional({ description: 'Fecha real de la última ubicación. El frontend calcula el relativo.' })
  fechaUltimaUbicacion: string | null;
}

export class EmergencyResponseDto {
  @ApiProperty()
  idEmergencia: string;

  @ApiProperty()
  codigoPublico: string;

  @ApiProperty()
  idUsuarioDispositivo: number;

  @ApiPropertyOptional()
  tipo: string | null;

  @ApiProperty()
  estado: string;

  @ApiProperty()
  activadaDesde: string;

  @ApiPropertyOptional()
  descripcion: string | null;

  @ApiProperty()
  fechaInicio: string;

  @ApiPropertyOptional()
  fechaFin: string | null;

  @ApiPropertyOptional({ enum: ['MANUAL_APP', 'MANUAL_DEVICE', 'EXPIRADA'] })
  motivoFinalizacion: string | null;

  @ApiPropertyOptional({ enum: ['APP', 'DISPOSITIVO', 'SISTEMA'] })
  finalizadaDesde: string | null;

  @ApiPropertyOptional({ type: LocationResponseDto })
  ubicacion: LocationResponseDto | null;

  @ApiPropertyOptional()
  fechaUltimaUbicacion: string | null;
}

function toPublicLocation(location: Ubicacion, now: Date): PublicLocationDto {
  const annotated = toLocationResponse(location, now);
  return {
    latitud: annotated.latitud,
    longitud: annotated.longitud,
    altitud: annotated.altitud,
    precisionGps: annotated.precisionGps,
    locationSource: annotated.locationSource,
    isApproximate: annotated.isApproximate,
    fechaHoraDispositivo: annotated.fechaHoraDispositivo,
    fechaHoraServidor: annotated.fechaHoraServidor,
    isLive: annotated.isLive,
    liveExpiresAt: annotated.liveExpiresAt,
  };
}

export function toPublicEmergencyResponse(
  emergency: Emergencia,
  location: Ubicacion | null,
  now = new Date(),
): PublicEmergencyResponseDto {
  return {
    clavePublica: emergency.codigoPublico,
    codigoPublico: emergency.codigoPublico,
    estado: emergency.estado,
    ubicacion: location ? toPublicLocation(location, now) : null,
    fechaUltimaUbicacion: location ? (toIso(location.fechaHoraDispositivo) as string) : null,
  };
}

export function toEmergencyResponse(
  emergency: Emergencia,
  location: Ubicacion | null,
): EmergencyResponseDto {
  return {
    idEmergencia: toIdString(emergency.idEmergencia),
    codigoPublico: emergency.codigoPublico,
    idUsuarioDispositivo: emergency.idUsuarioDispositivo,
    tipo: emergency.tipo,
    estado: emergency.estado,
    activadaDesde: emergency.activadaDesde,
    descripcion: emergency.descripcion,
    fechaInicio: toIso(emergency.fechaInicio) as string,
    fechaFin: toIso(emergency.fechaFin),
    motivoFinalizacion: emergency.motivoFinalizacion,
    finalizadaDesde: emergency.finalizadaDesde,
    ubicacion: location ? toLocationResponse(location) : null,
    fechaUltimaUbicacion: location ? (toIso(location.fechaHoraDispositivo) as string) : null,
  };
}

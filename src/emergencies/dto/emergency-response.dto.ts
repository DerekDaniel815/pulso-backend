import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Emergencia, Ubicacion } from '../../generated/prisma/client.js';
import {
  LocationResponseDto,
  toLocationResponse,
} from '../../locations/dto/location-response.dto.js';
import { toIdString, toIso, toNumber } from '../../common/utils/serialize.js';

export class PublicLocationDto {
  @ApiProperty()
  latitud: number;

  @ApiProperty()
  longitud: number;

  @ApiPropertyOptional()
  altitud: number | null;

  @ApiProperty()
  fechaHoraDispositivo: string;
}

export class PublicEmergencyResponseDto {
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

  @ApiPropertyOptional({ type: LocationResponseDto })
  ubicacion: LocationResponseDto | null;

  @ApiPropertyOptional()
  fechaUltimaUbicacion: string | null;
}

function toPublicLocation(location: Ubicacion): PublicLocationDto {
  return {
    latitud: toNumber(location.latitud) as number,
    longitud: toNumber(location.longitud) as number,
    altitud: toNumber(location.altitud),
    fechaHoraDispositivo: toIso(location.fechaHoraDispositivo) as string,
  };
}

export function toPublicEmergencyResponse(
  emergency: Emergencia,
  location: Ubicacion | null,
): PublicEmergencyResponseDto {
  return {
    codigoPublico: emergency.codigoPublico,
    estado: emergency.estado,
    ubicacion: location ? toPublicLocation(location) : null,
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
    ubicacion: location ? toLocationResponse(location) : null,
    fechaUltimaUbicacion: location ? (toIso(location.fechaHoraDispositivo) as string) : null,
  };
}

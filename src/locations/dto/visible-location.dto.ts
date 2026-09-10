import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiProperty()
  fechaHoraDispositivo: string;
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

import type { LocationResponseDto } from '../locations/dto/location-response.dto.js';
import type { PublicLocationPointDto } from '../locations/dto/visible-location.dto.js';

export type LocationUpdatedAssignment = {
  idUsuarioDispositivo: number;
  idUsuario: number;
  alias: string | null;
  codigoDispositivo: string;
};

export type LocationUpdatedPayload = {
  location: LocationResponseDto;
  assignment: LocationUpdatedAssignment;
  emergenciaActiva?: boolean;
};

export type LocationPublicUpdatedPayload = {
  clavePublica: string;
  origen: 'PUBLICO' | 'EMERGENCIA';
  codigoPublico: string | null;
  ubicacion: PublicLocationPointDto;
};

export type EmergencyPublicUpdatedPayload = {
  codigoPublico: string;
  estado: string;
  ubicacion: PublicLocationPointDto | null;
  fechaUltimaUbicacion: string | null;
};

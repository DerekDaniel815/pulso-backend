import type { LocationResponseDto } from '../locations/dto/location-response.dto.js';

export type LocationUpdatedAssignment = {
  idUsuarioDispositivo: number;
  idUsuario: number;
  alias: string | null;
  codigoDispositivo: string;
};

export type LocationUpdatedPayload = {
  location: LocationResponseDto;
  assignment: LocationUpdatedAssignment;
};

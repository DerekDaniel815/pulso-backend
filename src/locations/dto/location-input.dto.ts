import type { LocationSource } from '../location-source.js';

export type LocationInput = {
  latitud: number;
  longitud: number;
  altitud?: number;
  precisionGps?: number;
  velocidad?: number;
  fechaHoraDispositivo: string;
  fueSincronizadaOffline?: boolean;
  clientLocationId?: string;
  fuente?: LocationSource;
};

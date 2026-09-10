export type LocationInput = {
  latitud: number;
  longitud: number;
  altitud?: number;
  precisionGps?: number;
  velocidad?: number;
  fechaHoraDispositivo: string;
  fueSincronizadaOffline?: boolean;
};

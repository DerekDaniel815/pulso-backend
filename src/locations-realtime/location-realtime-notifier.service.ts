import { Injectable, Logger } from '@nestjs/common';
import { LocationsRealtimeGateway } from './locations-realtime.gateway.js';
import type { LocationUpdatedPayload } from './location-updated.payload.js';

@Injectable()
export class LocationRealtimeNotifier {
  private readonly logger = new Logger(LocationRealtimeNotifier.name);

  constructor(private readonly gateway: LocationsRealtimeGateway) {}

  notifyLocationSaved(payload: LocationUpdatedPayload): void {
    this.logger.log(
      `[WS LOCATION] emit ${JSON.stringify({
        idUsuarioDispositivo: payload.assignment.idUsuarioDispositivo,
        idUsuario: payload.assignment.idUsuario,
        codigoDispositivo: payload.assignment.codigoDispositivo,
        latitud: payload.location.latitud,
        longitud: payload.location.longitud,
      })}`,
    );

    this.gateway.emitLocationUpdated(payload.assignment.idUsuario, payload);
  }
}

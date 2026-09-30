import { Injectable, Logger } from '@nestjs/common';
import { LocationsRealtimeGateway } from './locations-realtime.gateway.js';
import type {
  EmergencyPublicUpdatedPayload,
  LocationPublicUpdatedPayload,
  LocationUpdatedPayload,
} from './location-updated.payload.js';

@Injectable()
export class LocationRealtimeNotifier {
  private readonly logger = new Logger(LocationRealtimeNotifier.name);

  constructor(private readonly gateway: LocationsRealtimeGateway) {}

  notifyLocationSaved(
    payload: LocationUpdatedPayload,
    viewerUserIds: number[],
    publicPayload?: LocationPublicUpdatedPayload,
  ): void {
    const uniqueViewerIds = [...new Set(viewerUserIds)];

    this.logger.log(
      `[WS LOCATION] emit ${JSON.stringify({
        idUsuarioDispositivo: payload.assignment.idUsuarioDispositivo,
        viewers: uniqueViewerIds,
        public: publicPayload != null,
        latitud: payload.location.latitud,
        longitud: payload.location.longitud,
      })}`,
    );

    this.gateway.emitLocationUpdated(uniqueViewerIds, payload);

    if (publicPayload) {
      this.gateway.emitLocationPublicUpdated(publicPayload);
    }
  }

  notifyEmergencyPublicUpdated(payload: EmergencyPublicUpdatedPayload): void {
    this.logger.log(`[WS EMERGENCY PUBLIC] ${payload.estado} ${payload.codigoPublico}`);
    this.gateway.emitEmergencyPublicUpdated(payload);
  }

  notifyEmergencyPublicEnded(codigoPublico: string): void {
    this.logger.log(`[WS EMERGENCY PUBLIC] ended ${codigoPublico}`);
    this.gateway.emitEmergencyPublicEnded({ codigoPublico, estado: 'FINALIZADA' });
  }

  notifyLocationPublicRemoved(clavePublica: string): void {
    this.logger.log(`[WS LOCATION PUBLIC] removed ${clavePublica}`);
    this.gateway.emitLocationPublicRemoved({ clavePublica });
  }

  notifyPrivateLocationRemoved(userId: number, idUsuarioDispositivo: number): void {
    this.logger.log(
      `[WS LOCATION PRIVATE] removed userId=${userId} assignment=${idUsuarioDispositivo}`,
    );
    this.gateway.emitLocationPrivateRemoved(userId, { idUsuarioDispositivo });
  }

  notifyIfPublicAudienceLost(previous: {
    isPublic: boolean;
    clavePublica: string | null;
  }, next: { isPublic: boolean }): void {
    if (previous.isPublic && !next.isPublic && previous.clavePublica) {
      this.notifyLocationPublicRemoved(previous.clavePublica);
    }
  }
}

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { DevicesService } from '../devices/devices.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DeviceNetworkCellDto, DeviceNetworkCellResponseDto } from '../device-api/dto/device-network-cell.dto.js';
import { LocationAccessService } from './location-access.service.js';
import { LocationsService } from './locations.service.js';
import { GoogleGeolocationClient, type GoogleGeolocationOutcome } from './google-geolocation.client.js';

const CACHE_MS = 10 * 60 * 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  expiresAt: number;
}

@Injectable()
export class NetworkLocationService {
  private readonly logger = new Logger(NetworkLocationService.name);
  private readonly cache = new Map<string, CachedFix>();
  private readonly client: GoogleGeolocationClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly locationsService: LocationsService,
    private readonly devicesService: DevicesService,
    private readonly locationAccessService: LocationAccessService,
    private readonly prisma: PrismaService,
    @Optional() client?: GoogleGeolocationClient,
  ) {
    this.client = client ?? new GoogleGeolocationClient();
  }

  async report(device: AuthenticatedDevice, dto: DeviceNetworkCellDto): Promise<DeviceNetworkCellResponseDto> {
    const emergencyActive = await this.locationAccessService.hasActiveEmergency(device.idUsuarioDispositivo);
    const base = {
      ok: true,
      trackingEnabled: device.ubicacionActiva,
      emergencyActive,
    };
    if (!(await this.trackingAllowed(device, emergencyActive))) {
      return { ...base, status: 'retry', retryAfterSeconds: 60 };
    }

    const apiKey = this.configService.get<string>('GOOGLE_GEOLOCATION_API_KEY')?.trim() ?? '';
    if (apiKey === '') {
      return { ...base, status: 'disabled', retryAfterSeconds: 300 };
    }

    const cacheKey = `${device.idDispositivo}:${dto.mcc}:${dto.mnc}:${dto.tac}:${dto.eci}`;
    const cached = this.remembered(cacheKey);
    const outcome: GoogleGeolocationOutcome | { kind: 'cached'; latitude: number; longitude: number; accuracy: number } =
      cached == null
        ? await this.client.locate({
            mcc: dto.mcc,
            mnc: dto.mnc,
            tac: dto.tac,
            eci: dto.eci,
            rsrp: dto.rsrp,
          }, apiKey)
        : { kind: 'cached', ...cached };

    if (outcome.kind === 'quota') {
      return { ...base, status: 'retry', retryAfterSeconds: 900 };
    }
    if (outcome.kind === 'timeout' || outcome.kind === 'failed') {
      return { ...base, status: 'retry', retryAfterSeconds: 60 };
    }
    if (outcome.kind === 'unavailable') {
      return { ...base, status: 'unavailable', retryAfterSeconds: 120 };
    }

    if (outcome.kind === 'located') {
      this.cache.set(cacheKey, {
        latitude: outcome.latitude,
        longitude: outcome.longitude,
        accuracy: outcome.accuracy,
        expiresAt: Date.now() + CACHE_MS,
      });
    }

    const stored = await this.locationsService.storeDeviceLocation(device.idUsuarioDispositivo, device.idDispositivo, {
      latitud: outcome.latitude,
      longitud: outcome.longitude,
      precisionGps: outcome.accuracy,
      fechaHoraDispositivo: dto.deviceTimestamp,
      fueSincronizadaOffline: false,
      clientLocationId: dto.clientLocationId,
      fuente: 'NETWORK',
    });
    if (stored.created) {
      await this.devicesService.touchConnection(device.idDispositivo);
    }
    return {
      ...base,
      status: outcome.kind === 'cached' ? 'cached' : 'located',
      retryAfterSeconds: 60,
      receivedAt: stored.location.fechaHoraServidor,
    };
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_MS);
    const active = await this.prisma.emergencia.findMany({
      where: { estado: 'ACTIVA' },
      select: { idUsuarioDispositivo: true },
    });
    const protectedIds: bigint[] = [];
    for (const emergency of active) {
      const latest = await this.prisma.ubicacion.findFirst({
        where: { idUsuarioDispositivo: emergency.idUsuarioDispositivo },
        orderBy: { fechaHoraServidor: 'desc' },
        select: { idUbicacion: true, fuente: true },
      });
      if (latest?.fuente === 'NETWORK') {
        protectedIds.push(latest.idUbicacion);
      }
    }
    const removed = await this.prisma.ubicacion.deleteMany({
      where: {
        fuente: 'NETWORK',
        fechaHoraServidor: { lt: cutoff },
        ...(protectedIds.length > 0 ? { idUbicacion: { notIn: protectedIds } } : {}),
      },
    });
    if (removed.count > 0) {
      this.logger.log(`[NETWORK] Coordenadas Google depuradas: ${removed.count}`);
    }
    return removed.count;
  }

  private remembered(cacheKey: string): CachedFix | null {
    const found = this.cache.get(cacheKey);
    if (found == null) {
      return null;
    }
    if (found.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }
    return found;
  }

  private async trackingAllowed(device: AuthenticatedDevice, emergencyActive: boolean): Promise<boolean> {
    if (device.dispositivoEstado !== EstadoDispositivo.ASIGNADO) {
      return false;
    }
    return device.ubicacionActiva || emergencyActive;
  }
}

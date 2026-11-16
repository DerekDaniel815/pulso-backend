import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { DevicesService } from '../devices/devices.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DeviceNetworkCellDto, DeviceNetworkCellResponseDto } from '../device-api/dto/device-network-cell.dto.js';
import { LocationAccessService } from './location-access.service.js';
import { LocationsService } from './locations.service.js';
import {
  formatGoogleDiagnostic,
  GoogleGeolocationClient,
  type GoogleGeolocationOutcome,
} from './google-geolocation.client.js';

const CACHE_MS = 10 * 60 * 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_SECONDS = 10;
const TEMPORARY_RETRY_SECONDS = 60;
const CONFIGURATION_RETRY_SECONDS = 900;

function retryAfterFailure(outcome: GoogleGeolocationOutcome): number | null {
  if (outcome.kind === 'quota' || outcome.kind === 'rejected') {
    return CONFIGURATION_RETRY_SECONDS;
  }
  if (outcome.kind === 'unavailable') {
    return 120;
  }
  if (outcome.kind === 'timeout') {
    return TEMPORARY_RETRY_SECONDS;
  }
  if (outcome.kind === 'failed') {
    return outcome.diagnostic != null && outcome.diagnostic.category !== 'temporal'
      ? CONFIGURATION_RETRY_SECONDS
      : TEMPORARY_RETRY_SECONDS;
  }
  return null;
}

interface CachedFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  estimatedAt: string;
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
    const outcome: GoogleGeolocationOutcome | { kind: 'cached'; latitude: number; longitude: number; accuracy: number; estimatedAt: string } =
      cached == null
        ? await this.client.locate({
            mcc: dto.mcc,
            mnc: dto.mnc,
            tac: dto.tac,
            eci: dto.eci,
            rsrp: dto.rsrp,
          }, apiKey)
        : { kind: 'cached', ...cached };

    if (outcome.kind !== 'cached') {
      this.logDiagnostic(outcome);
      const retryAfterSeconds = retryAfterFailure(outcome);
      if (retryAfterSeconds != null) {
        return {
          ...base,
          status: outcome.kind === 'unavailable' ? 'unavailable' : 'retry',
          retryAfterSeconds,
        };
      }
    }

    const estimatedAt = outcome.kind === 'located' ? new Date().toISOString() : outcome.estimatedAt;
    if (outcome.kind === 'located') {
      this.cache.set(cacheKey, {
        latitude: outcome.latitude,
        longitude: outcome.longitude,
        accuracy: outcome.accuracy,
        estimatedAt,
        expiresAt: Date.now() + CACHE_MS,
      });
    }

    const receivedAt = await this.rememberLocation(device, dto, {
      latitude: outcome.latitude,
      longitude: outcome.longitude,
      accuracy: outcome.accuracy,
      estimatedAt,
    });
    return {
      ...base,
      status: outcome.kind === 'cached' ? 'cached' : 'located',
      retryAfterSeconds: RENEW_SECONDS,
      receivedAt,
    };
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_MS);
    const expired = await this.prisma.ubicacion.findMany({
      where: { fuente: 'NETWORK', fechaHoraDispositivo: { lt: cutoff } },
      select: { idUbicacion: true, idUsuarioDispositivo: true },
    });
    if (expired.length === 0) {
      return 0;
    }
    const assignments = [...new Set(expired.map((row) => row.idUsuarioDispositivo))];
    const active = await this.prisma.emergencia.findMany({
      where: { estado: 'ACTIVA', idUsuarioDispositivo: { in: assignments } },
      select: { idEmergencia: true, idUsuarioDispositivo: true },
    });
    for (const emergency of active) {
      const latest = await this.prisma.ubicacion.findFirst({
        where: { idUsuarioDispositivo: emergency.idUsuarioDispositivo },
        orderBy: { fechaHoraServidor: 'desc' },
        select: { idUbicacion: true, fechaHoraServidor: true },
      });
      const removesLatest = expired.some((row) => row.idUbicacion === latest?.idUbicacion);
      if (removesLatest && latest) {
        await this.prisma.emergencia.update({
          where: { idEmergencia: emergency.idEmergencia },
          data: { ubicacionSuprimidaDesde: latest.fechaHoraServidor },
        });
      }
    }
    const removed = await this.prisma.ubicacion.deleteMany({
      where: { idUbicacion: { in: expired.map((row) => row.idUbicacion) }, fuente: 'NETWORK' },
    });
    if (removed.count > 0) {
      this.logger.log(`[NETWORK] Coordenadas Google depuradas: ${removed.count}`);
    }
    return removed.count;
  }

  private async rememberLocation(
    device: AuthenticatedDevice,
    dto: DeviceNetworkCellDto,
    fix: { latitude: number; longitude: number; accuracy: number; estimatedAt: string },
  ): Promise<string> {
    const reportedAt = Date.parse(dto.deviceTimestamp);
    const latest = await this.prisma.ubicacion.findFirst({
      where: { idUsuarioDispositivo: device.idUsuarioDispositivo },
      orderBy: { fechaHoraServidor: 'desc' },
    });
    if (
      latest?.fuente === 'GNSS' &&
      Number.isFinite(reportedAt) &&
      latest.fechaHoraServidor.getTime() >= reportedAt
    ) {
      return latest.fechaHoraServidor.toISOString();
    }
    if (dto.clientLocationId) {
      const sameReport = await this.prisma.ubicacion.findFirst({
        where: { idUsuarioDispositivo: device.idUsuarioDispositivo, clientLocationId: dto.clientLocationId },
      });
      if (sameReport) {
        return sameReport.fechaHoraServidor.toISOString();
      }
    }
    const estimateTime = new Date(fix.estimatedAt).getTime();
    if (
      latest?.fuente === 'NETWORK' &&
      latest.fechaHoraDispositivo.getTime() === estimateTime
    ) {
      const refreshed = await this.prisma.ubicacion.update({
        where: { idUbicacion: latest.idUbicacion },
        data: { fechaHoraServidor: new Date() },
      });
      await this.locationsService.publishLatestForAssignment(device.idUsuarioDispositivo);
      await this.devicesService.touchConnection(device.idDispositivo);
      return refreshed.fechaHoraServidor.toISOString();
    }
    const stored = await this.locationsService.storeDeviceLocation(device.idUsuarioDispositivo, device.idDispositivo, {
      latitud: fix.latitude,
      longitud: fix.longitude,
      precisionGps: fix.accuracy,
      fechaHoraDispositivo: fix.estimatedAt,
      fueSincronizadaOffline: false,
      clientLocationId: dto.clientLocationId,
      fuente: 'NETWORK',
    });
    if (stored.created) {
      await this.devicesService.touchConnection(device.idDispositivo);
    }
    return stored.location.fechaHoraServidor;
  }

  private logDiagnostic(outcome: GoogleGeolocationOutcome): void {
    if (outcome.kind !== 'located' && outcome.diagnostic == null) {
      return;
    }
    if (outcome.diagnostic == null) {
      return;
    }
    this.logger.warn(formatGoogleDiagnostic(outcome.diagnostic));
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

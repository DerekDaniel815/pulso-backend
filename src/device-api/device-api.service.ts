import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { DevicesService } from '../devices/devices.service.js';
import { EmergenciesService } from '../emergencies/emergencies.service.js';
import type { LocationInput } from '../locations/dto/location-input.dto.js';
import { normalizeLocationSource } from '../locations/location-source.js';
import { LocationsService } from '../locations/locations.service.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { UserDevicesService } from '../user-devices/user-devices.service.js';
import type { DeviceEmergencyDto } from './dto/device-emergency.dto.js';
import type {
  DeviceEmergencyResponseDto,
} from './dto/device-emergency.dto.js';
import type { DeviceHeartbeatResponseDto } from './dto/device-heartbeat.dto.js';
import type { DeviceLocationDto } from './dto/device-location.dto.js';
import type { DeviceLocationResponseDto } from './dto/device-location.dto.js';

@Injectable()
export class DeviceApiService {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly emergenciesService: EmergenciesService,
    private readonly devicesService: DevicesService,
    private readonly locationAccessService: LocationAccessService,
    private readonly userDevicesService: UserDevicesService,
  ) {}

  async reportLocation(
    device: AuthenticatedDevice,
    dto: DeviceLocationDto,
  ): Promise<DeviceLocationResponseDto> {
    await this.assertPeriodicTrackingAllowed(device);

    const stored = await this.locationsService.storeDeviceLocation(
      device.idUsuarioDispositivo,
      device.idDispositivo,
      this.toLocationInput(dto),
    );
    const [emergencyActive] = await Promise.all([
      this.locationAccessService.hasActiveEmergency(device.idUsuarioDispositivo),
      stored.created
        ? this.devicesService.touchConnection(device.idDispositivo)
        : Promise.resolve(null),
    ]);

    return {
      ok: true,
      receivedAt: stored.location.fechaHoraServidor,
      trackingEnabled: device.ubicacionActiva,
      emergencyActive,
    };
  }

  async reportEmergency(
    device: AuthenticatedDevice,
    dto: DeviceEmergencyDto,
    idSimulationSession?: number,
  ): Promise<DeviceEmergencyResponseDto> {
    const emergency = await this.emergenciesService.createForDevice(
      device.idUsuario,
      device.idUsuarioDispositivo,
      device.idDispositivo,
      dto.type,
      dto.location
        ? {
            latitud: dto.location.latitude,
            longitud: dto.location.longitude,
            precisionGps: dto.location.accuracy,
            fechaHoraDispositivo: dto.deviceTimestamp,
            fueSincronizadaOffline: false,
          }
        : undefined,
      idSimulationSession,
    );

    return {
      codigoPublico: emergency.codigoPublico,
      estado: emergency.estado,
      receivedAt: emergency.fechaInicio,
      trackingEnabled: device.ubicacionActiva,
      emergencyActive: true,
    };
  }

  async setTracking(device: AuthenticatedDevice, enabled: boolean) {
    const updated = await this.userDevicesService.update(device.idUsuario, device.idUsuarioDispositivo, {
      ubicacionActiva: enabled,
    });
    return this.modeSnapshot(device.idUsuarioDispositivo, updated.ubicacionActiva);
  }

  async finishEmergency(device: AuthenticatedDevice) {
    await this.emergenciesService.finishForDevice(device.idUsuarioDispositivo);
    return this.modeSnapshot(device.idUsuarioDispositivo, device.ubicacionActiva);
  }

  private async modeSnapshot(idUsuarioDispositivo: number, trackingEnabled: boolean) {
    const emergencyActive = await this.locationAccessService.hasActiveEmergency(idUsuarioDispositivo);
    return { ok: true, trackingEnabled, emergencyActive };
  }

  async heartbeat(device: AuthenticatedDevice): Promise<DeviceHeartbeatResponseDto> {
    const [ultimaConexion, emergencyActive] = await Promise.all([
      this.devicesService.touchConnection(device.idDispositivo),
      this.locationAccessService.hasActiveEmergency(device.idUsuarioDispositivo),
    ]);

    return {
      ok: true,
      ultimaConexion: ultimaConexion.toISOString(),
      trackingEnabled: device.ubicacionActiva,
      emergencyActive,
    };
  }

  private async assertPeriodicTrackingAllowed(device: AuthenticatedDevice): Promise<void> {
    if (device.dispositivoEstado === EstadoDispositivo.MANTENIMIENTO) {
      throw new ForbiddenException(
        'El dispositivo está en mantenimiento; no se acepta seguimiento periódico',
      );
    }

    if (device.dispositivoEstado !== EstadoDispositivo.ASIGNADO) {
      throw new ForbiddenException(
        'El dispositivo debe estar en estado ASIGNADO para registrar ubicaciones periódicas',
      );
    }

    if (!device.ubicacionActiva) {
      const emergencyActive = await this.locationAccessService.hasActiveEmergency(
        device.idUsuarioDispositivo,
      );
      if (!emergencyActive) {
        throw new ForbiddenException({
          message: 'Seguimiento desactivado',
          trackingEnabled: false,
          emergencyActive,
        });
      }
    }
  }

  private toLocationInput(dto: DeviceLocationDto): LocationInput {
    const fuente = normalizeLocationSource(dto.locationSource);
    if (fuente === 'CELL' && (dto.accuracy == null || dto.accuracy <= 0)) {
      throw new BadRequestException('Una ubicación celular requiere precisión positiva');
    }
    return {
      latitud: dto.latitude,
      longitud: dto.longitude,
      altitud: dto.altitude,
      precisionGps: dto.accuracy,
      velocidad: dto.speed,
      fechaHoraDispositivo: dto.deviceTimestamp,
      fueSincronizadaOffline: dto.offlineSync ?? false,
      clientLocationId: dto.clientLocationId,
      fuente,
    };
  }
}

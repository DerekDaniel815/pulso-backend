import { ForbiddenException, Injectable } from '@nestjs/common';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { DevicesService } from '../devices/devices.service.js';
import { EmergenciesService } from '../emergencies/emergencies.service.js';
import type { LocationInput } from '../locations/dto/location-input.dto.js';
import { LocationsService } from '../locations/locations.service.js';
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
  ) {}

  async reportLocation(
    device: AuthenticatedDevice,
    dto: DeviceLocationDto,
  ): Promise<DeviceLocationResponseDto> {
    this.assertPeriodicTrackingAllowed(device);

    const saved = await this.locationsService.createForAssignment(
      device.idUsuarioDispositivo,
      device.idDispositivo,
      this.toLocationInput(dto),
    );

    return {
      ok: true,
      receivedAt: saved.fechaHoraServidor,
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
    };
  }

  async heartbeat(device: AuthenticatedDevice): Promise<DeviceHeartbeatResponseDto> {
    const ultimaConexion = await this.devicesService.touchConnection(device.idDispositivo);

    return {
      ok: true,
      ultimaConexion: ultimaConexion.toISOString(),
    };
  }

  private assertPeriodicTrackingAllowed(device: AuthenticatedDevice): void {
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
      throw new ForbiddenException(
        'El seguimiento de ubicación está desactivado (ubicacion_activa = false)',
      );
    }
  }

  private toLocationInput(dto: DeviceLocationDto): LocationInput {
    return {
      latitud: dto.latitude,
      longitud: dto.longitude,
      altitud: dto.altitude,
      precisionGps: dto.accuracy,
      velocidad: dto.speed,
      fechaHoraDispositivo: dto.deviceTimestamp,
      fueSincronizadaOffline: dto.offlineSync ?? false,
    };
  }
}

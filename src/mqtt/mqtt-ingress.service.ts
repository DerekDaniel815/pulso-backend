import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { DeviceApiService } from '../device-api/device-api.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  LocationFrameError,
  decodeLocationFrame,
  deviceTopics,
  encodeControlFrame,
} from './location-frame.js';
import { MqttPublisher } from './mqtt-publisher.service.js';

export type MqttUplinkResult = {
  ok: true;
  accepted: boolean;
  duplicate: boolean;
  presence: 'online' | 'offline' | null;
  trackingEnabled: boolean;
  emergencyActive: boolean;
};

@Injectable()
export class MqttIngressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceApi: DeviceApiService,
    private readonly publisher: MqttPublisher,
  ) {}

  async ingest(username: string, topic: string, payload: Buffer): Promise<MqttUplinkResult> {
    let topics: ReturnType<typeof deviceTopics>;
    try {
      topics = deviceTopics(username);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Topic rechazado');
    }
    if (topic !== topics.location && topic !== topics.status) {
      throw new ForbiddenException('El topic no pertenece a este dispositivo');
    }

    const device = await this.findDevice(username);
    if (topic === topics.status) {
      return this.ingestPresence(device, payload);
    }
    return this.ingestLocation(device, topics.control, payload);
  }

  private async findDevice(code: string): Promise<AuthenticatedDevice> {
    const device = await this.prisma.dispositivo.findFirst({
      where: { codigoDispositivo: code },
      select: {
        idDispositivo: true,
        codigoDispositivo: true,
        estado: true,
        asignaciones: {
          where: { estado: true },
          take: 1,
          select: {
            idUsuarioDispositivo: true,
            idUsuario: true,
            ubicacionActiva: true,
          },
        },
      },
    });
    if (!device || device.estado === EstadoDispositivo.BAJA) {
      throw new NotFoundException('Dispositivo no disponible');
    }
    const assignment = device.asignaciones[0];
    if (!assignment) {
      throw new NotFoundException('El dispositivo no tiene una asignación activa');
    }
    return {
      idDispositivo: device.idDispositivo,
      codigoDispositivo: device.codigoDispositivo,
      idUsuarioDispositivo: assignment.idUsuarioDispositivo,
      idUsuario: assignment.idUsuario,
      dispositivoEstado: device.estado,
      ubicacionActiva: assignment.ubicacionActiva,
    };
  }

  private async ingestPresence(device: AuthenticatedDevice, payload: Buffer): Promise<MqttUplinkResult> {
    if (payload.length !== 1 || (payload[0] !== 0 && payload[0] !== 1)) {
      throw new BadRequestException('Presencia MQTT inválida');
    }
    const online = payload[0] === 1;
    if (online) {
      await this.prisma.dispositivo.update({
        where: { idDispositivo: device.idDispositivo },
        data: { ultimaConexion: new Date() },
        select: { idDispositivo: true },
      });
    }
    const emergencyActive = await this.hasActiveEmergency(device.idUsuarioDispositivo);
    return {
      ok: true,
      accepted: true,
      duplicate: false,
      presence: online ? 'online' : 'offline',
      trackingEnabled: device.ubicacionActiva,
      emergencyActive,
    };
  }

  private async hasActiveEmergency(idUsuarioDispositivo: number): Promise<boolean> {
    const active = await this.prisma.emergencia.count({
      where: { idUsuarioDispositivo, estado: 'ACTIVA' },
    });
    return active > 0;
  }

  private async ingestLocation(
    device: AuthenticatedDevice,
    controlTopic: string,
    payload: Buffer,
  ): Promise<MqttUplinkResult> {
    let frame: ReturnType<typeof decodeLocationFrame>;
    try {
      frame = decodeLocationFrame(payload);
    } catch (error) {
      throw new BadRequestException(error instanceof LocationFrameError ? error.message : 'Trama rechazada');
    }

    const claimed = await this.claim(device.idDispositivo, frame.sequence);
    if (!claimed) {
      const result = this.result(device.ubicacionActiva, false, false, true);
      await this.publishControl(device, controlTopic, result.trackingEnabled, result.emergencyActive);
      return result;
    }

    try {
      const saved = await this.deviceApi.reportLocation(device, {
        latitude: frame.latitude,
        longitude: frame.longitude,
        altitude: frame.altitude,
        speed: frame.speed,
        deviceTimestamp: frame.deviceTimestamp,
        offlineSync: frame.offlineSync,
      });
      const result = this.result(saved.trackingEnabled, saved.emergencyActive, true, false);
      await this.publishControl(device, controlTopic, result.trackingEnabled, result.emergencyActive);
      return result;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const response = error.getResponse();
        const trackingEnabled = this.flag(response, 'trackingEnabled', false);
        const emergencyActive = this.flag(response, 'emergencyActive', false);
        const result = this.result(trackingEnabled, emergencyActive, false, false);
        await this.publishControl(device, controlTopic, trackingEnabled, emergencyActive);
        return result;
      }
      await this.release(device.idDispositivo, frame.sequence);
      throw error;
    }
  }

  private result(
    trackingEnabled: boolean,
    emergencyActive: boolean,
    accepted: boolean,
    duplicate: boolean,
  ): MqttUplinkResult {
    return {
      ok: true,
      accepted,
      duplicate,
      presence: null,
      trackingEnabled,
      emergencyActive,
    };
  }

  private flag(response: unknown, key: string, fallback: boolean): boolean {
    if (typeof response === 'object' && response != null && key in response) {
      return Boolean((response as Record<string, unknown>)[key]);
    }
    return fallback;
  }

  private async claim(deviceId: number, sequence: number): Promise<boolean> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO mqtt_secuencia (id_dispositivo, secuencia)
        VALUES (${deviceId}, ${sequence})
      `;
      return true;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return false;
      }
      throw new ServiceUnavailableException('El registro de idempotencia MQTT no está disponible');
    }
  }

  private async release(deviceId: number, sequence: number): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM mqtt_secuencia
      WHERE id_dispositivo = ${deviceId} AND secuencia = ${sequence}
    `;
  }

  private async publishControl(
    device: AuthenticatedDevice,
    topic: string,
    trackingEnabled: boolean,
    emergencyActive: boolean,
  ): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ mqtt_control_revision: number }>>`
      UPDATE usuario_dispositivo
      SET mqtt_control_revision = mqtt_control_revision + 1
      WHERE id_usuario_dispositivo = ${device.idUsuarioDispositivo}
      RETURNING mqtt_control_revision
    `;
    const revision = rows[0]?.mqtt_control_revision;
    if (revision == null || revision <= 0) {
      return;
    }
    await this.publisher.publish(topic, encodeControlFrame({ trackingEnabled, emergencyActive, revision }));
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error != null && 'code' in error && error.code === '23505';
  }
}

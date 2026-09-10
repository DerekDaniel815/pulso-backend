import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { DeviceApiService } from '../device-api/device-api.service.js';
import type { DeviceEmergencyDto } from '../device-api/dto/device-emergency.dto.js';
import type { DeviceEmergencyResponseDto } from '../device-api/dto/device-emergency.dto.js';
import type { DeviceLocationDto } from '../device-api/dto/device-location.dto.js';
import type { DeviceLocationResponseDto } from '../device-api/dto/device-location.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SimulationHeartbeatResponseDto } from './dto/simulation-session-response.dto.js';
import type { SimulationSessionResponseDto } from './dto/simulation-session-response.dto.js';
import { SimulationSessionService } from './simulation-session.service.js';

@Injectable()
export class SimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceApiService: DeviceApiService,
    private readonly simulationSessionService: SimulationSessionService,
  ) {}

  startSession(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto> {
    return this.simulationSessionService.ensureSession(idUsuario, idUsuarioDispositivo);
  }

  getSession(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto | null> {
    return this.simulationSessionService.getActiveSession(idUsuario, idUsuarioDispositivo);
  }

  endSession(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto | null> {
    return this.simulationSessionService.endSession(idUsuario, idUsuarioDispositivo);
  }

  async heartbeat(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<SimulationHeartbeatResponseDto> {
    const session = await this.simulationSessionService.ensureSession(
      idUsuario,
      idUsuarioDispositivo,
    );

    return {
      ok: true,
      expiresAt: session.expiraEn,
    };
  }

  setTracking(
    idUsuario: number,
    idUsuarioDispositivo: number,
    ubicacionActiva: boolean,
  ): Promise<SimulationSessionResponseDto> {
    return this.simulationSessionService.setTracking(
      idUsuario,
      idUsuarioDispositivo,
      ubicacionActiva,
    );
  }

  async reportLocation(
    idUsuario: number,
    idUsuarioDispositivo: number,
    dto: DeviceLocationDto,
  ): Promise<DeviceLocationResponseDto> {
    await this.simulationSessionService.ensureSession(idUsuario, idUsuarioDispositivo);
    const device = await this.resolveDeviceContext(idUsuario, idUsuarioDispositivo);
    return this.deviceApiService.reportLocation(device, dto);
  }

  async reportEmergency(
    idUsuario: number,
    idUsuarioDispositivo: number,
    dto: DeviceEmergencyDto,
  ): Promise<DeviceEmergencyResponseDto> {
    const session = await this.simulationSessionService.ensureSession(
      idUsuario,
      idUsuarioDispositivo,
    );
    const device = await this.resolveDeviceContext(idUsuario, idUsuarioDispositivo);
    return this.deviceApiService.reportEmergency(
      device,
      dto,
      session.idSimulationSession,
    );
  }

  private async resolveDeviceContext(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<AuthenticatedDevice> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
      include: { dispositivo: true },
    });

    if (!assignment) {
      throw new NotFoundException('Asignación no encontrada');
    }

    if (assignment.idUsuario !== idUsuario) {
      throw new ForbiddenException('No puedes simular la asignación de otro usuario');
    }

    if (!assignment.estado) {
      throw new NotFoundException('Asignación no encontrada');
    }

    if (assignment.dispositivo.estado === EstadoDispositivo.BAJA) {
      throw new ForbiddenException('El dispositivo está dado de baja');
    }

    return {
      idDispositivo: assignment.dispositivo.idDispositivo,
      codigoDispositivo: assignment.dispositivo.codigoDispositivo,
      idUsuarioDispositivo: assignment.idUsuarioDispositivo,
      idUsuario: assignment.idUsuario,
      dispositivoEstado: assignment.dispositivo.estado,
      ubicacionActiva: assignment.ubicacionActiva,
    };
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { hashDeviceToken, isDeviceTokenFormat } from '../common/utils/device-token.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DeviceAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(token: string): Promise<AuthenticatedDevice> {
    if (!isDeviceTokenFormat(token)) {
      throw new UnauthorizedException('Token de dispositivo inválido');
    }

    const device = await this.prisma.dispositivo.findFirst({
      where: { tokenHash: hashDeviceToken(token) },
      include: {
        asignaciones: {
          where: { estado: true },
          take: 1,
        },
      },
    });

    if (!device) {
      throw new UnauthorizedException('Token de dispositivo inválido');
    }

    if (device.estado === EstadoDispositivo.BAJA) {
      throw new ForbiddenException('El dispositivo está dado de baja');
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
}

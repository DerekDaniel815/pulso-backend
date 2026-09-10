import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlcanceNotificacion,
  EstadoDispositivo,
  TipoNotificacion,
  TipoReferencia,
  VisibilidadPreferida,
} from '../common/enums.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDeviceDto } from './dto/create-user-device.dto.js';
import type { UpdateUserDeviceDto } from './dto/update-user-device.dto.js';
import { toUserDeviceResponse, type UserDeviceResponseDto } from './dto/user-device-response.dto.js';

@Injectable()
export class UserDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly locationAccessService: LocationAccessService,
    private readonly locationRealtimeNotifier: LocationRealtimeNotifier,
  ) {}

  async assign(idUsuario: number, dto: CreateUserDeviceDto): Promise<UserDeviceResponseDto> {
    const device = await this.prisma.dispositivo.findUnique({
      where: { codigoDispositivo: dto.codigoDispositivo },
    });

    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado con ese código');
    }

    if (device.estado !== EstadoDispositivo.DISPONIBLE) {
      throw new BadRequestException(
        'El dispositivo no está disponible para vincular. Debe estar en estado DISPONIBLE.',
      );
    }

    const active = await this.prisma.usuarioDispositivo.findFirst({
      where: { idDispositivo: device.idDispositivo, estado: true },
    });

    if (active) {
      throw new ConflictException('El dispositivo ya tiene una asignación activa');
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.usuarioDispositivo.create({
        data: {
          idUsuario,
          idDispositivo: device.idDispositivo,
          alias: dto.alias,
          visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
          ubicacionActiva: false,
        },
        include: { dispositivo: true },
      });

      await tx.dispositivo.update({
        where: { idDispositivo: device.idDispositivo },
        data: { estado: EstadoDispositivo.ASIGNADO },
      });

      await this.notificationsService.createForUsers(
        {
          tipo: TipoNotificacion.DISPOSITIVO_VINCULADO,
          alcance: AlcanceNotificacion.USUARIO,
          titulo: 'Dispositivo vinculado',
          mensaje: `Se vinculó el dispositivo ${device.codigoDispositivo}.`,
          tipoReferencia: TipoReferencia.DISPOSITIVO,
          idReferencia: BigInt(created.idUsuarioDispositivo),
          userIds: [idUsuario],
        },
        tx,
      );

      return created;
    });

    return toUserDeviceResponse(assignment);
  }

  async findMine(idUsuario: number): Promise<UserDeviceResponseDto[]> {
    const rows = await this.prisma.usuarioDispositivo.findMany({
      where: { idUsuario },
      include: { dispositivo: true },
      orderBy: { fechaAsignacion: 'desc' },
    });

    return rows.map(toUserDeviceResponse);
  }

  async findOne(idUsuario: number, idUsuarioDispositivo: number): Promise<UserDeviceResponseDto> {
    const row = await this.getOwnedAssignment(idUsuario, idUsuarioDispositivo);
    return toUserDeviceResponse(row);
  }

  async update(
    idUsuario: number,
    idUsuarioDispositivo: number,
    dto: UpdateUserDeviceDto,
  ): Promise<UserDeviceResponseDto> {
    const current = await this.getOwnedAssignment(idUsuario, idUsuarioDispositivo);

    if (!current.estado) {
      throw new BadRequestException('No se puede actualizar una asignación desvinculada');
    }

    const previousAudience = await this.locationAccessService.getPublicAudience(current);

    const updated = await this.prisma.usuarioDispositivo.update({
      where: { idUsuarioDispositivo },
      data: {
        alias: dto.alias,
        visibilidadPreferida: dto.visibilidadPreferida,
        ubicacionActiva: dto.ubicacionActiva,
      },
      include: { dispositivo: true },
    });

    const nextAudience = await this.locationAccessService.getPublicAudience(updated);
    this.locationRealtimeNotifier.notifyIfPublicAudienceLost(previousAudience, nextAudience);

    return toUserDeviceResponse(updated);
  }

  async unlink(idUsuario: number, idUsuarioDispositivo: number): Promise<UserDeviceResponseDto> {
    const current = await this.getOwnedAssignment(idUsuario, idUsuarioDispositivo);

    if (!current.estado) {
      throw new BadRequestException('La asignación ya está desvinculada');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.usuarioDispositivo.update({
        where: { idUsuarioDispositivo },
        data: {
          estado: false,
          fechaDesvinculacion: new Date(),
          ubicacionActiva: false,
        },
        include: { dispositivo: true },
      });

      await tx.dispositivo.update({
        where: { idDispositivo: current.idDispositivo },
        data: { estado: EstadoDispositivo.DISPONIBLE },
      });

      return assignment;
    });

    return toUserDeviceResponse(updated);
  }

  private async getOwnedAssignment(idUsuario: number, idUsuarioDispositivo: number) {
    const row = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
      include: { dispositivo: true },
    });

    if (!row) {
      throw new NotFoundException('Asignación no encontrada');
    }

    if (row.idUsuario !== idUsuario) {
      throw new ForbiddenException('No puedes consultar esta asignación');
    }

    return row;
  }
}

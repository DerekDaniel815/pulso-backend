import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ActivadaDesde,
  AlcanceNotificacion,
  EstadoContacto,
  EstadoEmergencia,
  TipoNotificacion,
  TipoReferencia,
} from '../common/enums.js';
import type { LocationInput } from '../locations/dto/location-input.dto.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateEmergencyDto } from './dto/create-emergency.dto.js';
import {
  toEmergencyResponse,
  toPublicEmergencyResponse,
  type EmergencyResponseDto,
  type PublicEmergencyResponseDto,
} from './dto/emergency-response.dto.js';

@Injectable()
export class EmergenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly locationAccessService: LocationAccessService,
    private readonly locationsService: LocationsService,
  ) {}

  async create(idUsuario: number, dto: CreateEmergencyDto): Promise<EmergencyResponseDto> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo: dto.idUsuarioDispositivo },
    });

    if (!assignment) {
      throw new NotFoundException('Asignación no encontrada');
    }

    if (assignment.idUsuario !== idUsuario) {
      throw new ForbiddenException('Solo puedes activar una emergencia en tu propia asignación');
    }

    if (!assignment.estado) {
      throw new BadRequestException('La asignación no está activa');
    }

    const alreadyActive = await this.prisma.emergencia.findFirst({
      where: {
        idUsuarioDispositivo: dto.idUsuarioDispositivo,
        estado: EstadoEmergencia.ACTIVA,
      },
    });

    if (alreadyActive) {
      throw new ConflictException('Ya existe una emergencia activa para esta asignación');
    }

    const recipientIds = await this.findEmergencyRecipients(idUsuario);
    const emergency = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emergencia.create({
        data: {
          codigoPublico: this.generatePublicCode(),
          idUsuarioDispositivo: dto.idUsuarioDispositivo,
          tipo: dto.tipo,
          activadaDesde: dto.activadaDesde,
          descripcion: dto.descripcion,
          estado: EstadoEmergencia.ACTIVA,
        },
      });

      await this.notificationsService.createForUsers(
        {
          tipo: TipoNotificacion.EMERGENCIA,
          alcance: AlcanceNotificacion.USUARIO,
          titulo: 'Emergencia activa',
          mensaje: 'Un contacto o miembro de tu grupo activó una emergencia.',
          tipoReferencia: TipoReferencia.EMERGENCIA,
          idReferencia: created.idEmergencia,
          userIds: recipientIds,
        },
        tx,
      );

      return created;
    });

    const location = await this.findLatestLocation(emergency.idUsuarioDispositivo);
    return toEmergencyResponse(emergency, location);
  }

  async createForDevice(
    idUsuario: number,
    idUsuarioDispositivo: number,
    idDispositivo: number,
    tipo: string,
    location?: LocationInput,
    idSimulationSession?: number,
  ): Promise<EmergencyResponseDto> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
    });

    if (!assignment || !assignment.estado) {
      throw new BadRequestException('La asignación no está activa');
    }

    const alreadyActive = await this.prisma.emergencia.findFirst({
      where: {
        idUsuarioDispositivo,
        estado: EstadoEmergencia.ACTIVA,
      },
    });

    if (alreadyActive) {
      throw new ConflictException('Ya existe una emergencia activa para esta asignación');
    }

    const recipientIds = await this.findEmergencyRecipients(idUsuario);
    const emergency = await this.prisma.$transaction(async (tx) => {
      if (location) {
        await this.locationsService.createForAssignment(
          idUsuarioDispositivo,
          idDispositivo,
          location,
          tx,
        );
      } else {
        await tx.dispositivo.update({
          where: { idDispositivo },
          data: { ultimaConexion: new Date() },
        });
      }

      const created = await tx.emergencia.create({
        data: {
          codigoPublico: this.generatePublicCode(),
          idUsuarioDispositivo,
          idSimulationSession: idSimulationSession ?? null,
          tipo,
          activadaDesde: ActivadaDesde.DISPOSITIVO,
          estado: EstadoEmergencia.ACTIVA,
        },
      });

      await this.notificationsService.createForUsers(
        {
          tipo: TipoNotificacion.EMERGENCIA,
          alcance: AlcanceNotificacion.USUARIO,
          titulo: 'Emergencia activa',
          mensaje: 'Un contacto o miembro de tu grupo activó una emergencia.',
          tipoReferencia: TipoReferencia.EMERGENCIA,
          idReferencia: created.idEmergencia,
          userIds: recipientIds,
        },
        tx,
      );

      return created;
    });

    const latestLocation = await this.findLatestLocation(emergency.idUsuarioDispositivo);
    return toEmergencyResponse(emergency, latestLocation);
  }

  async finish(idUsuario: number, idEmergencia: bigint): Promise<EmergencyResponseDto> {
    const emergency = await this.prisma.emergencia.findUnique({
      where: { idEmergencia },
      include: { usuarioDispositivo: true },
    });

    if (!emergency) {
      throw new NotFoundException('Emergencia no encontrada');
    }

    if (emergency.usuarioDispositivo.idUsuario !== idUsuario) {
      throw new ForbiddenException('Solo el propietario puede finalizar la emergencia');
    }

    if (emergency.estado === EstadoEmergencia.FINALIZADA) {
      throw new BadRequestException('La emergencia ya está finalizada');
    }

    const updated = await this.prisma.emergencia.update({
      where: { idEmergencia },
      data: {
        estado: EstadoEmergencia.FINALIZADA,
        fechaFin: new Date(),
      },
    });

    const location = await this.findLatestLocation(updated.idUsuarioDispositivo);
    return toEmergencyResponse(updated, location);
  }

  async findActiveForUser(idUsuario: number): Promise<EmergencyResponseDto[]> {
    const emergencies = await this.prisma.emergencia.findMany({
      where: { estado: EstadoEmergencia.ACTIVA },
      include: { usuarioDispositivo: true },
      orderBy: { fechaInicio: 'desc' },
    });

    const visible: EmergencyResponseDto[] = [];

    for (const emergency of emergencies) {
      const allowed = await this.locationAccessService.canViewEmergencyDetails(
        idUsuario,
        emergency.usuarioDispositivo.idUsuario,
      );

      if (!allowed) {
        continue;
      }

      const location = await this.findLatestLocation(emergency.idUsuarioDispositivo);
      visible.push(toEmergencyResponse(emergency, location));
    }

    return visible;
  }

  async findPublic(): Promise<PublicEmergencyResponseDto[]> {
    const emergencies = await this.prisma.emergencia.findMany({
      where: { estado: EstadoEmergencia.ACTIVA },
      orderBy: { fechaInicio: 'desc' },
    });

    return Promise.all(
      emergencies.map(async (emergency) => {
        const location = await this.findLatestLocation(emergency.idUsuarioDispositivo);
        return toPublicEmergencyResponse(emergency, location);
      }),
    );
  }

  async findPublicByCode(codigoPublico: string): Promise<PublicEmergencyResponseDto> {
    const emergency = await this.prisma.emergencia.findUnique({
      where: { codigoPublico },
    });

    if (!emergency) {
      throw new NotFoundException('Emergencia no encontrada');
    }

    const location = await this.findLatestLocation(emergency.idUsuarioDispositivo);
    return toPublicEmergencyResponse(emergency, location);
  }

  private generatePublicCode() {
    return `EME-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private async findLatestLocation(idUsuarioDispositivo: number) {
    return this.prisma.ubicacion.findFirst({
      where: { idUsuarioDispositivo },
      orderBy: { fechaHoraDispositivo: 'desc' },
    });
  }

  private async findEmergencyRecipients(idUsuario: number): Promise<number[]> {
    const contacts = await this.prisma.usuarioContacto.findMany({
      where: {
        estado: EstadoContacto.ACEPTADO,
        OR: [{ idUsuario1: idUsuario }, { idUsuario2: idUsuario }],
      },
    });

    const contactIds = contacts.map((contact) =>
      contact.idUsuario1 === idUsuario ? contact.idUsuario2 : contact.idUsuario1,
    );

    const memberships = await this.prisma.grupoUsuario.findMany({
      where: {
        idUsuario,
        estado: true,
        grupo: { estado: true },
      },
      select: { idGrupo: true },
    });

    const groupMembers = memberships.length
      ? await this.prisma.grupoUsuario.findMany({
          where: {
            estado: true,
            idGrupo: { in: memberships.map((row) => row.idGrupo) },
            idUsuario: { not: idUsuario },
          },
          select: { idUsuario: true },
        })
      : [];

    return [...new Set([...contactIds, ...groupMembers.map((row) => row.idUsuario)])];
  }
}

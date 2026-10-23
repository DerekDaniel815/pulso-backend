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
  FinalizadaDesde,
  MotivoFinalizacionEmergencia,
  TipoNotificacion,
  TipoReferencia,
} from '../common/enums.js';
import type { LocationInput } from '../locations/dto/location-input.dto.js';
import { toLocationResponse } from '../locations/dto/location-response.dto.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateEmergencyDto } from './dto/create-emergency.dto.js';
import { EmergencyExpirationService } from './emergency-expiration.service.js';
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
    private readonly locationRealtimeNotifier: LocationRealtimeNotifier,
    private readonly emergencyExpiration: EmergencyExpirationService,
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
      }).catch((error: unknown) => {
        if (isActiveEmergencyConflict(error)) {
          throw new ConflictException('Ya existe una emergencia activa para esta asignación');
        }
        throw error;
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
    await this.publishEmergencyRealtime(emergency, location);
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
      }).catch((error: unknown) => {
        if (isActiveEmergencyConflict(error)) {
          throw new ConflictException('Ya existe una emergencia activa para esta asignación');
        }
        throw error;
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
    await this.publishEmergencyRealtime(emergency, latestLocation);
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
      const location = await this.findLatestLocation(emergency.idUsuarioDispositivo);
      return toEmergencyResponse(emergency, location);
    }

    const finished = await this.emergencyExpiration.finalizeIfActive(idEmergencia, {
      motivoFinalizacion: MotivoFinalizacionEmergencia.MANUAL_APP,
      finalizadaDesde: FinalizadaDesde.APP,
    });

    if (finished) {
      return finished;
    }

    const current = await this.prisma.emergencia.findUnique({
      where: { idEmergencia },
    });

    if (!current || current.estado !== EstadoEmergencia.FINALIZADA) {
      throw new BadRequestException('La emergencia no se pudo finalizar');
    }

    const location = await this.findLatestLocation(current.idUsuarioDispositivo);
    return toEmergencyResponse(current, location);
  }

  async findActiveForUser(idUsuario: number): Promise<EmergencyResponseDto[]> {
    await this.emergencyExpiration.sweepOverdue();
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
    await this.emergencyExpiration.sweepOverdue();
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
    await this.emergencyExpiration.sweepOverdue();
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

  private async publishEmergencyRealtime(
    emergency: { codigoPublico: string; estado: string; idUsuarioDispositivo: number },
    location: Awaited<ReturnType<EmergenciesService['findLatestLocation']>>,
  ): Promise<void> {
    const annotated = location ? toLocationResponse(location) : null;
    this.locationRealtimeNotifier.notifyEmergencyPublicUpdated({
      codigoPublico: emergency.codigoPublico,
      estado: emergency.estado,
      ubicacion: annotated
        ? {
            latitud: annotated.latitud,
            longitud: annotated.longitud,
            altitud: annotated.altitud,
            fechaHoraDispositivo: annotated.fechaHoraDispositivo,
            fechaHoraServidor: annotated.fechaHoraServidor,
            offlineSync: annotated.fueSincronizadaOffline,
            isLive: annotated.isLive,
            liveExpiresAt: annotated.liveExpiresAt,
          }
        : null,
      fechaUltimaUbicacion: location ? location.fechaHoraDispositivo.toISOString() : null,
    });

    await this.locationsService.publishLatestForAssignment(emergency.idUsuarioDispositivo);
  }

  private async findLatestLocation(idUsuarioDispositivo: number) {
    return this.prisma.ubicacion.findFirst({
      where: { idUsuarioDispositivo },
      orderBy: { fechaHoraServidor: 'desc' },
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

function isActiveEmergencyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return (error as { code?: string }).code === 'P2002';
}

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { LocationRemovalReason, VisibilidadPreferida } from '../common/enums.js';
import {
  EMERGENCY_SWEEP,
  type EmergencySweep,
} from '../emergencies/emergency-sweep.token.js';
import type { Prisma, Ubicacion } from '../generated/prisma/client.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertDeviceTimestampNotInFuture, liveCutoff } from './location-freshness.js';
import type { CreateLocationDto } from './dto/create-location.dto.js';
import type { LocationInput } from './dto/location-input.dto.js';
import type { LocationHistoryQueryDto } from './dto/location-history-query.dto.js';
import { toLocationResponse, type LocationResponseDto } from './dto/location-response.dto.js';
import type {
  PublicLocationMarkerDto,
  VisibleLocationResponseDto,
} from './dto/visible-location.dto.js';
import { LocationAccessService } from './location-access.service.js';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationAccessService: LocationAccessService,
    private readonly locationRealtimeNotifier: LocationRealtimeNotifier,
    @Optional()
    @Inject(EMERGENCY_SWEEP)
    private readonly emergencyExpiration?: EmergencySweep,
  ) {}

  async create(idUsuario: number, dto: CreateLocationDto): Promise<LocationResponseDto> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo: dto.idUsuarioDispositivo },
    });

    if (!assignment) {
      throw new NotFoundException('Asignación no encontrada');
    }

    if (assignment.idUsuario !== idUsuario) {
      throw new ForbiddenException('Solo el propietario puede reportar ubicación de esta asignación');
    }

    if (!assignment.estado) {
      throw new BadRequestException('La asignación no está activa');
    }

    return this.createForAssignment(assignment.idUsuarioDispositivo, assignment.idDispositivo, {
      latitud: dto.latitud,
      longitud: dto.longitud,
      altitud: dto.altitud,
      precisionGps: dto.precisionGps,
      velocidad: dto.velocidad,
      fechaHoraDispositivo: dto.fechaHoraDispositivo,
      fueSincronizadaOffline: dto.fueSincronizadaOffline,
    });
  }

  async createForAssignment(
    idUsuarioDispositivo: number,
    idDispositivo: number,
    input: LocationInput,
    tx?: Prisma.TransactionClient,
  ): Promise<LocationResponseDto> {
    assertDeviceTimestampNotInFuture(input.fechaHoraDispositivo);

    if (!tx) {
      const assignment = await this.prisma.usuarioDispositivo.findUnique({
        where: { idUsuarioDispositivo },
        select: { ubicacionActiva: true },
      });
      if (assignment?.ubicacionActiva === false) {
        throw new ForbiddenException('El seguimiento de ubicación está desactivado');
      }
    }

    if (tx) {
      // TODO(fase-2): EmergenciesService.createForDevice llama este método dentro de
      // una transacción (SOS). No emitir location.updated aquí para evitar publicar
      // antes del commit. Tras el commit de la emergencia, emitir el evento.
      const location = await this.saveLocation(tx, idUsuarioDispositivo, idDispositivo, input);
      return toLocationResponse(location);
    }

    const created = await this.prisma.$transaction(async (innerTx) =>
      this.saveLocation(innerTx, idUsuarioDispositivo, idDispositivo, input),
    );

    const location = toLocationResponse(created);
    await this.emitLocationUpdated(idUsuarioDispositivo, location);
    return location;
  }

  async publishLatestForAssignment(idUsuarioDispositivo: number): Promise<void> {
    const location = await this.findLastKnownRow(idUsuarioDispositivo);

    if (!location) {
      return;
    }

    await this.emitLocationUpdated(idUsuarioDispositivo, toLocationResponse(location));
  }

  /**
   * Tras cerrar un SOS: republica solo si queda una ubicación normal en vivo.
   * Si ya venció, retira el marcador una vez y no lo vuelve a pintar.
   */
  async publishAfterEmergencyEnded(idUsuarioDispositivo: number): Promise<void> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
      include: { dispositivo: true },
    });

    const live = assignment?.ubicacionActiva
      ? await this.findLiveRow(idUsuarioDispositivo, assignment.ubicacionVisibleDesde)
      : null;

    if (live) {
      await this.emitLocationUpdated(idUsuarioDispositivo, toLocationResponse(live));
      return;
    }

    const viewers = await this.locationAccessService.getAuthorizedPrivateViewerUserIds(
      idUsuarioDispositivo,
    );
    for (const viewerId of new Set(viewers)) {
      this.locationRealtimeNotifier.notifyPrivateLocationRemoved(
        viewerId,
        idUsuarioDispositivo,
        LocationRemovalReason.EMERGENCY_ENDED,
      );
    }

    if (assignment?.visibilidadPreferida === VisibilidadPreferida.PUBLICO) {
      this.locationRealtimeNotifier.notifyLocationPublicRemoved(`VIS-${idUsuarioDispositivo}`);
    }
  }

  private async findLiveRow(
    idUsuarioDispositivo: number,
    visibleDesde?: Date | null,
  ): Promise<Ubicacion | null> {
    const ttlCutoff = liveCutoff();
    const since =
      visibleDesde && visibleDesde.getTime() > ttlCutoff.getTime() ? visibleDesde : ttlCutoff;

    return this.prisma.ubicacion.findFirst({
      where: {
        idUsuarioDispositivo,
        fueSincronizadaOffline: false,
        fechaHoraServidor: { gte: since },
      },
      orderBy: { fechaHoraServidor: 'desc' },
    });
  }

  private async findLastKnownRow(idUsuarioDispositivo: number): Promise<Ubicacion | null> {
    return this.prisma.ubicacion.findFirst({
      where: { idUsuarioDispositivo },
      orderBy: { fechaHoraServidor: 'desc' },
    });
  }

  async findVisibleForUser(viewerId: number): Promise<VisibleLocationResponseDto[]> {
    await this.emergencyExpiration?.sweepOverdue();
    const assignments = await this.locationAccessService.findVisibleAssignments(viewerId);
    const results: VisibleLocationResponseDto[] = [];

    for (const assignment of assignments) {
      const row = await this.prisma.usuarioDispositivo.findUnique({
        where: { idUsuarioDispositivo: assignment.idUsuarioDispositivo },
        include: { dispositivo: true },
      });

      if (!row) {
        continue;
      }

      const emergenciaActiva = await this.locationAccessService.hasActiveEmergency(
        assignment.idUsuarioDispositivo,
      );

      if (!row.ubicacionActiva && !emergenciaActiva) {
        continue;
      }

      const location = emergenciaActiva
        ? await this.findLastKnownRow(assignment.idUsuarioDispositivo)
        : await this.findLiveRow(assignment.idUsuarioDispositivo, row.ubicacionVisibleDesde);

      if (!location) {
        continue;
      }

      results.push({
        assignment: {
          idUsuarioDispositivo: row.idUsuarioDispositivo,
          idUsuario: row.idUsuario,
          alias: row.alias,
          codigoDispositivo: row.dispositivo.codigoDispositivo,
          visibilidadPreferida: row.visibilidadPreferida,
          ubicacionActiva: row.ubicacionActiva,
        },
        location: toLocationResponse(location),
        emergenciaActiva,
      });
    }

    return results;
  }

  async findPublicMarkers(): Promise<PublicLocationMarkerDto[]> {
    await this.emergencyExpiration?.sweepOverdue();
    const publicAssignments = await this.prisma.usuarioDispositivo.findMany({
      where: {
        estado: true,
        visibilidadPreferida: VisibilidadPreferida.PUBLICO,
        ubicacionActiva: true,
      },
    });

    const markers: PublicLocationMarkerDto[] = [];

    for (const assignment of publicAssignments) {
      if (!assignment.ubicacionActiva) {
        continue;
      }

      const audience = await this.locationAccessService.getPublicAudience(assignment);

      if (!audience.isPublic || audience.origen !== 'PUBLICO' || !audience.clavePublica) {
        continue;
      }

      const location = await this.findLiveRow(
        assignment.idUsuarioDispositivo,
        assignment.ubicacionVisibleDesde,
      );

      if (!location) {
        continue;
      }

      const annotated = toLocationResponse(location);
      markers.push({
        clavePublica: audience.clavePublica,
        origen: 'PUBLICO',
        codigoPublico: null,
        ubicacion: {
          latitud: annotated.latitud,
          longitud: annotated.longitud,
          altitud: annotated.altitud,
          fechaHoraDispositivo: annotated.fechaHoraDispositivo,
          fechaHoraServidor: annotated.fechaHoraServidor,
          offlineSync: annotated.fueSincronizadaOffline,
          isLive: annotated.isLive,
          liveExpiresAt: annotated.liveExpiresAt,
        },
        fechaUltimaUbicacion: annotated.fechaHoraDispositivo,
      });
    }

    return markers;
  }

  private async emitLocationUpdated(
    idUsuarioDispositivo: number,
    location: LocationResponseDto,
  ): Promise<void> {
    try {
      const assignment = await this.prisma.usuarioDispositivo.findUnique({
        where: { idUsuarioDispositivo },
        include: { dispositivo: true },
      });

      if (!assignment) {
        return;
      }

      const [viewerUserIds, publicAudience, emergenciaActiva] = await Promise.all([
        this.locationAccessService.getAuthorizedPrivateViewerUserIds(idUsuarioDispositivo),
        this.locationAccessService.getPublicAudience(assignment),
        this.locationAccessService.hasActiveEmergency(idUsuarioDispositivo),
      ]);

      if (assignment.ubicacionActiva === false && !emergenciaActiva) {
        return;
      }

      if (
        !emergenciaActiva &&
        assignment.ubicacionVisibleDesde &&
        Date.parse(location.fechaHoraServidor) < assignment.ubicacionVisibleDesde.getTime()
      ) {
        return;
      }

      if (!location.isLive && !emergenciaActiva) {
        return;
      }

      const publicPoint = {
        latitud: location.latitud,
        longitud: location.longitud,
        altitud: location.altitud,
        fechaHoraDispositivo: location.fechaHoraDispositivo,
        fechaHoraServidor: location.fechaHoraServidor,
        offlineSync: location.fueSincronizadaOffline,
        isLive: location.isLive,
        liveExpiresAt: location.liveExpiresAt,
      };

      this.locationRealtimeNotifier.notifyLocationSaved(
        {
          location,
          assignment: {
            idUsuarioDispositivo: assignment.idUsuarioDispositivo,
            idUsuario: assignment.idUsuario,
            alias: assignment.alias,
            codigoDispositivo: assignment.dispositivo.codigoDispositivo,
          },
          emergenciaActiva,
        },
        viewerUserIds,
        publicAudience.isPublic && publicAudience.clavePublica
          ? {
              clavePublica: publicAudience.clavePublica,
              origen: publicAudience.origen ?? 'PUBLICO',
              codigoPublico: publicAudience.codigoPublico,
              ubicacion: publicPoint,
            }
          : undefined,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo emitir location.updated para asignación ${idUsuarioDispositivo}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async saveLocation(
    tx: Prisma.TransactionClient,
    idUsuarioDispositivo: number,
    idDispositivo: number,
    input: LocationInput,
  ) {
    const location = await tx.ubicacion.create({
      data: {
        idUsuarioDispositivo,
        latitud: input.latitud,
        longitud: input.longitud,
        altitud: input.altitud,
        precisionGps: input.precisionGps,
        velocidad: input.velocidad,
        fechaHoraDispositivo: new Date(input.fechaHoraDispositivo),
        fueSincronizadaOffline: input.fueSincronizadaOffline ?? false,
      },
    });

    await tx.dispositivo.update({
      where: { idDispositivo },
      data: { ultimaConexion: new Date() },
    });

    return location;
  }

  async findMyLatest(idUsuario: number): Promise<LocationResponseDto> {
    const location = await this.prisma.ubicacion.findFirst({
      where: {
        usuarioDispositivo: {
          idUsuario,
          estado: true,
        },
      },
      orderBy: { fechaHoraServidor: 'desc' },
    });

    if (!location) {
      throw new NotFoundException('No hay ubicaciones registradas');
    }

    return toLocationResponse(location);
  }

  async findLatestByAssignment(
    viewerId: number,
    idUsuarioDispositivo: number,
  ): Promise<LocationResponseDto> {
    await this.assertCanView(viewerId, idUsuarioDispositivo);

    const location = await this.prisma.ubicacion.findFirst({
      where: { idUsuarioDispositivo },
      orderBy: { fechaHoraServidor: 'desc' },
    });

    if (!location) {
      throw new NotFoundException('No hay ubicaciones registradas para esta asignación');
    }

    return toLocationResponse(location);
  }

  async findHistory(
    viewerId: number,
    idUsuarioDispositivo: number,
    query: LocationHistoryQueryDto,
  ): Promise<LocationResponseDto[]> {
    await this.assertCanView(viewerId, idUsuarioDispositivo);

    const fechaFilter: Prisma.DateTimeFilter = {};

    if (query.from) {
      fechaFilter.gte = new Date(query.from);
    }

    if (query.to) {
      fechaFilter.lte = new Date(query.to);
    }

    const rows = await this.prisma.ubicacion.findMany({
      where: {
        idUsuarioDispositivo,
        ...(query.from || query.to ? { fechaHoraDispositivo: fechaFilter } : {}),
      },
      orderBy: { fechaHoraDispositivo: 'desc' },
      take: 500,
    });

    return rows.map((row) => toLocationResponse(row));
  }

  private async assertCanView(viewerId: number, idUsuarioDispositivo: number) {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
    });

    if (!assignment) {
      throw new NotFoundException('Asignación no encontrada');
    }

    const allowed = await this.locationAccessService.canViewAssignment(viewerId, assignment);

    if (!allowed) {
      throw new ForbiddenException('No tienes permiso para ver esta ubicación');
    }
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateLocationDto } from './dto/create-location.dto.js';
import type { LocationInput } from './dto/location-input.dto.js';
import type { LocationHistoryQueryDto } from './dto/location-history-query.dto.js';
import { toLocationResponse, type LocationResponseDto } from './dto/location-response.dto.js';
import { LocationAccessService } from './location-access.service.js';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationAccessService: LocationAccessService,
    private readonly locationRealtimeNotifier: LocationRealtimeNotifier,
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

      this.locationRealtimeNotifier.notifyLocationSaved({
        location,
        assignment: {
          idUsuarioDispositivo: assignment.idUsuarioDispositivo,
          idUsuario: assignment.idUsuario,
          alias: assignment.alias,
          codigoDispositivo: assignment.dispositivo.codigoDispositivo,
        },
      });
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
      orderBy: { fechaHoraDispositivo: 'desc' },
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
      orderBy: { fechaHoraDispositivo: 'desc' },
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

    return rows.map(toLocationResponse);
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

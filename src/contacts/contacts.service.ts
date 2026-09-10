import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlcanceNotificacion,
  EstadoContacto,
  TipoNotificacion,
  TipoReferencia,
} from '../common/enums.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toContactResponse, type ContactResponseDto } from './dto/contact-response.dto.js';
import type { UpdateLocationPermissionDto } from './dto/update-location-permission.dto.js';

const contactInclude = {
  usuario1: true,
  usuario2: true,
} as const;

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createRequest(idUsuario: number, idUsuarioDestino: number): Promise<ContactResponseDto> {
    if (idUsuario === idUsuarioDestino) {
      throw new BadRequestException('No puedes enviarte una solicitud a ti mismo');
    }

    const destino = await this.prisma.usuario.findFirst({
      where: { idUsuario: idUsuarioDestino, estado: true },
    });

    if (!destino) {
      throw new NotFoundException('Usuario destino no encontrado');
    }

    const idUsuario1 = Math.min(idUsuario, idUsuarioDestino);
    const idUsuario2 = Math.max(idUsuario, idUsuarioDestino);

    const existing = await this.prisma.usuarioContacto.findUnique({
      where: { idUsuario1_idUsuario2: { idUsuario1, idUsuario2 } },
      include: contactInclude,
    });

    if (existing) {
      if (existing.estado === EstadoContacto.PENDIENTE || existing.estado === EstadoContacto.ACEPTADO) {
        throw new ConflictException('Ya existe una relación de contacto entre estos usuarios');
      }

      const reused = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.usuarioContacto.update({
          where: { idUsuarioContacto: existing.idUsuarioContacto },
          data: {
            idUsuarioSolicitante: idUsuario,
            estado: EstadoContacto.PENDIENTE,
            usuario1ComparteUbicacion: false,
            usuario2ComparteUbicacion: false,
            fechaSolicitud: new Date(),
            fechaRespuesta: null,
          },
          include: contactInclude,
        });

        await this.notificationsService.createForUsers(
          {
            tipo: TipoNotificacion.SOLICITUD_CONTACTO,
            alcance: AlcanceNotificacion.USUARIO,
            titulo: 'Nueva solicitud de contacto',
            mensaje: 'Alguien quiere agregarte como contacto.',
            tipoReferencia: TipoReferencia.CONTACTO,
            idReferencia: BigInt(updated.idUsuarioContacto),
            userIds: [idUsuarioDestino],
          },
          tx,
        );

        return updated;
      });

      return toContactResponse(reused, idUsuario);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const contact = await tx.usuarioContacto.create({
        data: {
          idUsuario1,
          idUsuario2,
          idUsuarioSolicitante: idUsuario,
          estado: EstadoContacto.PENDIENTE,
        },
        include: contactInclude,
      });

      await this.notificationsService.createForUsers(
        {
          tipo: TipoNotificacion.SOLICITUD_CONTACTO,
          alcance: AlcanceNotificacion.USUARIO,
          titulo: 'Nueva solicitud de contacto',
          mensaje: 'Alguien quiere agregarte como contacto.',
          tipoReferencia: TipoReferencia.CONTACTO,
          idReferencia: BigInt(contact.idUsuarioContacto),
          userIds: [idUsuarioDestino],
        },
        tx,
      );

      return contact;
    });

    return toContactResponse(created, idUsuario);
  }

  async findAccepted(idUsuario: number): Promise<ContactResponseDto[]> {
    const rows = await this.prisma.usuarioContacto.findMany({
      where: {
        estado: EstadoContacto.ACEPTADO,
        OR: [{ idUsuario1: idUsuario }, { idUsuario2: idUsuario }],
      },
      include: contactInclude,
      orderBy: { fechaActualizacion: 'desc' },
    });

    return rows.map((row) => toContactResponse(row, idUsuario));
  }

  async findRequests(idUsuario: number): Promise<ContactResponseDto[]> {
    const rows = await this.prisma.usuarioContacto.findMany({
      where: {
        estado: EstadoContacto.PENDIENTE,
        OR: [{ idUsuario1: idUsuario }, { idUsuario2: idUsuario }],
      },
      include: contactInclude,
      orderBy: { fechaSolicitud: 'desc' },
    });

    return rows.map((row) => toContactResponse(row, idUsuario));
  }

  async accept(idUsuario: number, idUsuarioContacto: number): Promise<ContactResponseDto> {
    await this.getPendingIncoming(idUsuario, idUsuarioContacto);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.usuarioContacto.update({
        where: { idUsuarioContacto },
        data: {
          estado: EstadoContacto.ACEPTADO,
          fechaRespuesta: new Date(),
        },
        include: contactInclude,
      });

      await this.notificationsService.createForUsers(
        {
          tipo: TipoNotificacion.CONTACTO_AGREGADO,
          alcance: AlcanceNotificacion.USUARIO,
          titulo: 'Contacto agregado',
          mensaje: 'Ahora son contactos.',
          tipoReferencia: TipoReferencia.CONTACTO,
          idReferencia: BigInt(row.idUsuarioContacto),
          userIds: [row.idUsuario1, row.idUsuario2],
        },
        tx,
      );

      return row;
    });

    return toContactResponse(updated, idUsuario);
  }

  async reject(idUsuario: number, idUsuarioContacto: number): Promise<ContactResponseDto> {
    await this.getPendingIncoming(idUsuario, idUsuarioContacto);

    const updated = await this.prisma.usuarioContacto.update({
      where: { idUsuarioContacto },
      data: {
        estado: EstadoContacto.RECHAZADO,
        fechaRespuesta: new Date(),
      },
      include: contactInclude,
    });

    return toContactResponse(updated, idUsuario);
  }

  async updateLocationPermission(
    idUsuario: number,
    idUsuarioContacto: number,
    dto: UpdateLocationPermissionDto,
  ): Promise<ContactResponseDto> {
    const contact = await this.getOwnedContact(idUsuario, idUsuarioContacto);

    if (contact.estado !== EstadoContacto.ACEPTADO) {
      throw new BadRequestException('Solo puedes cambiar el permiso en un contacto aceptado');
    }

    const updated = await this.prisma.usuarioContacto.update({
      where: { idUsuarioContacto },
      data:
        contact.idUsuario1 === idUsuario
          ? { usuario1ComparteUbicacion: dto.comparteUbicacion }
          : { usuario2ComparteUbicacion: dto.comparteUbicacion },
      include: contactInclude,
    });

    return toContactResponse(updated, idUsuario);
  }

  async remove(idUsuario: number, idUsuarioContacto: number): Promise<ContactResponseDto> {
    const contact = await this.getOwnedContact(idUsuario, idUsuarioContacto);

    const updated = await this.prisma.usuarioContacto.update({
      where: { idUsuarioContacto },
      data: {
        estado: EstadoContacto.ELIMINADO,
        usuario1ComparteUbicacion: false,
        usuario2ComparteUbicacion: false,
        fechaRespuesta: contact.fechaRespuesta ?? new Date(),
      },
      include: contactInclude,
    });

    return toContactResponse(updated, idUsuario);
  }

  private async getOwnedContact(idUsuario: number, idUsuarioContacto: number) {
    const contact = await this.prisma.usuarioContacto.findUnique({
      where: { idUsuarioContacto },
      include: contactInclude,
    });

    if (!contact) {
      throw new NotFoundException('Contacto no encontrado');
    }

    if (contact.idUsuario1 !== idUsuario && contact.idUsuario2 !== idUsuario) {
      throw new ForbiddenException('No formas parte de esta relación');
    }

    return contact;
  }

  private async getPendingIncoming(idUsuario: number, idUsuarioContacto: number) {
    const contact = await this.getOwnedContact(idUsuario, idUsuarioContacto);

    if (contact.estado !== EstadoContacto.PENDIENTE) {
      throw new BadRequestException('La solicitud no está pendiente');
    }

    if (contact.idUsuarioSolicitante === idUsuario) {
      throw new ForbiddenException('El destinatario debe responder la solicitud');
    }

    return contact;
  }
}

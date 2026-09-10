import { Injectable } from '@nestjs/common';
import {
  EstadoContacto,
  EstadoEmergencia,
  VisibilidadPreferida,
} from '../common/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

type AssignmentAccessContext = {
  idUsuarioDispositivo: number;
  idUsuario: number;
  visibilidadPreferida: string;
  estado: boolean;
};

@Injectable()
export class LocationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async canViewLocation(viewerUserId: number, userDeviceId: number): Promise<boolean> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo: userDeviceId },
    });

    if (!assignment) {
      return false;
    }

    return this.canViewAssignment(viewerUserId, assignment);
  }

  async canViewAssignment(
    viewerUserId: number,
    assignment: AssignmentAccessContext,
  ): Promise<boolean> {
    if (assignment.idUsuario === viewerUserId) {
      return true;
    }

    if (await this.hasActiveEmergency(assignment.idUsuarioDispositivo)) {
      return true;
    }

    const effectiveVisibility = await this.getEffectiveVisibility(assignment);

    if (effectiveVisibility === VisibilidadPreferida.PUBLICO) {
      return true;
    }

    if (await this.ownerSharesWithContact(assignment.idUsuario, viewerUserId)) {
      return true;
    }

    if (
      effectiveVisibility === VisibilidadPreferida.GRUPO &&
      (await this.shareActiveGroup(assignment.idUsuario, viewerUserId))
    ) {
      return true;
    }

    return false;
  }

  async canViewEmergencyDetails(viewerUserId: number, ownerUserId: number): Promise<boolean> {
    if (viewerUserId === ownerUserId) {
      return true;
    }

    if (await this.areAcceptedContacts(ownerUserId, viewerUserId)) {
      return true;
    }

    return this.shareActiveGroup(ownerUserId, viewerUserId);
  }

  async getEffectiveVisibility(
    assignment: Pick<AssignmentAccessContext, 'idUsuarioDispositivo' | 'visibilidadPreferida'>,
  ): Promise<VisibilidadPreferida> {
    if (await this.hasActiveEmergency(assignment.idUsuarioDispositivo)) {
      return VisibilidadPreferida.PUBLICO;
    }

    return assignment.visibilidadPreferida as VisibilidadPreferida;
  }

  private async hasActiveEmergency(idUsuarioDispositivo: number): Promise<boolean> {
    const emergency = await this.prisma.emergencia.findFirst({
      where: {
        idUsuarioDispositivo,
        estado: EstadoEmergencia.ACTIVA,
      },
      select: { idEmergencia: true },
    });

    return emergency != null;
  }

  private async areAcceptedContacts(ownerId: number, viewerId: number): Promise<boolean> {
    const idUsuario1 = Math.min(ownerId, viewerId);
    const idUsuario2 = Math.max(ownerId, viewerId);

    const contact = await this.prisma.usuarioContacto.findUnique({
      where: { idUsuario1_idUsuario2: { idUsuario1, idUsuario2 } },
    });

    return contact?.estado === EstadoContacto.ACEPTADO;
  }

  private async ownerSharesWithContact(ownerId: number, viewerId: number): Promise<boolean> {
    const idUsuario1 = Math.min(ownerId, viewerId);
    const idUsuario2 = Math.max(ownerId, viewerId);

    const contact = await this.prisma.usuarioContacto.findUnique({
      where: { idUsuario1_idUsuario2: { idUsuario1, idUsuario2 } },
    });

    if (!contact || contact.estado !== EstadoContacto.ACEPTADO) {
      return false;
    }

    return ownerId === contact.idUsuario1
      ? contact.usuario1ComparteUbicacion
      : contact.usuario2ComparteUbicacion;
  }

  private async shareActiveGroup(ownerId: number, viewerId: number): Promise<boolean> {
    const shared = await this.prisma.grupoUsuario.findFirst({
      where: {
        idUsuario: ownerId,
        estado: true,
        grupo: {
          estado: true,
          miembros: {
            some: {
              idUsuario: viewerId,
              estado: true,
            },
          },
        },
      },
      select: { idGrupoUsuario: true },
    });

    return shared != null;
  }
}

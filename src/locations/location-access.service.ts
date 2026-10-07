import { Injectable } from '@nestjs/common';
import {
  EstadoContacto,
  EstadoEmergencia,
  VisibilidadPreferida,
} from '../common/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type AssignmentAccessContext = {
  idUsuarioDispositivo: number;
  idUsuario: number;
  visibilidadPreferida: string;
  estado: boolean;
  ubicacionActiva?: boolean;
};

export type PublicAudienceContext = {
  isPublic: boolean;
  origen: 'PUBLICO' | 'EMERGENCIA' | null;
  codigoPublico: string | null;
  clavePublica: string | null;
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

    if (await this.ownerSharesWithContact(assignment.idUsuario, viewerUserId)) {
      return true;
    }

    if (await this.hasNormalGroupAccess(viewerUserId, assignment)) {
      return true;
    }

    if (await this.hasActiveEmergency(assignment.idUsuarioDispositivo)) {
      return this.canViewEmergencyDetails(viewerUserId, assignment.idUsuario);
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

  async getAuthorizedPrivateViewerUserIds(idUsuarioDispositivo: number): Promise<number[]> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
    });

    if (!assignment || !assignment.estado) {
      return [];
    }

    return this.collectPrivateViewerUserIds(assignment);
  }

  async getPublicAudience(
    assignment: Pick<AssignmentAccessContext, 'idUsuarioDispositivo' | 'visibilidadPreferida'>,
  ): Promise<PublicAudienceContext> {
    const emergency = await this.prisma.emergencia.findFirst({
      where: {
        idUsuarioDispositivo: assignment.idUsuarioDispositivo,
        estado: EstadoEmergencia.ACTIVA,
      },
      select: { codigoPublico: true },
    });

    if (emergency) {
      return {
        isPublic: true,
        origen: 'EMERGENCIA',
        codigoPublico: emergency.codigoPublico,
        clavePublica: emergency.codigoPublico,
      };
    }

    if (assignment.visibilidadPreferida === VisibilidadPreferida.PUBLICO) {
      return {
        isPublic: true,
        origen: 'PUBLICO',
        codigoPublico: null,
        clavePublica: `VIS-${assignment.idUsuarioDispositivo}`,
      };
    }

    return {
      isPublic: false,
      origen: null,
      codigoPublico: null,
      clavePublica: null,
    };
  }

  async findVisibleAssignments(viewerUserId: number): Promise<AssignmentAccessContext[]> {
    const [own, sharedByContacts, groupVisible, emergencyVisible] = await Promise.all([
      this.findOwnAssignments(viewerUserId),
      this.findAssignmentsSharedByContacts(viewerUserId),
      this.findGroupVisibleAssignments(viewerUserId),
      this.findEmergencyVisibleAssignments(viewerUserId),
    ]);

    const byId = new Map<number, AssignmentAccessContext>();

    for (const assignment of [...own, ...sharedByContacts, ...groupVisible, ...emergencyVisible]) {
      byId.set(assignment.idUsuarioDispositivo, assignment);
    }

    return [...byId.values()];
  }

  private async collectPrivateViewerUserIds(assignment: AssignmentAccessContext): Promise<number[]> {
    const viewerIds = new Set<number>([assignment.idUsuario]);

    const contacts = await this.prisma.usuarioContacto.findMany({
      where: {
        estado: EstadoContacto.ACEPTADO,
        OR: [{ idUsuario1: assignment.idUsuario }, { idUsuario2: assignment.idUsuario }],
      },
    });

    for (const contact of contacts) {
      const otherId =
        contact.idUsuario1 === assignment.idUsuario ? contact.idUsuario2 : contact.idUsuario1;
      const ownerShares =
        assignment.idUsuario === contact.idUsuario1
          ? contact.usuario1ComparteUbicacion
          : contact.usuario2ComparteUbicacion;

      if (ownerShares) {
        viewerIds.add(otherId);
      }
    }

    if (assignment.visibilidadPreferida === VisibilidadPreferida.GRUPO) {
      for (const memberId of await this.findGrantedGroupPeerIds(assignment)) {
        viewerIds.add(memberId);
      }
    }

    if (await this.hasActiveEmergency(assignment.idUsuarioDispositivo)) {
      for (const contact of contacts) {
        const otherId =
          contact.idUsuario1 === assignment.idUsuario ? contact.idUsuario2 : contact.idUsuario1;
        viewerIds.add(otherId);
      }

      for (const memberId of await this.findActiveGroupPeerIds(assignment.idUsuario)) {
        viewerIds.add(memberId);
      }
    }

    return [...viewerIds];
  }

  private async findOwnAssignments(viewerUserId: number): Promise<AssignmentAccessContext[]> {
    return this.prisma.usuarioDispositivo.findMany({
      where: { idUsuario: viewerUserId, estado: true },
    });
  }

  private async findAssignmentsSharedByContacts(
    viewerUserId: number,
  ): Promise<AssignmentAccessContext[]> {
    const contacts = await this.prisma.usuarioContacto.findMany({
      where: {
        estado: EstadoContacto.ACEPTADO,
        OR: [{ idUsuario1: viewerUserId }, { idUsuario2: viewerUserId }],
      },
    });

    const ownerIds = contacts
      .filter((contact) =>
        contact.idUsuario1 === viewerUserId
          ? contact.usuario2ComparteUbicacion
          : contact.usuario1ComparteUbicacion,
      )
      .map((contact) =>
        contact.idUsuario1 === viewerUserId ? contact.idUsuario2 : contact.idUsuario1,
      );

    if (ownerIds.length === 0) {
      return [];
    }

    return this.prisma.usuarioDispositivo.findMany({
      where: { idUsuario: { in: ownerIds }, estado: true },
    });
  }

  private async findGroupVisibleAssignments(
    viewerUserId: number,
  ): Promise<AssignmentAccessContext[]> {
    const memberships = await this.prisma.grupoUsuario.findMany({
      where: {
        idUsuario: viewerUserId,
        estado: true,
        grupo: { estado: true },
      },
      select: { idGrupo: true },
    });

    if (memberships.length === 0) {
      return [];
    }

    const groupIds = memberships.map((row) => row.idGrupo);
    const grants = await this.prisma.usuarioDispositivoGrupo.findMany({
      where: {
        activo: true,
        idGrupo: { in: groupIds },
        grupo: { estado: true },
        usuarioDispositivo: {
          estado: true,
          ubicacionActiva: true,
          visibilidadPreferida: VisibilidadPreferida.GRUPO,
          idUsuario: { not: viewerUserId },
        },
      },
      select: {
        idGrupo: true,
        idUsuarioDispositivo: true,
        usuarioDispositivo: true,
      },
    });

    if (grants.length === 0) {
      return [];
    }

    const ownerIds = [...new Set(grants.map((grant) => grant.usuarioDispositivo.idUsuario))];
    const grantGroupIds = [...new Set(grants.map((grant) => grant.idGrupo))];
    const ownerMemberships = await this.prisma.grupoUsuario.findMany({
      where: {
        estado: true,
        idUsuario: { in: ownerIds },
        idGrupo: { in: grantGroupIds },
        grupo: { estado: true },
      },
      select: { idUsuario: true, idGrupo: true },
    });
    const ownerMemberKey = new Set(
      ownerMemberships.map((row) => `${row.idUsuario}:${row.idGrupo}`),
    );

    const exclusions = await this.prisma.usuarioDispositivoGrupoExclusion.findMany({
      where: {
        idUsuarioExcluido: viewerUserId,
        idGrupo: { in: grantGroupIds },
        idUsuarioDispositivo: { in: grants.map((grant) => grant.idUsuarioDispositivo) },
      },
      select: { idUsuarioDispositivo: true, idGrupo: true },
    });
    const excludedKey = new Set(
      exclusions.map((row) => `${row.idUsuarioDispositivo}:${row.idGrupo}`),
    );

    const byId = new Map<number, AssignmentAccessContext>();

    for (const grant of grants) {
      const assignment = grant.usuarioDispositivo;

      if (!ownerMemberKey.has(`${assignment.idUsuario}:${grant.idGrupo}`)) {
        continue;
      }

      if (excludedKey.has(`${grant.idUsuarioDispositivo}:${grant.idGrupo}`)) {
        continue;
      }

      byId.set(assignment.idUsuarioDispositivo, assignment);
    }

    return [...byId.values()];
  }

  private async findEmergencyVisibleAssignments(
    viewerUserId: number,
  ): Promise<AssignmentAccessContext[]> {
    const emergencies = await this.prisma.emergencia.findMany({
      where: { estado: EstadoEmergencia.ACTIVA },
      include: { usuarioDispositivo: true },
    });

    const visible: AssignmentAccessContext[] = [];

    for (const emergency of emergencies) {
      const assignment = emergency.usuarioDispositivo;

      if (!assignment.estado) {
        continue;
      }

      const allowed = await this.canViewEmergencyDetails(viewerUserId, assignment.idUsuario);

      if (allowed) {
        visible.push(assignment);
      }
    }

    return visible;
  }

  async hasActiveEmergency(idUsuarioDispositivo: number): Promise<boolean> {
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

  private async hasNormalGroupAccess(
    viewerUserId: number,
    assignment: AssignmentAccessContext,
  ): Promise<boolean> {
    const peers = await this.findGrantedGroupPeerIds(assignment);
    return peers.includes(viewerUserId);
  }

  private async findGrantedGroupPeerIds(assignment: AssignmentAccessContext): Promise<number[]> {
    if (
      assignment.visibilidadPreferida !== VisibilidadPreferida.GRUPO ||
      !assignment.estado ||
      assignment.ubicacionActiva !== true
    ) {
      return [];
    }

    const grants = await this.prisma.usuarioDispositivoGrupo.findMany({
      where: {
        idUsuarioDispositivo: assignment.idUsuarioDispositivo,
        activo: true,
        grupo: { estado: true },
      },
      select: { idGrupo: true },
    });

    if (grants.length === 0) {
      return [];
    }

    const groupIds = grants.map((grant) => grant.idGrupo);
    const ownerMemberships = await this.prisma.grupoUsuario.findMany({
      where: {
        idUsuario: assignment.idUsuario,
        idGrupo: { in: groupIds },
        estado: true,
        grupo: { estado: true },
      },
      select: { idGrupo: true },
    });
    const validGroupIds = ownerMemberships.map((row) => row.idGrupo);

    if (validGroupIds.length === 0) {
      return [];
    }

    const [peers, exclusions] = await Promise.all([
      this.prisma.grupoUsuario.findMany({
        where: {
          estado: true,
          idGrupo: { in: validGroupIds },
          idUsuario: { not: assignment.idUsuario },
          grupo: { estado: true },
        },
        select: { idUsuario: true, idGrupo: true },
      }),
      this.prisma.usuarioDispositivoGrupoExclusion.findMany({
        where: {
          idUsuarioDispositivo: assignment.idUsuarioDispositivo,
          idGrupo: { in: validGroupIds },
        },
        select: { idGrupo: true, idUsuarioExcluido: true },
      }),
    ]);

    const excluded = new Set(exclusions.map((row) => `${row.idGrupo}:${row.idUsuarioExcluido}`));
    const allowed = new Set<number>();

    for (const peer of peers) {
      if (!excluded.has(`${peer.idGrupo}:${peer.idUsuario}`)) {
        allowed.add(peer.idUsuario);
      }
    }

    return [...allowed];
  }

  /** Co-membresía de emergencia. No usa grants ni exclusiones del sharing normal. */
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

  /** Compañeros de emergencia. Ignora visibilidadPreferida, grants y exclusiones. */
  private async findActiveGroupPeerIds(userId: number): Promise<number[]> {
    const memberships = await this.prisma.grupoUsuario.findMany({
      where: {
        idUsuario: userId,
        estado: true,
        grupo: { estado: true },
      },
      select: { idGrupo: true },
    });

    if (memberships.length === 0) {
      return [];
    }

    const peers = await this.prisma.grupoUsuario.findMany({
      where: {
        estado: true,
        idGrupo: { in: memberships.map((row) => row.idGrupo) },
        idUsuario: { not: userId },
      },
      select: { idUsuario: true },
    });

    return [...new Set(peers.map((row) => row.idUsuario))];
  }
}

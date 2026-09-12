import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlcanceNotificacion,
  EstadoInvitacion,
  RolGrupo,
  TipoNotificacion,
  TipoReferencia,
} from '../common/enums.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateGroupDto } from './dto/create-group.dto.js';
import type { CreateInvitationDto } from './dto/create-invitation.dto.js';
import {
  toGroupMemberResponse,
  toGroupResponse,
  type GroupMemberResponseDto,
  type GroupResponseDto,
} from './dto/group-response.dto.js';
import { toInvitationResponse, type InvitationResponseDto } from './dto/invitation-response.dto.js';
import type { UpdateGroupDto } from './dto/update-group.dto.js';

const invitationInclude = {
  grupo: true,
  invitador: true,
  invitado: true,
} as const;

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(idUsuario: number, dto: CreateGroupDto): Promise<GroupResponseDto> {
    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.grupo.create({
        data: {
          nombre: dto.nombre,
          descripcion: dto.descripcion,
          idCreador: idUsuario,
          miembros: {
            create: {
              idUsuario,
              rol: RolGrupo.ADMIN,
            },
          },
        },
        include: { miembros: { include: { usuario: true } } },
      });

      return created;
    });

    return toGroupResponse(group);
  }

  async findMine(idUsuario: number): Promise<GroupResponseDto[]> {
    const memberships = await this.prisma.grupoUsuario.findMany({
      where: { idUsuario, estado: true, grupo: { estado: true } },
      include: {
        grupo: {
          include: { miembros: { where: { estado: true }, include: { usuario: true } } },
        },
      },
      orderBy: { fechaIngreso: 'desc' },
    });

    return memberships.map((row) => toGroupResponse(row.grupo));
  }

  async findOne(idUsuario: number, idGrupo: number): Promise<GroupResponseDto> {
    await this.getActiveMembership(idUsuario, idGrupo);

    const group = await this.prisma.grupo.findUnique({
      where: { idGrupo },
      include: { miembros: { where: { estado: true }, include: { usuario: true } } },
    });

    if (!group) {
      throw new NotFoundException('Grupo no encontrado');
    }

    return toGroupResponse(group);
  }

  async update(idUsuario: number, idGrupo: number, dto: UpdateGroupDto): Promise<GroupResponseDto> {
    await this.getActiveMembership(idUsuario, idGrupo, true);

    const updated = await this.prisma.grupo.update({
      where: { idGrupo },
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        estado: dto.estado,
      },
      include: { miembros: { where: { estado: true }, include: { usuario: true } } },
    });

    return toGroupResponse(updated);
  }

  async findMembers(idUsuario: number, idGrupo: number): Promise<GroupMemberResponseDto[]> {
    await this.getActiveMembership(idUsuario, idGrupo);

    const members = await this.prisma.grupoUsuario.findMany({
      where: { idGrupo, estado: true },
      include: { usuario: true },
      orderBy: { fechaIngreso: 'asc' },
    });

    return members.map(toGroupMemberResponse);
  }

  async invite(
    idUsuario: number,
    idGrupo: number,
    dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    await this.getActiveMembership(idUsuario, idGrupo, true);

    if (idUsuario === dto.idUsuarioInvitado) {
      throw new BadRequestException('No puedes invitarte a ti mismo');
    }

    const invited = await this.prisma.usuario.findFirst({
      where: { idUsuario: dto.idUsuarioInvitado, estado: true },
    });

    if (!invited) {
      throw new NotFoundException('Usuario invitado no encontrado');
    }

    const existingMember = await this.prisma.grupoUsuario.findUnique({
      where: { idGrupo_idUsuario: { idGrupo, idUsuario: dto.idUsuarioInvitado } },
    });

    if (existingMember?.estado) {
      throw new ConflictException('El usuario ya es miembro del grupo');
    }

    const pending = await this.prisma.grupoInvitacion.findFirst({
      where: {
        idGrupo,
        idUsuarioInvitado: dto.idUsuarioInvitado,
        estado: EstadoInvitacion.PENDIENTE,
      },
    });

    if (pending) {
      throw new ConflictException('Ya existe una invitación pendiente para este usuario');
    }

    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.grupoInvitacion.create({
        data: {
          idGrupo,
          idUsuarioInvitador: idUsuario,
          idUsuarioInvitado: dto.idUsuarioInvitado,
          estado: EstadoInvitacion.PENDIENTE,
        },
        include: invitationInclude,
      });

      await this.notificationsService.createForUsers(
        {
          tipo: TipoNotificacion.INVITACION_GRUPO,
          alcance: AlcanceNotificacion.USUARIO,
          titulo: 'Invitación a un grupo',
          mensaje: `Te invitaron al grupo ${created.grupo.nombre}.`,
          tipoReferencia: TipoReferencia.INVITACION,
          idReferencia: BigInt(created.idInvitacion),
          userIds: [dto.idUsuarioInvitado],
        },
        tx,
      );

      return created;
    });

    return toInvitationResponse(invitation);
  }

  async findMyInvitations(idUsuario: number): Promise<InvitationResponseDto[]> {
    const rows = await this.prisma.grupoInvitacion.findMany({
      where: {
        idUsuarioInvitado: idUsuario,
        estado: EstadoInvitacion.PENDIENTE,
      },
      include: invitationInclude,
      orderBy: { fechaInvitacion: 'desc' },
    });

    return rows.map(toInvitationResponse);
  }

  async acceptInvitation(idUsuario: number, idInvitacion: number): Promise<InvitationResponseDto> {
    const invitation = await this.getIncomingPendingInvitation(idUsuario, idInvitacion);

    const accepted = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.grupoInvitacion.update({
        where: { idInvitacion },
        data: {
          estado: EstadoInvitacion.ACEPTADA,
          fechaRespuesta: new Date(),
        },
        include: invitationInclude,
      });

      const existingMember = await tx.grupoUsuario.findUnique({
        where: {
          idGrupo_idUsuario: { idGrupo: invitation.idGrupo, idUsuario },
        },
      });

      if (existingMember) {
        await tx.grupoUsuario.update({
          where: { idGrupoUsuario: existingMember.idGrupoUsuario },
          data: { estado: true, fechaIngreso: new Date(), rol: existingMember.rol },
        });
      } else {
        await tx.grupoUsuario.create({
          data: {
            idGrupo: invitation.idGrupo,
            idUsuario,
            rol: RolGrupo.MIEMBRO,
          },
        });
      }

      const admins = await tx.grupoUsuario.findMany({
        where: {
          idGrupo: invitation.idGrupo,
          estado: true,
          rol: RolGrupo.ADMIN,
          idUsuario: { not: idUsuario },
        },
        select: { idUsuario: true },
      });

      await this.notificationsService.createForUsers(
        {
          tipo: TipoNotificacion.NUEVO_MIEMBRO,
          alcance: AlcanceNotificacion.GRUPO,
          titulo: 'Nuevo miembro en el grupo',
          mensaje: `${updated.invitado.nombres} se unió a ${updated.grupo.nombre}.`,
          tipoReferencia: TipoReferencia.GRUPO,
          idReferencia: BigInt(invitation.idGrupo),
          userIds: admins.map((member) => member.idUsuario),
        },
        tx,
      );

      return updated;
    });

    return toInvitationResponse(accepted);
  }

  async rejectInvitation(idUsuario: number, idInvitacion: number): Promise<InvitationResponseDto> {
    await this.getIncomingPendingInvitation(idUsuario, idInvitacion);

    const updated = await this.prisma.grupoInvitacion.update({
      where: { idInvitacion },
      data: {
        estado: EstadoInvitacion.RECHAZADA,
        fechaRespuesta: new Date(),
      },
      include: invitationInclude,
    });

    return toInvitationResponse(updated);
  }

  async cancelInvitation(idUsuario: number, idInvitacion: number): Promise<InvitationResponseDto> {
    const invitation = await this.prisma.grupoInvitacion.findUnique({
      where: { idInvitacion },
      include: invitationInclude,
    });

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada');
    }

    await this.getActiveMembership(idUsuario, invitation.idGrupo, true);

    if (invitation.estado !== EstadoInvitacion.PENDIENTE) {
      throw new BadRequestException('La invitación no está pendiente');
    }

    const updated = await this.prisma.grupoInvitacion.update({
      where: { idInvitacion },
      data: {
        estado: EstadoInvitacion.CANCELADA,
        fechaRespuesta: new Date(),
      },
      include: invitationInclude,
    });

    return toInvitationResponse(updated);
  }

  async removeMember(
    actorId: number,
    idGrupo: number,
    targetUserId: number,
  ): Promise<GroupMemberResponseDto> {
    const actor = await this.getActiveMembership(actorId, idGrupo);
    const isSelf = actorId === targetUserId;

    if (!isSelf && actor.rol !== RolGrupo.ADMIN) {
      throw new ForbiddenException('Solo un administrador puede eliminar a otro miembro');
    }

    const target = await this.prisma.grupoUsuario.findUnique({
      where: { idGrupo_idUsuario: { idGrupo, idUsuario: targetUserId } },
      include: { usuario: true },
    });

    if (!target || !target.estado) {
      throw new NotFoundException('El usuario no es miembro activo del grupo');
    }

    if (target.rol === RolGrupo.ADMIN) {
      const adminCount = await this.prisma.grupoUsuario.count({
        where: { idGrupo, estado: true, rol: RolGrupo.ADMIN },
      });

      if (adminCount <= 1) {
        if (!isSelf) {
          throw new ConflictException('No se puede eliminar al último administrador del grupo');
        }

        const deactivated = await this.deactivateGroupWithoutAdmin(idGrupo, target);
        return toGroupMemberResponse(deactivated);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.grupoUsuario.update({
        where: { idGrupoUsuario: target.idGrupoUsuario },
        data: { estado: false },
        include: { usuario: true },
      });

      if (!isSelf) {
        await this.notificationsService.createForUsers(
          {
            tipo: TipoNotificacion.MIEMBRO_ELIMINADO,
            alcance: AlcanceNotificacion.USUARIO,
            titulo: 'Saliste de un grupo',
            mensaje: 'Un administrador te retiró del grupo.',
            tipoReferencia: TipoReferencia.GRUPO,
            idReferencia: BigInt(idGrupo),
            userIds: [targetUserId],
          },
          tx,
        );
      }

      return row;
    });

    return toGroupMemberResponse(updated);
  }

  private async deactivateGroupWithoutAdmin(
    idGrupo: number,
    lastAdmin: { idGrupoUsuario: number; usuario: { idUsuario: number } },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.grupo.update({
        where: { idGrupo },
        data: { estado: false },
      });

      await tx.grupoUsuario.updateMany({
        where: { idGrupo, estado: true },
        data: { estado: false },
      });

      await tx.grupoInvitacion.updateMany({
        where: { idGrupo, estado: EstadoInvitacion.PENDIENTE },
        data: {
          estado: EstadoInvitacion.CANCELADA,
          fechaRespuesta: new Date(),
        },
      });

      return tx.grupoUsuario.update({
        where: { idGrupoUsuario: lastAdmin.idGrupoUsuario },
        data: { estado: false },
        include: { usuario: true },
      });
    });
  }

  private async getActiveMembership(idUsuario: number, idGrupo: number, adminOnly = false) {
    const membership = await this.prisma.grupoUsuario.findUnique({
      where: { idGrupo_idUsuario: { idGrupo, idUsuario } },
      include: { grupo: true },
    });

    if (!membership || !membership.estado || !membership.grupo.estado) {
      throw new ForbiddenException('No perteneces a este grupo');
    }

    if (adminOnly && membership.rol !== RolGrupo.ADMIN) {
      throw new ForbiddenException('Se requiere rol de administrador');
    }

    return membership;
  }

  private async getIncomingPendingInvitation(idUsuario: number, idInvitacion: number) {
    const invitation = await this.prisma.grupoInvitacion.findUnique({
      where: { idInvitacion },
      include: invitationInclude,
    });

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada');
    }

    if (invitation.idUsuarioInvitado !== idUsuario) {
      throw new ForbiddenException('Esta invitación no te pertenece');
    }

    if (invitation.estado !== EstadoInvitacion.PENDIENTE) {
      throw new BadRequestException('La invitación no está pendiente');
    }

    return invitation;
  }
}

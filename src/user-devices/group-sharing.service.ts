import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrivateLocationRemovalNotifier } from '../locations/private-location-removal.notifier.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserPublic } from '../users/dto/user-response.dto.js';
import type { GroupSharingItemDto } from './dto/group-sharing.dto.js';

@Injectable()
export class GroupSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privateLocationRemoval: PrivateLocationRemovalNotifier,
  ) {}

  async list(idUsuario: number, idUsuarioDispositivo: number): Promise<GroupSharingItemDto[]> {
    await this.getOwnedActiveAssignment(idUsuario, idUsuarioDispositivo);

    const memberships = await this.prisma.grupoUsuario.findMany({
      where: { idUsuario, estado: true, grupo: { estado: true } },
      include: { grupo: true },
      orderBy: { fechaIngreso: 'asc' },
    });

    if (memberships.length === 0) {
      return [];
    }

    const groupIds = memberships.map((row) => row.idGrupo);
    const [grants, exclusions, members] = await Promise.all([
      this.prisma.usuarioDispositivoGrupo.findMany({
        where: { idUsuarioDispositivo, idGrupo: { in: groupIds } },
      }),
      this.prisma.usuarioDispositivoGrupoExclusion.findMany({
        where: { idUsuarioDispositivo, idGrupo: { in: groupIds } },
        include: { usuarioExcluido: true },
      }),
      this.prisma.grupoUsuario.findMany({
        where: { idGrupo: { in: groupIds }, estado: true },
        select: { idGrupo: true, idUsuario: true },
      }),
    ]);

    const activeMemberKeys = new Set(members.map((row) => `${row.idGrupo}:${row.idUsuario}`));
    const grantByGroup = new Map(grants.map((row) => [row.idGrupo, row]));

    return memberships.map((membership) => ({
      idGrupo: membership.idGrupo,
      nombre: membership.grupo.nombre,
      compartiendo: grantByGroup.get(membership.idGrupo)?.activo === true,
      miembrosExcluidos: exclusions
        .filter(
          (row) =>
            row.idGrupo === membership.idGrupo &&
            row.idUsuarioExcluido !== idUsuario &&
            activeMemberKeys.has(`${row.idGrupo}:${row.idUsuarioExcluido}`),
        )
        .map((row) => toUserPublic(row.usuarioExcluido)),
    }));
  }

  async setGroupSharing(
    idUsuario: number,
    idUsuarioDispositivo: number,
    idGrupo: number,
    comparteUbicacion: boolean,
  ): Promise<GroupSharingItemDto> {
    await this.getOwnedActiveAssignment(idUsuario, idUsuarioDispositivo);
    await this.assertOwnerCanShareGroup(idUsuario, idGrupo);

    const persist = () =>
      this.prisma.usuarioDispositivoGrupo.upsert({
        where: {
          idUsuarioDispositivo_idGrupo: { idUsuarioDispositivo, idGrupo },
        },
        create: { idUsuarioDispositivo, idGrupo, activo: comparteUbicacion },
        update: { activo: comparteUbicacion },
      });

    if (comparteUbicacion) {
      await persist();
    } else {
      await this.privateLocationRemoval.notifyLostViewers([idUsuario], persist);
    }

    return this.requireItem(idUsuario, idUsuarioDispositivo, idGrupo);
  }

  async setMemberSharing(
    idUsuario: number,
    idUsuarioDispositivo: number,
    idGrupo: number,
    targetUserId: number,
    permitido: boolean,
  ): Promise<GroupSharingItemDto> {
    await this.getOwnedActiveAssignment(idUsuario, idUsuarioDispositivo);
    await this.assertOwnerCanShareGroup(idUsuario, idGrupo);

    if (targetUserId === idUsuario) {
      throw new BadRequestException('No puedes excluirte a ti mismo');
    }

    const target = await this.prisma.grupoUsuario.findUnique({
      where: { idGrupo_idUsuario: { idGrupo, idUsuario: targetUserId } },
    });

    if (!target?.estado) {
      throw new BadRequestException('El usuario no es miembro activo del grupo');
    }

    if (permitido) {
      await this.prisma.usuarioDispositivoGrupoExclusion.deleteMany({
        where: { idUsuarioDispositivo, idGrupo, idUsuarioExcluido: targetUserId },
      });
    } else {
      await this.privateLocationRemoval.notifyLostViewers([idUsuario], async () => {
        const existing = await this.prisma.usuarioDispositivoGrupoExclusion.findUnique({
          where: {
            idUsuarioDispositivo_idGrupo_idUsuarioExcluido: {
              idUsuarioDispositivo,
              idGrupo,
              idUsuarioExcluido: targetUserId,
            },
          },
        });

        if (!existing) {
          await this.prisma.usuarioDispositivoGrupoExclusion.create({
            data: { idUsuarioDispositivo, idGrupo, idUsuarioExcluido: targetUserId },
          });
        }
      });
    }

    return this.requireItem(idUsuario, idUsuarioDispositivo, idGrupo);
  }

  private async requireItem(
    idUsuario: number,
    idUsuarioDispositivo: number,
    idGrupo: number,
  ): Promise<GroupSharingItemDto> {
    const items = await this.list(idUsuario, idUsuarioDispositivo);
    const item = items.find((row) => row.idGrupo === idGrupo);

    if (!item) {
      throw new NotFoundException('Grupo no encontrado');
    }

    return item;
  }

  private async getOwnedActiveAssignment(idUsuario: number, idUsuarioDispositivo: number) {
    const row = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
    });

    if (!row) {
      throw new NotFoundException('Asignación no encontrada');
    }

    if (row.idUsuario !== idUsuario) {
      throw new ForbiddenException('No puedes modificar el sharing de esta asignación');
    }

    if (!row.estado) {
      throw new BadRequestException('No se puede actualizar una asignación desvinculada');
    }

    return row;
  }

  private async assertOwnerCanShareGroup(idUsuario: number, idGrupo: number) {
    const group = await this.prisma.grupo.findUnique({ where: { idGrupo } });

    if (!group) {
      throw new NotFoundException('Grupo no encontrado');
    }

    if (!group.estado) {
      throw new BadRequestException('El grupo no está activo');
    }

    const membership = await this.prisma.grupoUsuario.findUnique({
      where: { idGrupo_idUsuario: { idGrupo, idUsuario } },
    });

    if (!membership?.estado) {
      throw new ForbiddenException('No perteneces a este grupo');
    }
  }
}

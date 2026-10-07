import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoEmergencia, RolGrupo, VisibilidadPreferida } from '../common/enums.js';
import { GroupsService } from '../groups/groups.service.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { PrivateLocationRemovalNotifier } from '../locations/private-location-removal.notifier.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { GroupSharingService } from './group-sharing.service.js';

type User = { idUsuario: number; nombres: string; apellidos: string };
type Device = {
  idUsuarioDispositivo: number;
  idUsuario: number;
  visibilidadPreferida: string;
  estado: boolean;
  ubicacionActiva: boolean;
};
type Group = {
  idGrupo: number;
  nombre: string;
  descripcion: string | null;
  idCreador: number;
  estado: boolean;
  fechaCreacion: Date;
};
type Member = {
  idGrupoUsuario: number;
  idGrupo: number;
  idUsuario: number;
  rol: string;
  estado: boolean;
  fechaIngreso: Date;
  usuario: User;
};
type Grant = { idUsuarioDispositivo: number; idGrupo: number; activo: boolean };
type Exclusion = { idUsuarioDispositivo: number; idGrupo: number; idUsuarioExcluido: number };

const ana: User = { idUsuario: 1, nombres: 'Ana', apellidos: 'A' };
const bruno: User = { idUsuario: 2, nombres: 'Bruno', apellidos: 'B' };

describe('sharing de grupo: realtime al perder acceso normal', () => {
  let devices: Device[];
  let groups: Group[];
  let members: Member[];
  let grants: Grant[];
  let exclusions: Exclusion[];
  let emergencyActive: boolean;
  let emitLocationPrivateRemoved: ReturnType<typeof vi.fn>;
  let notifyLostViewers: ReturnType<typeof vi.fn>;
  let sharing: GroupSharingService;
  let groupService: GroupsService;
  const prismaHolder: { current: Record<string, unknown> | null } = { current: null };

  beforeEach(() => {
    devices = [
      {
        idUsuarioDispositivo: 10,
        idUsuario: 1,
        visibilidadPreferida: VisibilidadPreferida.GRUPO,
        estado: true,
        ubicacionActiva: true,
      },
    ];
    groups = [
      {
        idGrupo: 1,
        nombre: 'Familia',
        descripcion: null,
        idCreador: 1,
        estado: true,
        fechaCreacion: new Date(),
      },
      {
        idGrupo: 2,
        nombre: 'Amigos',
        descripcion: null,
        idCreador: 1,
        estado: true,
        fechaCreacion: new Date(),
      },
    ];
    members = [
      member(1, 1, 1, RolGrupo.ADMIN, ana),
      member(2, 1, 2, RolGrupo.MIEMBRO, bruno),
      member(3, 2, 1, RolGrupo.ADMIN, ana),
      member(4, 2, 2, RolGrupo.MIEMBRO, bruno),
    ];
    grants = [{ idUsuarioDispositivo: 10, idGrupo: 1, activo: true }];
    exclusions = [];
    emergencyActive = false;

    const prisma = createPrisma();
    prismaHolder.current = prisma as unknown as Record<string, unknown>;
    emitLocationPrivateRemoved = vi.fn();
    const locationAccess = new LocationAccessService(prisma as never);
    const realtime = new LocationRealtimeNotifier({ emitLocationPrivateRemoved } as never);
    const removal = new PrivateLocationRemovalNotifier(prisma as never, locationAccess, realtime);
    notifyLostViewers = vi.fn((ownerIds: number[], change: () => Promise<unknown>) =>
      removal.notifyLostViewers(ownerIds, change),
    );
    const removalPort = { notifyLostViewers } as unknown as PrivateLocationRemovalNotifier;
    sharing = new GroupSharingService(prisma as never, removalPort);
    groupService = new GroupsService(prisma as never, { createForUsers: vi.fn() } as never, removalPort);
  });

  it('activar un grupo no emite location.updated ni private.removed', async () => {
    grants = [];

    await sharing.setGroupSharing(1, 10, 1, true);

    expect(notifyLostViewers).not.toHaveBeenCalled();
    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
    expect(grants).toEqual([expect.objectContaining({ idGrupo: 1, activo: true })]);
  });

  it('F. apagar Familia avisa a quien pierde la última vía y no a quien conserva otro grupo', async () => {
    await sharing.setGroupSharing(1, 10, 1, false);

    expect(emitLocationPrivateRemoved).toHaveBeenCalledTimes(1);
    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 10 });

    emitLocationPrivateRemoved.mockClear();
    grants = [
      { idUsuarioDispositivo: 10, idGrupo: 1, activo: true },
      { idUsuarioDispositivo: 10, idGrupo: 2, activo: true },
    ];

    await sharing.setGroupSharing(1, 10, 1, false);

    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
  });

  it('excluir a un miembro emite private.removed solo si no le queda otra vía normal', async () => {
    await sharing.setMemberSharing(1, 10, 1, 2, false);

    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 10 });

    emitLocationPrivateRemoved.mockClear();
    exclusions = [];
    grants.push({ idUsuarioDispositivo: 10, idGrupo: 2, activo: true });

    await sharing.setMemberSharing(1, 10, 1, 2, false);

    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
  });

  it('G. expulsar a B emite private.removed si pierde la última vía', async () => {
    await groupService.removeMember(1, 1, 2);

    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 10 });
    expect(members.find((row) => row.idUsuario === 2 && row.idGrupo === 1)?.estado).toBe(false);
  });

  it('H. desactivar el grupo emite private.removed a quien solo veía por ese grupo', async () => {
    await groupService.update(1, 1, { estado: false });

    expect(groups.find((row) => row.idGrupo === 1)?.estado).toBe(false);
    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 10 });
  });

  it('J. con emergencia activa, apagar el grant no retira el marker privado del compañero', async () => {
    emergencyActive = true;

    await sharing.setGroupSharing(1, 10, 1, false);

    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
  });

  it('rechaza compartir o excluir fuera de las reglas del grupo', async () => {
    await expect(sharing.setGroupSharing(2, 10, 1, true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(sharing.setGroupSharing(1, 10, 99, true)).rejects.toBeInstanceOf(NotFoundException);

    groups[0].estado = false;
    await expect(sharing.setGroupSharing(1, 10, 1, true)).rejects.toBeInstanceOf(BadRequestException);
    groups[0].estado = true;

    members.find((row) => row.idGrupo === 1 && row.idUsuario === 1)!.estado = false;
    await expect(sharing.setGroupSharing(1, 10, 1, true)).rejects.toBeInstanceOf(ForbiddenException);
    members.find((row) => row.idGrupo === 1 && row.idUsuario === 1)!.estado = true;

    await expect(sharing.setMemberSharing(1, 10, 1, 1, false)).rejects.toBeInstanceOf(BadRequestException);
    await expect(sharing.setMemberSharing(1, 10, 1, 9, false)).rejects.toBeInstanceOf(BadRequestException);
  });

  function member(idGrupoUsuario: number, idGrupo: number, idUsuario: number, rol: string, usuario: User): Member {
    return {
      idGrupoUsuario,
      idGrupo,
      idUsuario,
      rol,
      estado: true,
      fechaIngreso: new Date(),
      usuario,
    };
  }

  function groupActive(idGrupo: number) {
    return groups.find((row) => row.idGrupo === idGrupo)?.estado === true;
  }

  function createPrisma() {
    return {
      usuarioDispositivo: {
        findUnique: async ({ where }: { where: { idUsuarioDispositivo: number } }) =>
          devices.find((row) => row.idUsuarioDispositivo === where.idUsuarioDispositivo) ?? null,
        findMany: async ({ where }: { where: { idUsuario?: { in: number[] }; estado?: boolean } }) =>
          devices.filter((row) => {
            if (where.estado != null && row.estado !== where.estado) {
              return false;
            }
            if (where.idUsuario?.in && !where.idUsuario.in.includes(row.idUsuario)) {
              return false;
            }
            return true;
          }),
      },
      usuarioContacto: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      grupo: {
        findUnique: async ({ where }: { where: { idGrupo: number } }) =>
          groups.find((row) => row.idGrupo === where.idGrupo) ?? null,
        update: async ({ where, data }: { where: { idGrupo: number }; data: Partial<Group> }) => {
          const row = groups.find((group) => group.idGrupo === where.idGrupo);
          Object.assign(row!, data);
          return { ...row, miembros: [] };
        },
      },
      grupoUsuario: {
        findUnique: async ({ where }: { where: { idGrupo_idUsuario: { idGrupo: number; idUsuario: number } } }) => {
          const key = where.idGrupo_idUsuario;
          const row = members.find(
            (memberRow) => memberRow.idGrupo === key.idGrupo && memberRow.idUsuario === key.idUsuario,
          );
          if (!row) {
            return null;
          }
          return { ...row, grupo: groups.find((group) => group.idGrupo === row.idGrupo) };
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          members
            .filter((row) => matchesMember(row, where))
            .map((row) => ({ ...row, grupo: groups.find((group) => group.idGrupo === row.idGrupo) })),
        count: async ({ where }: { where: { idGrupo: number; estado: boolean; rol: string } }) =>
          members.filter(
            (row) => row.idGrupo === where.idGrupo && row.estado === where.estado && row.rol === where.rol,
          ).length,
        update: async ({ where, data }: { where: { idGrupoUsuario: number }; data: Partial<Member> }) => {
          const row = members.find((memberRow) => memberRow.idGrupoUsuario === where.idGrupoUsuario);
          Object.assign(row!, data);
          return row;
        },
        updateMany: async ({ where, data }: { where: { idGrupo: number; estado: boolean }; data: Partial<Member> }) => {
          let count = 0;
          for (const row of members) {
            if (row.idGrupo === where.idGrupo && row.estado === where.estado) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return { count };
        },
      },
      grupoInvitacion: {
        updateMany: async () => ({ count: 0 }),
      },
      usuarioDispositivoGrupo: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          grants
            .filter((grant) => matchesGrant(grant, where))
            .map((grant) => ({
              ...grant,
              usuarioDispositivo: devices.find(
                (device) => device.idUsuarioDispositivo === grant.idUsuarioDispositivo,
              ),
            })),
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { idUsuarioDispositivo_idGrupo: { idUsuarioDispositivo: number; idGrupo: number } };
          create: Grant;
          update: Partial<Grant>;
        }) => {
          const key = where.idUsuarioDispositivo_idGrupo;
          const existing = grants.find(
            (grant) =>
              grant.idUsuarioDispositivo === key.idUsuarioDispositivo && grant.idGrupo === key.idGrupo,
          );
          if (!existing) {
            grants.push(create);
            return create;
          }
          Object.assign(existing, update);
          return existing;
        },
      },
      usuarioDispositivoGrupoExclusion: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          exclusions
            .filter((row) => matchesExclusion(row, where))
            .map((row) => ({
              ...row,
              usuarioExcluido: row.idUsuarioExcluido === 2 ? bruno : ana,
            })),
        findUnique: async ({
          where,
        }: {
          where: {
            idUsuarioDispositivo_idGrupo_idUsuarioExcluido: {
              idUsuarioDispositivo: number;
              idGrupo: number;
              idUsuarioExcluido: number;
            };
          };
        }) => {
          const key = where.idUsuarioDispositivo_idGrupo_idUsuarioExcluido;
          return (
            exclusions.find(
              (row) =>
                row.idUsuarioDispositivo === key.idUsuarioDispositivo &&
                row.idGrupo === key.idGrupo &&
                row.idUsuarioExcluido === key.idUsuarioExcluido,
            ) ?? null
          );
        },
        create: async ({ data }: { data: Exclusion }) => {
          exclusions.push(data);
          return data;
        },
        deleteMany: async ({
          where,
        }: {
          where: { idUsuarioDispositivo: number; idGrupo: number; idUsuarioExcluido: number };
        }) => {
          const before = exclusions.length;
          exclusions = exclusions.filter(
            (row) =>
              !(
                row.idUsuarioDispositivo === where.idUsuarioDispositivo &&
                row.idGrupo === where.idGrupo &&
                row.idUsuarioExcluido === where.idUsuarioExcluido
              ),
          );
          return { count: before - exclusions.length };
        },
      },
      emergencia: {
        findFirst: async ({ where }: { where: { idUsuarioDispositivo: number; estado: string } }) =>
          emergencyActive && where.estado === EstadoEmergencia.ACTIVA
            ? { idEmergencia: 1n, idUsuarioDispositivo: where.idUsuarioDispositivo }
            : null,
        findMany: async () => [],
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prismaHolder.current),
    };
  }

  function matchesMember(row: Member, where: Record<string, unknown>) {
    if (where.estado != null && row.estado !== where.estado) {
      return false;
    }
    if (typeof where.idUsuario === 'number' && row.idUsuario !== where.idUsuario) {
      return false;
    }
    const idUsuario = where.idUsuario as { not?: number; in?: number[] } | undefined;
    if (idUsuario && typeof idUsuario === 'object') {
      if (idUsuario.not != null && row.idUsuario === idUsuario.not) {
        return false;
      }
      if (idUsuario.in && !idUsuario.in.includes(row.idUsuario)) {
        return false;
      }
    }
    if (typeof where.idGrupo === 'number' && row.idGrupo !== where.idGrupo) {
      return false;
    }
    const idGrupo = where.idGrupo as { in?: number[] } | undefined;
    if (idGrupo?.in && !idGrupo.in.includes(row.idGrupo)) {
      return false;
    }
    const grupo = where.grupo as { estado?: boolean } | undefined;
    if (grupo?.estado === true && !groupActive(row.idGrupo)) {
      return false;
    }
    return true;
  }

  function matchesGrant(grant: Grant, where: Record<string, unknown>) {
    if (where.activo != null && grant.activo !== where.activo) {
      return false;
    }
    if (where.idUsuarioDispositivo != null && grant.idUsuarioDispositivo !== where.idUsuarioDispositivo) {
      return false;
    }
    const idGrupo = where.idGrupo as { in?: number[] } | undefined;
    if (idGrupo?.in && !idGrupo.in.includes(grant.idGrupo)) {
      return false;
    }
    const grupo = where.grupo as { estado?: boolean } | undefined;
    if (grupo?.estado === true && !groupActive(grant.idGrupo)) {
      return false;
    }
    const deviceWhere = where.usuarioDispositivo as
      | { estado?: boolean; ubicacionActiva?: boolean; visibilidadPreferida?: string; idUsuario?: { not: number } }
      | undefined;
    if (deviceWhere) {
      const device = devices.find((row) => row.idUsuarioDispositivo === grant.idUsuarioDispositivo);
      if (!device) {
        return false;
      }
      if (deviceWhere.estado != null && device.estado !== deviceWhere.estado) {
        return false;
      }
      if (deviceWhere.ubicacionActiva != null && device.ubicacionActiva !== deviceWhere.ubicacionActiva) {
        return false;
      }
      if (deviceWhere.visibilidadPreferida && device.visibilidadPreferida !== deviceWhere.visibilidadPreferida) {
        return false;
      }
      if (deviceWhere.idUsuario?.not != null && device.idUsuario === deviceWhere.idUsuario.not) {
        return false;
      }
    }
    return true;
  }

  function matchesExclusion(row: Exclusion, where: Record<string, unknown>) {
    if (typeof where.idUsuarioDispositivo === 'number' && row.idUsuarioDispositivo !== where.idUsuarioDispositivo) {
      return false;
    }
    const deviceIds = where.idUsuarioDispositivo as { in?: number[] } | undefined;
    if (deviceIds?.in && !deviceIds.in.includes(row.idUsuarioDispositivo)) {
      return false;
    }
    if (where.idUsuarioExcluido != null && row.idUsuarioExcluido !== where.idUsuarioExcluido) {
      return false;
    }
    const idGrupo = where.idGrupo as { in?: number[] } | undefined;
    if (idGrupo?.in && !idGrupo.in.includes(row.idGrupo)) {
      return false;
    }
    return true;
  }
});

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoInvitacion, RolGrupo, TipoNotificacion } from '../common/enums.js';
import { GroupsService } from './groups.service.js';

const group = {
  idGrupo: 5,
  nombre: 'Familia',
  descripcion: null,
  idCreador: 1,
  estado: true,
  fechaCreacion: new Date(),
  miembros: [],
};

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    idInvitacion: 9,
    idGrupo: 5,
    idUsuarioInvitador: 1,
    idUsuarioInvitado: 2,
    estado: EstadoInvitacion.PENDIENTE,
    fechaInvitacion: new Date(),
    fechaRespuesta: null,
    grupo: group,
    invitador: { idUsuario: 1, nombres: 'Ana', apellidos: 'A' },
    invitado: { idUsuario: 2, nombres: 'Bruno', apellidos: 'B' },
    ...overrides,
  };
}

describe('GroupsService', () => {
  let service: GroupsService;
  let prisma: Record<string, any>;
  let createForUsers: ReturnType<typeof vi.fn>;
  let notifyLostViewers: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      grupo: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      grupoUsuario: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      grupoInvitacion: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      usuario: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma)),
    };
    createForUsers = vi.fn().mockResolvedValue(null);
    notifyLostViewers = vi.fn(async (_ownerIds: number[], change: () => Promise<unknown>) => change());
    prisma.grupoUsuario.findMany.mockResolvedValue([]);
    service = new GroupsService(
      prisma as never,
      { createForUsers } as never,
      { notifyLostViewers } as never,
    );
  });

  it('crea grupo con el creador como ADMIN', async () => {
    prisma.grupo.create.mockResolvedValue({
      ...group,
      miembros: [{
        idGrupoUsuario: 1,
        idGrupo: 5,
        idUsuario: 1,
        rol: RolGrupo.ADMIN,
        estado: true,
        fechaIngreso: new Date(),
        usuario: { idUsuario: 1, nombres: 'Ana', apellidos: 'A' },
      }],
    });

    const created = await service.create(1, { nombre: 'Familia' });
    expect(prisma.grupo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idCreador: 1,
          miembros: { create: { idUsuario: 1, rol: RolGrupo.ADMIN } },
        }),
      }),
    );
    expect(created.nombre).toBe('Familia');
  });

  it('un MIEMBRO no puede invitar', async () => {
    prisma.grupoUsuario.findUnique.mockResolvedValue({
      estado: true,
      rol: RolGrupo.MIEMBRO,
      grupo: { estado: true },
    });

    await expect(service.invite(2, 5, { idUsuarioInvitado: 3 })).rejects.toThrow(ForbiddenException);
  });

  it('ADMIN invita, no duplica pendiente ni miembro activo', async () => {
    prisma.grupoUsuario.findUnique
      .mockResolvedValueOnce({ estado: true, rol: RolGrupo.ADMIN, grupo: { estado: true } })
      .mockResolvedValueOnce(null);
    prisma.usuario.findFirst.mockResolvedValue({ idUsuario: 2, estado: true });
    prisma.grupoInvitacion.findFirst.mockResolvedValue(null);
    prisma.grupoInvitacion.create.mockResolvedValue(invitation());

    await service.invite(1, 5, { idUsuarioInvitado: 2 });

    expect(createForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: TipoNotificacion.INVITACION_GRUPO,
        userIds: [2],
      }),
      prisma,
    );
  });

  it('rechaza invitación duplicada pendiente', async () => {
    prisma.grupoUsuario.findUnique
      .mockResolvedValueOnce({ estado: true, rol: RolGrupo.ADMIN, grupo: { estado: true } })
      .mockResolvedValueOnce(null);
    prisma.usuario.findFirst.mockResolvedValue({ idUsuario: 2, estado: true });
    prisma.grupoInvitacion.findFirst.mockResolvedValue(invitation());

    await expect(service.invite(1, 5, { idUsuarioInvitado: 2 })).rejects.toThrow(ConflictException);
  });

  it('aceptar crea membresía MIEMBRO y notifica ADMIN', async () => {
    prisma.grupoInvitacion.findUnique.mockResolvedValue(invitation());
    prisma.grupoInvitacion.update.mockResolvedValue(
      invitation({ estado: EstadoInvitacion.ACEPTADA }),
    );
    prisma.grupoUsuario.findUnique.mockResolvedValue(null);
    prisma.grupoUsuario.create.mockResolvedValue({});
    prisma.grupoUsuario.findMany.mockResolvedValue([{ idUsuario: 1 }]);

    await service.acceptInvitation(2, 9);

    expect(prisma.grupoUsuario.create).toHaveBeenCalledWith({
      data: { idGrupo: 5, idUsuario: 2, rol: RolGrupo.MIEMBRO },
    });
    expect(createForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: TipoNotificacion.NUEVO_MIEMBRO,
        userIds: [1],
      }),
      prisma,
    );
    expect(notifyLostViewers).not.toHaveBeenCalled();
  });

  it('un tercero no puede aceptar la invitación', async () => {
    prisma.grupoInvitacion.findUnique.mockResolvedValue(invitation());

    await expect(service.acceptInvitation(99, 9)).rejects.toThrow(ForbiddenException);
  });

  it('rechazar deja RECHAZADA', async () => {
    prisma.grupoInvitacion.findUnique.mockResolvedValue(invitation());
    prisma.grupoInvitacion.update.mockResolvedValue(
      invitation({ estado: EstadoInvitacion.RECHAZADA }),
    );

    const result = await service.rejectInvitation(2, 9);
    expect(result.estado).toBe(EstadoInvitacion.RECHAZADA);
  });

  it('ADMIN puede cancelar invitación pendiente', async () => {
    prisma.grupoInvitacion.findUnique.mockResolvedValue(invitation());
    prisma.grupoUsuario.findUnique.mockResolvedValue({
      estado: true,
      rol: RolGrupo.ADMIN,
      grupo: { estado: true },
    });
    prisma.grupoInvitacion.update.mockResolvedValue(
      invitation({ estado: EstadoInvitacion.CANCELADA }),
    );

    const result = await service.cancelInvitation(1, 9);
    expect(result.estado).toBe(EstadoInvitacion.CANCELADA);
  });

  it('un MIEMBRO no puede cancelar invitaciones', async () => {
    prisma.grupoInvitacion.findUnique.mockResolvedValue(invitation());
    prisma.grupoUsuario.findUnique.mockResolvedValue({
      estado: true,
      rol: RolGrupo.MIEMBRO,
      grupo: { estado: true },
    });

    await expect(service.cancelInvitation(2, 9)).rejects.toThrow(ForbiddenException);
  });

  it('no se puede expulsar al último ADMIN; si el último ADMIN sale, desactiva el grupo', async () => {
    prisma.grupoUsuario.findUnique
      .mockResolvedValueOnce({
        estado: true,
        rol: RolGrupo.ADMIN,
        grupo: { estado: true },
      })
      .mockResolvedValueOnce({
        idGrupoUsuario: 1,
        estado: true,
        rol: RolGrupo.ADMIN,
        usuario: { idUsuario: 1, nombres: 'Ana', apellidos: 'A' },
      });
    prisma.grupoUsuario.count.mockResolvedValue(1);
    prisma.grupo.update.mockResolvedValue(group);
    prisma.grupoUsuario.updateMany.mockResolvedValue({ count: 1 });
    prisma.grupoInvitacion.updateMany.mockResolvedValue({ count: 0 });
    prisma.grupoUsuario.update.mockResolvedValue({
      idGrupoUsuario: 1,
      idGrupo: 5,
      estado: false,
      rol: RolGrupo.ADMIN,
      usuario: { idUsuario: 1, nombres: 'Ana', apellidos: 'A' },
      fechaIngreso: new Date(),
    });

    prisma.grupoUsuario.findMany.mockResolvedValue([{ idUsuario: 1 }]);

    await service.removeMember(1, 5, 1);

    expect(notifyLostViewers).toHaveBeenCalledWith([1], expect.any(Function));
    expect(prisma.grupo.update).toHaveBeenCalledWith({
      where: { idGrupo: 5 },
      data: { estado: false },
    });
  });

  it('G. expulsar a un miembro calcula la audiencia antes del cambio', async () => {
    prisma.grupoUsuario.findUnique
      .mockResolvedValueOnce({
        estado: true,
        rol: RolGrupo.ADMIN,
        grupo: { estado: true },
      })
      .mockResolvedValueOnce({
        idGrupoUsuario: 2,
        estado: true,
        rol: RolGrupo.MIEMBRO,
        usuario: { idUsuario: 2, nombres: 'Bruno', apellidos: 'B' },
      });
    prisma.grupoUsuario.findMany.mockResolvedValue([{ idUsuario: 1 }, { idUsuario: 2 }]);
    prisma.grupoUsuario.update.mockResolvedValue({
      idGrupoUsuario: 2,
      idGrupo: 5,
      estado: false,
      rol: RolGrupo.MIEMBRO,
      fechaIngreso: new Date(),
      usuario: { idUsuario: 2, nombres: 'Bruno', apellidos: 'B' },
    });

    await service.removeMember(1, 5, 2);

    expect(notifyLostViewers).toHaveBeenCalledWith([1, 2], expect.any(Function));
    expect(createForUsers).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: TipoNotificacion.MIEMBRO_ELIMINADO, userIds: [2] }),
      prisma,
    );
  });

  it('H. desactivar el grupo calcula la audiencia de los miembros activos', async () => {
    prisma.grupoUsuario.findUnique.mockResolvedValue({
      estado: true,
      rol: RolGrupo.ADMIN,
      grupo: { estado: true },
    });
    prisma.grupoUsuario.findMany.mockResolvedValue([{ idUsuario: 1 }, { idUsuario: 2 }]);
    prisma.grupo.update.mockResolvedValue({
      ...group,
      estado: false,
      miembros: [],
    });

    await service.update(1, 5, { estado: false });

    expect(notifyLostViewers).toHaveBeenCalledWith([1, 2], expect.any(Function));
    expect(prisma.grupo.update).toHaveBeenCalled();
  });
});

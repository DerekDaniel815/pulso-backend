import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoContacto, EstadoEmergencia, VisibilidadPreferida } from '../common/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocationAccessService } from './location-access.service.js';

const assignmentA = {
  idUsuarioDispositivo: 10,
  idUsuario: 1,
  visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
  estado: true,
  ubicacionActiva: true,
};

describe('LocationAccessService', () => {
  let service: LocationAccessService;
  let prisma: {
    usuarioDispositivo: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    usuarioContacto: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
      grupoUsuario: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
      usuarioDispositivoGrupo: { findMany: ReturnType<typeof vi.fn> };
      usuarioDispositivoGrupoExclusion: { findMany: ReturnType<typeof vi.fn> };
      emergencia: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      usuarioDispositivo: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      usuarioContacto: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      grupoUsuario: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      usuarioDispositivoGrupo: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      usuarioDispositivoGrupoExclusion: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      emergencia: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    service = new LocationAccessService(prisma as unknown as PrismaService);
  });

  it('A. SOLO_YO: B no ve a A', async () => {
    prisma.emergencia.findFirst.mockResolvedValue(null);
    prisma.usuarioContacto.findUnique.mockResolvedValue(null);
    prisma.grupoUsuario.findFirst.mockResolvedValue(null);

    await expect(service.canViewAssignment(2, assignmentA)).resolves.toBe(false);
  });

  it('el propietario siempre ve su asignación', async () => {
    await expect(service.canViewAssignment(1, assignmentA)).resolves.toBe(true);
  });

  it('B. GRUPO sin grant no autoriza a un compañero de grupo', async () => {
    const groupAssignment = { ...assignmentA, visibilidadPreferida: VisibilidadPreferida.GRUPO };
    prisma.emergencia.findFirst.mockResolvedValue(null);
    prisma.usuarioContacto.findUnique.mockResolvedValue(null);
    prisma.grupoUsuario.findFirst.mockResolvedValue({ idGrupoUsuario: 1 });

    await expect(service.canViewAssignment(2, groupAssignment)).resolves.toBe(false);
  });

  it('C. contacto autorizado ve a A aunque sea SOLO_YO', async () => {
    prisma.emergencia.findFirst.mockResolvedValue(null);
    prisma.usuarioContacto.findUnique.mockResolvedValue({
      idUsuario1: 1,
      idUsuario2: 2,
      estado: EstadoContacto.ACEPTADO,
      usuario1ComparteUbicacion: true,
      usuario2ComparteUbicacion: false,
    });

    await expect(service.canViewAssignment(2, assignmentA)).resolves.toBe(true);
  });

  it('contacto ACEPTADO sin flag de compartir no ve ubicación ordinaria', async () => {
    prisma.emergencia.findFirst.mockResolvedValue(null);
    prisma.usuarioContacto.findUnique.mockResolvedValue({
      idUsuario1: 1,
      idUsuario2: 2,
      estado: EstadoContacto.ACEPTADO,
      usuario1ComparteUbicacion: false,
      usuario2ComparteUbicacion: false,
    });
    prisma.grupoUsuario.findFirst.mockResolvedValue(null);

    await expect(service.canViewAssignment(2, assignmentA)).resolves.toBe(false);
  });

  it('D. PUBLICO no concede payload privado a un extraño', async () => {
    const publico = { ...assignmentA, visibilidadPreferida: VisibilidadPreferida.PUBLICO };
    prisma.emergencia.findFirst.mockResolvedValue(null);
    prisma.usuarioContacto.findUnique.mockResolvedValue(null);
    prisma.grupoUsuario.findFirst.mockResolvedValue(null);

    await expect(service.canViewAssignment(2, publico)).resolves.toBe(false);

    const audience = await service.getPublicAudience(publico);
    expect(audience.isPublic).toBe(true);
    expect(audience.origen).toBe('PUBLICO');
    expect(audience.clavePublica).toBe('VIS-10');
  });

  it('E. emergencia activa: extraño no obtiene DTO privado; audiencia pública sí', async () => {
    prisma.emergencia.findFirst.mockResolvedValue({
      idEmergencia: 1n,
      codigoPublico: 'EME-ABC',
    });
    prisma.usuarioContacto.findUnique.mockResolvedValue(null);
    prisma.grupoUsuario.findFirst.mockResolvedValue(null);

    await expect(service.canViewAssignment(2, assignmentA)).resolves.toBe(false);

    const audience = await service.getPublicAudience(assignmentA);
    expect(audience.isPublic).toBe(true);
    expect(audience.origen).toBe('EMERGENCIA');
    expect(audience.codigoPublico).toBe('EME-ABC');
  });

  it('E. emergencia activa: contacto ACEPTADO sí ve detalle privado', async () => {
    prisma.emergencia.findFirst.mockResolvedValue({ idEmergencia: 1n });
    prisma.usuarioContacto.findUnique.mockResolvedValue({
      idUsuario1: 1,
      idUsuario2: 2,
      estado: EstadoContacto.ACEPTADO,
      usuario1ComparteUbicacion: false,
      usuario2ComparteUbicacion: false,
    });

    await expect(service.canViewAssignment(2, assignmentA)).resolves.toBe(true);
  });

  it('getAuthorizedPrivateViewerUserIds incluye owner, contacto que comparte y grant de grupo', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue({
      ...assignmentA,
      visibilidadPreferida: VisibilidadPreferida.GRUPO,
    });
    prisma.usuarioContacto.findMany.mockResolvedValue([
      {
        idUsuario1: 1,
        idUsuario2: 3,
        estado: EstadoContacto.ACEPTADO,
        usuario1ComparteUbicacion: true,
        usuario2ComparteUbicacion: false,
      },
    ]);
    prisma.usuarioDispositivoGrupo.findMany.mockResolvedValue([{ idGrupo: 8 }]);
    prisma.grupoUsuario.findMany.mockImplementation(async ({ where }: { where: { idUsuario?: number | { not: number } } }) => {
      if (where.idUsuario === 1) {
        return [{ idGrupo: 8 }];
      }
      if (typeof where.idUsuario === 'object' && where.idUsuario.not === 1) {
        return [{ idUsuario: 4, idGrupo: 8 }];
      }
      return [];
    });
    prisma.emergencia.findFirst.mockResolvedValue(null);

    const ids = await service.getAuthorizedPrivateViewerUserIds(10);

    expect(ids).toEqual(expect.arrayContaining([1, 3, 4]));
    expect(ids).toHaveLength(3);
  });

  it('getEffectiveVisibility no escribe visibilidadPreferida; emergencia fuerza PUBLICO', async () => {
    prisma.emergencia.findFirst.mockResolvedValue({ idEmergencia: 1n });

    await expect(service.getEffectiveVisibility(assignmentA)).resolves.toBe(
      VisibilidadPreferida.PUBLICO,
    );
    expect(assignmentA.visibilidadPreferida).toBe(VisibilidadPreferida.SOLO_YO);
  });

  it('F. sin emergencia, effective visibility es la persistida', async () => {
    prisma.emergencia.findFirst.mockResolvedValue(null);

    await expect(service.getEffectiveVisibility(assignmentA)).resolves.toBe(
      VisibilidadPreferida.SOLO_YO,
    );
  });
});

type DeviceRow = {
  idUsuarioDispositivo: number;
  idUsuario: number;
  visibilidadPreferida: string;
  estado: boolean;
  ubicacionActiva: boolean;
};

type MemberRow = { idGrupo: number; idUsuario: number; estado: boolean };
type GrantRow = { idUsuarioDispositivo: number; idGrupo: number; activo: boolean };
type ExclusionRow = { idUsuarioDispositivo: number; idGrupo: number; idUsuarioExcluido: number };
type GroupRow = { idGrupo: number; estado: boolean };
type ContactRow = {
  idUsuario1: number;
  idUsuario2: number;
  estado: string;
  usuario1ComparteUbicacion: boolean;
  usuario2ComparteUbicacion: boolean;
};
type EmergencyRow = { idUsuarioDispositivo: number; estado: string; codigoPublico?: string };

function createAccessHarness() {
  const devices: DeviceRow[] = [];
  const members: MemberRow[] = [];
  const grants: GrantRow[] = [];
  const exclusions: ExclusionRow[] = [];
  const groups: GroupRow[] = [];
  const contacts: ContactRow[] = [];
  const emergencies: EmergencyRow[] = [];

  const groupActive = (idGrupo: number) => groups.find((group) => group.idGrupo === idGrupo)?.estado === true;

  const prisma = {
    usuarioDispositivo: {
      findUnique: async ({ where }: { where: { idUsuarioDispositivo: number } }) =>
        devices.find((row) => row.idUsuarioDispositivo === where.idUsuarioDispositivo) ?? null,
      findMany: async ({ where }: { where: Record<string, any> }) =>
        devices.filter((row) => matchesDevice(row, where)),
    },
    usuarioContacto: {
      findUnique: async ({ where }: { where: { idUsuario1_idUsuario2?: { idUsuario1: number; idUsuario2: number } } }) => {
        const ids = where.idUsuario1_idUsuario2;
        if (!ids) {
          return null;
        }
        return (
          contacts.find((row) => row.idUsuario1 === ids.idUsuario1 && row.idUsuario2 === ids.idUsuario2) ??
          null
        );
      },
      findMany: async ({ where }: { where: { estado?: string; OR?: Array<{ idUsuario1?: number; idUsuario2?: number }> } }) =>
        contacts.filter((row) => {
          if (where.estado && row.estado !== where.estado) {
            return false;
          }
          const ids = (where.OR ?? []).flatMap((clause) =>
            [clause.idUsuario1, clause.idUsuario2].filter((id): id is number => id != null),
          );
          return ids.length === 0 || ids.includes(row.idUsuario1) || ids.includes(row.idUsuario2);
        }),
    },
    grupoUsuario: {
      findFirst: async ({ where }: { where: Record<string, any> }) => {
        const viewerId = where.grupo?.miembros?.some?.idUsuario as number | undefined;
        const hit = members.some(
          (member) =>
            member.idUsuario === where.idUsuario &&
            member.estado === true &&
            groupActive(member.idGrupo) &&
            members.some(
              (viewer) =>
                viewer.idGrupo === member.idGrupo && viewer.idUsuario === viewerId && viewer.estado,
            ),
        );
        return hit ? { idGrupoUsuario: 1 } : null;
      },
      findMany: async ({ where }: { where: Record<string, any> }) =>
        members.filter((member) => {
          if (where.estado != null && member.estado !== where.estado) {
            return false;
          }
          if (typeof where.idUsuario === 'number' && member.idUsuario !== where.idUsuario) {
            return false;
          }
          if (where.idUsuario?.not != null && member.idUsuario === where.idUsuario.not) {
            return false;
          }
          if (where.idUsuario?.in && !where.idUsuario.in.includes(member.idUsuario)) {
            return false;
          }
          if (typeof where.idGrupo === 'number' && member.idGrupo !== where.idGrupo) {
            return false;
          }
          if (where.idGrupo?.in && !where.idGrupo.in.includes(member.idGrupo)) {
            return false;
          }
          if (where.grupo?.estado === true && !groupActive(member.idGrupo)) {
            return false;
          }
          return true;
        }),
    },
    usuarioDispositivoGrupo: {
      findMany: async ({ where }: { where: Record<string, any> }) => {
        const rows = grants.filter((grant) => {
          if (where.activo != null && grant.activo !== where.activo) {
            return false;
          }
          if (
            where.idUsuarioDispositivo != null &&
            grant.idUsuarioDispositivo !== where.idUsuarioDispositivo
          ) {
            return false;
          }
          if (where.idGrupo?.in && !where.idGrupo.in.includes(grant.idGrupo)) {
            return false;
          }
          if (where.grupo?.estado === true && !groupActive(grant.idGrupo)) {
            return false;
          }
          if (where.usuarioDispositivo) {
            const device = devices.find(
              (row) => row.idUsuarioDispositivo === grant.idUsuarioDispositivo,
            );
            if (!device || !matchesDevice(device, where.usuarioDispositivo)) {
              return false;
            }
          }
          return true;
        });

        return rows.map((grant) => ({
          ...grant,
          usuarioDispositivo: devices.find(
            (row) => row.idUsuarioDispositivo === grant.idUsuarioDispositivo,
          ),
        }));
      },
    },
    usuarioDispositivoGrupoExclusion: {
      findMany: async ({ where }: { where: Record<string, any> }) =>
        exclusions.filter((row) => {
          if (
            where.idUsuarioDispositivo != null &&
            !Array.isArray(where.idUsuarioDispositivo?.in) &&
            row.idUsuarioDispositivo !== where.idUsuarioDispositivo
          ) {
            return false;
          }
          if (
            where.idUsuarioDispositivo?.in &&
            !where.idUsuarioDispositivo.in.includes(row.idUsuarioDispositivo)
          ) {
            return false;
          }
          if (where.idUsuarioExcluido != null && row.idUsuarioExcluido !== where.idUsuarioExcluido) {
            return false;
          }
          if (where.idGrupo?.in && !where.idGrupo.in.includes(row.idGrupo)) {
            return false;
          }
          return true;
        }),
    },
    emergencia: {
      findFirst: async ({ where }: { where: { idUsuarioDispositivo: number; estado: string } }) =>
        emergencies.find(
          (row) =>
            row.idUsuarioDispositivo === where.idUsuarioDispositivo && row.estado === where.estado,
        ) ?? null,
      findMany: async ({ where }: { where: { estado: string } }) =>
        emergencies
          .filter((row) => row.estado === where.estado)
          .map((row) => ({
            ...row,
            usuarioDispositivo: devices.find(
              (device) => device.idUsuarioDispositivo === row.idUsuarioDispositivo,
            ),
          })),
    },
  };

  return { prisma, devices, members, grants, exclusions, groups, contacts, emergencies };
}

function matchesDevice(row: DeviceRow, where: Record<string, any>) {
  if (where.estado != null && row.estado !== where.estado) {
    return false;
  }
  if (typeof where.idUsuario === 'number' && row.idUsuario !== where.idUsuario) {
    return false;
  }
  if (where.idUsuario?.in && !where.idUsuario.in.includes(row.idUsuario)) {
    return false;
  }
  if (where.idUsuario?.not != null && row.idUsuario === where.idUsuario.not) {
    return false;
  }
  if (where.ubicacionActiva != null && row.ubicacionActiva !== where.ubicacionActiva) {
    return false;
  }
  if (where.visibilidadPreferida && row.visibilidadPreferida !== where.visibilidadPreferida) {
    return false;
  }
  return true;
}

describe('sharing normal por grupo', () => {
  const familia = 1;
  const trabajo = 2;
  const amigos = 3;

  function base() {
    const harness = createAccessHarness();
    harness.groups.push(
      { idGrupo: familia, estado: true },
      { idGrupo: trabajo, estado: true },
      { idGrupo: amigos, estado: true },
    );
    harness.members.push(
      { idGrupo: familia, idUsuario: 1, estado: true },
      { idGrupo: familia, idUsuario: 2, estado: true },
      { idGrupo: trabajo, idUsuario: 1, estado: true },
      { idGrupo: trabajo, idUsuario: 3, estado: true },
      { idGrupo: amigos, idUsuario: 1, estado: true },
      { idGrupo: amigos, idUsuario: 2, estado: true },
    );
    harness.devices.push({
      idUsuarioDispositivo: 10,
      idUsuario: 1,
      visibilidadPreferida: VisibilidadPreferida.GRUPO,
      estado: true,
      ubicacionActiva: true,
    });
    harness.grants.push({ idUsuarioDispositivo: 10, idGrupo: familia, activo: true });
    return harness;
  }

  it('A. solo el grupo encendido ve la asignación', async () => {
    const harness = base();
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(true);
    await expect(service.canViewAssignment(3, harness.devices[0])).resolves.toBe(false);

    const visibleForFamilia = await service.findVisibleAssignments(2);
    const visibleForTrabajo = await service.findVisibleAssignments(3);
    expect(visibleForFamilia.map((row) => row.idUsuarioDispositivo)).toEqual([10]);
    expect(visibleForTrabajo).toEqual([]);
  });

  it('B. contacto directo en false no bloquea el grant de Familia', async () => {
    const harness = base();
    harness.contacts.push({
      idUsuario1: 1,
      idUsuario2: 2,
      estado: EstadoContacto.ACEPTADO,
      usuario1ComparteUbicacion: false,
      usuario2ComparteUbicacion: false,
    });
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(true);
  });

  it('C. la exclusión de Familia impide ver por ese grupo', async () => {
    const harness = base();
    harness.grants.push({ idUsuarioDispositivo: 10, idGrupo: amigos, activo: false });
    harness.exclusions.push({ idUsuarioDispositivo: 10, idGrupo: familia, idUsuarioExcluido: 2 });
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(false);
    const ids = await service.getAuthorizedPrivateViewerUserIds(10);
    expect(ids).not.toContain(2);
  });

  it('D. la exclusión de grupo no anula el sharing directo de contacto', async () => {
    const harness = base();
    harness.exclusions.push({ idUsuarioDispositivo: 10, idGrupo: familia, idUsuarioExcluido: 2 });
    harness.contacts.push({
      idUsuario1: 1,
      idUsuario2: 2,
      estado: EstadoContacto.ACEPTADO,
      usuario1ComparteUbicacion: true,
      usuario2ComparteUbicacion: false,
    });
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(true);
    const ids = await service.getAuthorizedPrivateViewerUserIds(10);
    expect(ids).toContain(2);
  });

  it('E. excluido de Familia sigue viendo si Amigos está compartido', async () => {
    const harness = base();
    harness.grants.push({ idUsuarioDispositivo: 10, idGrupo: amigos, activo: true });
    harness.exclusions.push({ idUsuarioDispositivo: 10, idGrupo: familia, idUsuarioExcluido: 2 });
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(true);
    const visible = await service.findVisibleAssignments(2);
    expect(visible.map((row) => row.idUsuarioDispositivo)).toEqual([10]);
  });

  it('I. un miembro nuevo del grupo compartido queda autorizado', async () => {
    const harness = base();
    harness.members.push({ idGrupo: familia, idUsuario: 5, estado: true });
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(5, harness.devices[0])).resolves.toBe(true);
  });

  it('un miembro que ya no está activo no ve, aunque quede su exclusión', async () => {
    const harness = base();
    harness.members.find((row) => row.idGrupo === familia && row.idUsuario === 2)!.estado = false;
    harness.exclusions.push({ idUsuarioDispositivo: 10, idGrupo: familia, idUsuarioExcluido: 2 });
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(false);
  });

  it('SOLO_YO ignora grants y PUBLICO no abre el DTO privado', async () => {
    const harness = base();
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);
    harness.devices[0].visibilidadPreferida = VisibilidadPreferida.SOLO_YO;
    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(false);

    harness.devices[0].visibilidadPreferida = VisibilidadPreferida.PUBLICO;
    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(false);
    await expect(service.getPublicAudience(harness.devices[0])).resolves.toMatchObject({
      isPublic: true,
      origen: 'PUBLICO',
    });
  });

  it('sin ubicacionActiva el grant de grupo no autoriza', async () => {
    const harness = base();
    harness.devices[0].ubicacionActiva = false;
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(false);
  });

  it('J. la emergencia sigue autorizando al compañero aunque esté excluido o en SOLO_YO', async () => {
    const harness = base();
    harness.devices[0].visibilidadPreferida = VisibilidadPreferida.SOLO_YO;
    harness.exclusions.push({ idUsuarioDispositivo: 10, idGrupo: familia, idUsuarioExcluido: 2 });
    harness.emergencies.push({
      idUsuarioDispositivo: 10,
      estado: EstadoEmergencia.ACTIVA,
      codigoPublico: 'EME-ABC',
    });
    const service = new LocationAccessService(harness.prisma as unknown as PrismaService);

    await expect(service.canViewAssignment(2, harness.devices[0])).resolves.toBe(true);
    await expect(service.canViewAssignment(9, harness.devices[0])).resolves.toBe(false);
    const ids = await service.getAuthorizedPrivateViewerUserIds(10);
    expect(ids).toContain(2);
    expect(ids).not.toContain(9);

    const visible = await service.findVisibleAssignments(2);
    expect(visible.map((row) => row.idUsuarioDispositivo)).toContain(10);
  });
});

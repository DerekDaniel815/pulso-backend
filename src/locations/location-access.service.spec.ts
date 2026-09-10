import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoContacto, VisibilidadPreferida } from '../common/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocationAccessService } from './location-access.service.js';

const assignmentA = {
  idUsuarioDispositivo: 10,
  idUsuario: 1,
  visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
  estado: true,
};

describe('LocationAccessService', () => {
  let service: LocationAccessService;
  let prisma: {
    usuarioDispositivo: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    usuarioContacto: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    grupoUsuario: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
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

  it('B. GRUPO: miembro autorizado ve a A', async () => {
    const groupAssignment = { ...assignmentA, visibilidadPreferida: VisibilidadPreferida.GRUPO };
    prisma.emergencia.findFirst.mockResolvedValue(null);
    prisma.usuarioContacto.findUnique.mockResolvedValue(null);
    prisma.grupoUsuario.findFirst.mockResolvedValue({ idGrupoUsuario: 1 });

    await expect(service.canViewAssignment(2, groupAssignment)).resolves.toBe(true);
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

  it('getAuthorizedPrivateViewerUserIds incluye owner, contacto que comparte y grupo', async () => {
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
    prisma.grupoUsuario.findMany
      .mockResolvedValueOnce([{ idGrupo: 8 }])
      .mockResolvedValueOnce([{ idUsuario: 4 }]);
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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoContacto, EstadoEmergencia, VisibilidadPreferida } from '../common/enums.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { PrivateLocationRemovalNotifier } from '../locations/private-location-removal.notifier.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { UserDevicesService } from './user-devices.service.js';

type Device = {
  idUsuarioDispositivo: number;
  idUsuario: number;
  idDispositivo: number;
  alias: string;
  visibilidadPreferida: string;
  ubicacionActiva: boolean;
  estado: boolean;
  fechaAsignacion: Date;
  fechaDesvinculacion: Date | null;
  dispositivo: {
    idDispositivo: number;
    codigoDispositivo: string;
    imei: null;
    modelo: null;
    numeroSerie: null;
    estado: string;
    ultimaConexion: null;
    fechaFabricacion: null;
    fechaRegistro: Date;
  };
};

type Member = { idGrupo: number; idUsuario: number; estado: boolean };
type Grant = { idUsuarioDispositivo: number; idGrupo: number; activo: boolean };
type Contact = {
  idUsuario1: number;
  idUsuario2: number;
  estado: string;
  usuario1ComparteUbicacion: boolean;
  usuario2ComparteUbicacion: boolean;
};

describe('cambio de visibilidadPreferida y marker privado', () => {
  let device: Device;
  let members: Member[];
  let grants: Grant[];
  let contacts: Contact[];
  let emergencyActive: boolean;
  let emitLocationPrivateRemoved: ReturnType<typeof vi.fn>;
  let emitLocationUpdated: ReturnType<typeof vi.fn>;
  let emitLocationPublicRemoved: ReturnType<typeof vi.fn>;
  let emitLocationPublicUpdated: ReturnType<typeof vi.fn>;
  let service: UserDevicesService;
  let locationAccess: LocationAccessService;

  beforeEach(() => {
    device = {
      idUsuarioDispositivo: 10,
      idUsuario: 1,
      idDispositivo: 5,
      alias: 'Pulsera',
      visibilidadPreferida: VisibilidadPreferida.GRUPO,
      ubicacionActiva: true,
      estado: true,
      fechaAsignacion: new Date('2026-09-10T12:00:00.000Z'),
      fechaDesvinculacion: null,
      dispositivo: {
        idDispositivo: 5,
        codigoDispositivo: 'PUL-TEST',
        imei: null,
        modelo: null,
        numeroSerie: null,
        estado: 'ASIGNADO',
        ultimaConexion: null,
        fechaFabricacion: null,
        fechaRegistro: new Date('2026-09-01T12:00:00.000Z'),
      },
    };
    members = [
      { idGrupo: 1, idUsuario: 1, estado: true },
      { idGrupo: 1, idUsuario: 2, estado: true },
    ];
    grants = [{ idUsuarioDispositivo: 10, idGrupo: 1, activo: true }];
    contacts = [];
    emergencyActive = false;

    const prisma = createPrisma();
    emitLocationPrivateRemoved = vi.fn();
    emitLocationUpdated = vi.fn();
    emitLocationPublicRemoved = vi.fn();
    emitLocationPublicUpdated = vi.fn();
    locationAccess = new LocationAccessService(prisma as never);
    const realtime = new LocationRealtimeNotifier({
      emitLocationPrivateRemoved,
      emitLocationUpdated,
      emitLocationPublicRemoved,
      emitLocationPublicUpdated,
    } as never);
    const removal = new PrivateLocationRemovalNotifier(prisma as never, locationAccess, realtime);
    service = new UserDevicesService(
      prisma as never,
      {} as never,
      locationAccess,
      realtime,
      removal,
    );
  });

  it('A. GRUPO → SOLO_YO retira el marker privado de quien solo veía por grupo', async () => {
    await service.update(1, 10, { visibilidadPreferida: VisibilidadPreferida.SOLO_YO });

    expect(emitLocationPrivateRemoved).toHaveBeenCalledTimes(1);
    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 10 });
    expect(emitLocationUpdated).not.toHaveBeenCalled();
  });

  it('B. GRUPO → SOLO_YO no retira a quien conserva el contacto directo', async () => {
    contacts.push({
      idUsuario1: 1,
      idUsuario2: 2,
      estado: EstadoContacto.ACEPTADO,
      usuario1ComparteUbicacion: true,
      usuario2ComparteUbicacion: false,
    });

    await service.update(1, 10, { visibilidadPreferida: VisibilidadPreferida.SOLO_YO });

    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
  });

  it('C. GRUPO → PUBLICO retira el privado de grupo y no toca la capa pública', async () => {
    await service.update(1, 10, { visibilidadPreferida: VisibilidadPreferida.PUBLICO });

    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 10 });
    expect(emitLocationPublicRemoved).not.toHaveBeenCalled();
    expect(emitLocationPublicUpdated).not.toHaveBeenCalled();
    expect(emitLocationUpdated).not.toHaveBeenCalled();
    await expect(locationAccess.getPublicAudience(device)).resolves.toMatchObject({
      isPublic: true,
      origen: 'PUBLICO',
      clavePublica: 'VIS-10',
    });
  });

  it('D. SOLO_YO → GRUPO no fabrica location.updated', async () => {
    device.visibilidadPreferida = VisibilidadPreferida.SOLO_YO;

    await service.update(1, 10, { visibilidadPreferida: VisibilidadPreferida.GRUPO });

    expect(emitLocationUpdated).not.toHaveBeenCalled();
    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
    await expect(locationAccess.canViewAssignment(2, device)).resolves.toBe(true);
  });

  it('E. con emergencia activa, GRUPO → SOLO_YO no retira el detalle privado del compañero', async () => {
    emergencyActive = true;

    await service.update(1, 10, { visibilidadPreferida: VisibilidadPreferida.SOLO_YO });

    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
    expect(emitLocationPublicRemoved).not.toHaveBeenCalled();
    await expect(locationAccess.canViewAssignment(2, device)).resolves.toBe(true);
    await expect(locationAccess.canViewAssignment(9, device)).resolves.toBe(false);
  });

  function createPrisma() {
    return {
      usuarioDispositivo: {
        findUnique: async ({ where }: { where: { idUsuarioDispositivo: number } }) =>
          where.idUsuarioDispositivo === device.idUsuarioDispositivo ? device : null,
        findMany: async ({ where }: { where: { idUsuario?: { in: number[] }; estado?: boolean } }) => {
          if (where.estado != null && device.estado !== where.estado) {
            return [];
          }
          if (where.idUsuario?.in && !where.idUsuario.in.includes(device.idUsuario)) {
            return [];
          }
          return [device];
        },
        update: async ({ data }: { data: Partial<Device> }) => {
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
              (device as Record<string, unknown>)[key] = value;
            }
          }
          return device;
        },
      },
      usuarioContacto: {
        findUnique: async ({
          where,
        }: {
          where: { idUsuario1_idUsuario2?: { idUsuario1: number; idUsuario2: number } };
        }) => {
          const ids = where.idUsuario1_idUsuario2;
          if (!ids) {
            return null;
          }
          return (
            contacts.find(
              (row) => row.idUsuario1 === ids.idUsuario1 && row.idUsuario2 === ids.idUsuario2,
            ) ?? null
          );
        },
        findMany: async ({
          where,
        }: {
          where: { estado?: string; OR?: Array<{ idUsuario1?: number; idUsuario2?: number }> };
        }) =>
          contacts.filter((row) => {
            if (where.estado && row.estado !== where.estado) {
              return false;
            }
            const ids = (where.OR ?? []).flatMap((clause) =>
              [clause.idUsuario1, clause.idUsuario2].filter((id): id is number => id != null),
            );
            return ids.includes(row.idUsuario1) || ids.includes(row.idUsuario2);
          }),
      },
      grupoUsuario: {
        findFirst: async ({ where }: { where: { idUsuario?: number; grupo?: { miembros?: { some?: { idUsuario?: number } } } } }) => {
          const viewerId = where.grupo?.miembros?.some?.idUsuario;
          const shares = members.some(
            (owner) =>
              owner.idUsuario === where.idUsuario &&
              owner.estado &&
              members.some(
                (viewer) =>
                  viewer.idGrupo === owner.idGrupo && viewer.idUsuario === viewerId && viewer.estado,
              ),
          );
          return shares ? { idGrupoUsuario: 1 } : null;
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          members.filter((row) => {
            if (where.estado != null && row.estado !== where.estado) {
              return false;
            }
            if (typeof where.idUsuario === 'number' && row.idUsuario !== where.idUsuario) {
              return false;
            }
            const idUsuario = where.idUsuario as { not?: number } | undefined;
            if (idUsuario && typeof idUsuario === 'object' && idUsuario.not != null && row.idUsuario === idUsuario.not) {
              return false;
            }
            const idGrupo = where.idGrupo as { in?: number[] } | undefined;
            if (idGrupo?.in && !idGrupo.in.includes(row.idGrupo)) {
              return false;
            }
            return true;
          }),
      },
      usuarioDispositivoGrupo: {
        findMany: async ({ where }: { where: { idUsuarioDispositivo?: number; activo?: boolean } }) =>
          grants.filter((grant) => {
            if (where.activo != null && grant.activo !== where.activo) {
              return false;
            }
            if (
              where.idUsuarioDispositivo != null &&
              grant.idUsuarioDispositivo !== where.idUsuarioDispositivo
            ) {
              return false;
            }
            return true;
          }),
      },
      usuarioDispositivoGrupoExclusion: {
        findMany: async () => [],
      },
      emergencia: {
        findFirst: async ({ where }: { where: { idUsuarioDispositivo: number; estado: string } }) =>
          emergencyActive &&
          where.idUsuarioDispositivo === device.idUsuarioDispositivo &&
          where.estado === EstadoEmergencia.ACTIVA
            ? { idEmergencia: 1n, codigoPublico: 'EME-ABC' }
            : null,
      },
    };
  }
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoContacto, VisibilidadPreferida } from '../common/enums.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { PrivateLocationRemovalNotifier } from '../locations/private-location-removal.notifier.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { ContactsService } from './contacts.service.js';

type Assignment = {
  idUsuarioDispositivo: number;
  idUsuario: number;
  visibilidadPreferida: string;
  estado: boolean;
};

type ContactRow = {
  idUsuarioContacto: number;
  idUsuario1: number;
  idUsuario2: number;
  idUsuarioSolicitante: number;
  estado: string;
  usuario1ComparteUbicacion: boolean;
  usuario2ComparteUbicacion: boolean;
  fechaSolicitud: Date;
  fechaRespuesta: Date | null;
  fechaActualizacion: Date;
};

const usuario1 = { idUsuario: 1, nombres: 'Ana', apellidos: 'A' };
const usuario2 = { idUsuario: 2, nombres: 'Bruno', apellidos: 'B' };

function withUsers(contact: ContactRow) {
  return { ...contact, usuario1, usuario2 };
}

describe('retiro realtime de marker privado por contacto', () => {
  let assignments: Assignment[];
  let contact: ContactRow;
  let groups: Map<number, number[]>;
  let emitLocationPrivateRemoved: ReturnType<typeof vi.fn>;
  let service: ContactsService;

  beforeEach(() => {
    assignments = [];
    groups = new Map();
    contact = {
      idUsuarioContacto: 10,
      idUsuario1: 1,
      idUsuario2: 2,
      idUsuarioSolicitante: 1,
      estado: EstadoContacto.ACEPTADO,
      usuario1ComparteUbicacion: true,
      usuario2ComparteUbicacion: false,
      fechaSolicitud: new Date(),
      fechaRespuesta: new Date(),
      fechaActualizacion: new Date(),
    };

    const prisma = {
      usuarioDispositivo: {
        findMany: vi.fn(async ({ where }: { where: { idUsuario: { in: number[] }; estado: boolean } }) =>
          assignments.filter(
            (row) => where.idUsuario.in.includes(row.idUsuario) && row.estado === where.estado,
          ),
        ),
        findUnique: vi.fn(async ({ where }: { where: { idUsuarioDispositivo: number } }) =>
          assignments.find((row) => row.idUsuarioDispositivo === where.idUsuarioDispositivo) ?? null,
        ),
      },
      usuarioContacto: {
        findUnique: vi.fn(async ({ where }: { where: { idUsuarioContacto?: number } }) => {
          if (where.idUsuarioContacto !== contact.idUsuarioContacto) {
            return null;
          }
          return withUsers(contact);
        }),
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: { estado: string; OR: Array<{ idUsuario1?: number; idUsuario2?: number }> };
          }) => {
            const userIds = where.OR.flatMap((clause) =>
              [clause.idUsuario1, clause.idUsuario2].filter((id): id is number => id != null),
            );
            if (contact.estado !== where.estado) {
              return [];
            }
            if (!userIds.includes(contact.idUsuario1) && !userIds.includes(contact.idUsuario2)) {
              return [];
            }
            return [contact];
          },
        ),
        update: vi.fn(async ({ data }: { data: Partial<ContactRow> }) => {
          Object.assign(contact, data);
          return withUsers(contact);
        }),
      },
      grupoUsuario: {
        findMany: vi.fn(async ({ where }: { where: { idUsuario?: number | { not: number }; idGrupo?: { in: number[] } } }) => {
          if (typeof where.idUsuario === 'number') {
            return [...groups.entries()]
              .filter(([, members]) => members.includes(where.idUsuario as number))
              .map(([idGrupo]) => ({ idGrupo }));
          }

          const excluded = typeof where.idUsuario === 'object' ? where.idUsuario.not : undefined;
          const peers: { idUsuario: number }[] = [];
          for (const idGrupo of where.idGrupo?.in ?? []) {
            for (const idUsuario of groups.get(idGrupo) ?? []) {
              if (idUsuario !== excluded) {
                peers.push({ idUsuario });
              }
            }
          }
          return peers;
        }),
      },
      emergencia: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    emitLocationPrivateRemoved = vi.fn();
    const locationAccess = new LocationAccessService(prisma as never);
    const realtime = new LocationRealtimeNotifier({ emitLocationPrivateRemoved } as never);
    const removal = new PrivateLocationRemovalNotifier(prisma as never, locationAccess, realtime);
    service = new ContactsService(prisma as never, { createForUsers: vi.fn() } as never, removal);
  });

  it('al apagar sharing, B recibe location.private.removed de cada asignación activa de A', async () => {
    assignments = [
      {
        idUsuarioDispositivo: 10,
        idUsuario: 1,
        visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
        estado: true,
      },
      {
        idUsuarioDispositivo: 11,
        idUsuario: 1,
        visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
        estado: true,
      },
      {
        idUsuarioDispositivo: 99,
        idUsuario: 1,
        visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
        estado: false,
      },
    ];

    await service.updateLocationPermission(1, 10, { comparteUbicacion: false });

    expect(emitLocationPrivateRemoved).toHaveBeenCalledTimes(2);
    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 10 });
    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 11 });
    expect(emitLocationPrivateRemoved).not.toHaveBeenCalledWith(1, expect.anything());
  });

  it('no emite removed si B sigue autorizado por GRUPO', async () => {
    assignments = [
      {
        idUsuarioDispositivo: 10,
        idUsuario: 1,
        visibilidadPreferida: VisibilidadPreferida.GRUPO,
        estado: true,
      },
    ];
    groups.set(8, [1, 2]);

    await service.updateLocationPermission(1, 10, { comparteUbicacion: false });

    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
  });

  it('al eliminar un contacto mutuo, cada uno recibe removed solo de las asignaciones que deja de ver', async () => {
    contact.usuario1ComparteUbicacion = true;
    contact.usuario2ComparteUbicacion = true;
    assignments = [
      {
        idUsuarioDispositivo: 10,
        idUsuario: 1,
        visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
        estado: true,
      },
      {
        idUsuarioDispositivo: 11,
        idUsuario: 1,
        visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
        estado: true,
      },
      {
        idUsuarioDispositivo: 20,
        idUsuario: 2,
        visibilidadPreferida: VisibilidadPreferida.SOLO_YO,
        estado: true,
      },
    ];

    await service.remove(1, 10);

    expect(emitLocationPrivateRemoved).toHaveBeenCalledTimes(3);
    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 10 });
    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(2, { idUsuarioDispositivo: 11 });
    expect(emitLocationPrivateRemoved).toHaveBeenCalledWith(1, { idUsuarioDispositivo: 20 });
    expect(emitLocationPrivateRemoved).not.toHaveBeenCalledWith(1, { idUsuarioDispositivo: 10 });
    expect(emitLocationPrivateRemoved).not.toHaveBeenCalledWith(2, { idUsuarioDispositivo: 20 });
  });

  it('no emite removed al eliminar si el acceso GRUPO continúa', async () => {
    contact.usuario1ComparteUbicacion = true;
    contact.usuario2ComparteUbicacion = true;
    assignments = [
      {
        idUsuarioDispositivo: 10,
        idUsuario: 1,
        visibilidadPreferida: VisibilidadPreferida.GRUPO,
        estado: true,
      },
      {
        idUsuarioDispositivo: 20,
        idUsuario: 2,
        visibilidadPreferida: VisibilidadPreferida.GRUPO,
        estado: true,
      },
    ];
    groups.set(8, [1, 2]);

    await service.remove(1, 10);

    expect(emitLocationPrivateRemoved).not.toHaveBeenCalled();
  });
});

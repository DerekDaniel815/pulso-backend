import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolSistema } from '../common/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { LocationsRealtimeGateway } from './locations-realtime.gateway.js';

const owner: AuthenticatedUser = {
  idUsuario: 1,
  correo: 'ana@pulso.test',
  nombres: 'Ana',
  apellidos: 'Pérez',
  rol: RolSistema.USUARIO,
};

function createClient(auth?: { token?: unknown }) {
  return {
    id: 'socket-1',
    handshake: { auth: auth ?? {} },
    data: {} as { user?: AuthenticatedUser },
    join: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  };
}

describe('LocationsRealtimeGateway', () => {
  let gateway: LocationsRealtimeGateway;
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };
  let usersService: { findActiveById: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    jwtService = { verifyAsync: vi.fn() };
    usersService = { findActiveById: vi.fn() };
    gateway = new LocationsRealtimeGateway(jwtService as never, usersService as never);
    gateway.server = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    } as never;
  });

  it('rechaza la conexión si falta el token', async () => {
    const client = createClient({});

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rechaza la conexión si el token es inválido', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));
    const client = createClient({ token: 'invalid' });

    await gateway.handleConnection(client as never);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('invalid');
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('conecta a un usuario válido y lo une a su room', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 1, correo: owner.correo, rol: owner.rol });
    usersService.findActiveById.mockResolvedValue({
      ...owner,
      telefono: null,
      estado: true,
      passwordHash: 'hash',
      fechaRegistro: new Date(),
      fechaActualizacion: new Date(),
    });
    const client = createClient({ token: 'valid-token' });

    await gateway.handleConnection(client as never);

    expect(usersService.findActiveById).toHaveBeenCalledWith(1);
    expect(client.data.user?.idUsuario).toBe(1);
    expect(client.join).toHaveBeenCalledWith('user:1');
    expect(client.join).toHaveBeenCalledWith('public:locations');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rechaza si el usuario no está activo o no existe', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 99, correo: 'x@test.com', rol: 'USUARIO' });
    usersService.findActiveById.mockResolvedValue(null);
    const client = createClient({ token: 'valid-but-inactive' });

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('emite location.updated a cada room de viewer autorizado', () => {
    const emit = vi.fn();
    gateway.server = { to: vi.fn().mockReturnValue({ emit }) } as never;

    gateway.emitLocationUpdated([1, 2, 1], {
      location: {
        idUbicacion: '6',
        idUsuarioDispositivo: 1,
        latitud: 37.421998,
        longitud: -122.084,
        altitud: 5,
        precisionGps: 5,
        velocidad: 0,
        fechaHoraDispositivo: '2026-09-10T06:00:00.000Z',
        fechaHoraServidor: '2026-09-10T06:00:01.000Z',
        fueSincronizadaOffline: false,
      },
      assignment: {
        idUsuarioDispositivo: 1,
        idUsuario: 1,
        alias: 'Derek gps simulado',
        codigoDispositivo: 'PUL-X7K4M92Q',
      },
    });

    expect(gateway.server.to).toHaveBeenCalledWith('user:1');
    expect(gateway.server.to).toHaveBeenCalledWith('user:2');
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('location.updated', expect.objectContaining({
      assignment: expect.objectContaining({ idUsuario: 1 }),
    }));
  });

  it('emite location.public.updated al room público', () => {
    const emit = vi.fn();
    gateway.server = { to: vi.fn().mockReturnValue({ emit }) } as never;

    gateway.emitLocationPublicUpdated({
      clavePublica: 'EME-ABC',
      origen: 'EMERGENCIA',
      codigoPublico: 'EME-ABC',
      ubicacion: {
        latitud: 4.6,
        longitud: -74.08,
        altitud: null,
        fechaHoraDispositivo: '2026-09-10T06:00:00.000Z',
      },
    });

    expect(gateway.server.to).toHaveBeenCalledWith('public:locations');
    expect(emit).toHaveBeenCalledWith('location.public.updated', expect.objectContaining({
      origen: 'EMERGENCIA',
    }));
  });
});

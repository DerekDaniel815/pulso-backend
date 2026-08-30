import { Test, TestingModule } from '@nestjs/testing';
import { CoordinatesGateway } from './coordinates.gateway.js';

describe('CoordinatesGateway', () => {
  let gateway: CoordinatesGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CoordinatesGateway],
    }).compile();

    gateway = module.get(CoordinatesGateway);
    gateway.server = {
      emit: vi.fn(),
    } as unknown as CoordinatesGateway['server'];
  });

  it('devuelve ack al unirse a una sala', () => {
    const client = { id: 'socket-1', join: vi.fn() };

    const response = gateway.handleJoin({ room: 'live' }, client as never);

    expect(client.join).toHaveBeenCalledWith('live');
    expect(response).toEqual({
      event: 'joined',
      data: { room: 'live', clientId: 'socket-1' },
    });
  });

  it('retransmite una coordenada a todos los clientes', () => {
    const client = { id: 'socket-1' };

    const response = gateway.handleCoordinate(
      {
        deviceId: 'device-1',
        lat: 19.43,
        lng: -99.13,
        status: 'moving',
      },
      client as never,
    );

    expect(response).toEqual({ ok: true });
    expect(gateway.server.emit).toHaveBeenCalledWith(
      'coordinate',
      expect.objectContaining({
        deviceId: 'device-1',
        lat: 19.43,
        lng: -99.13,
        status: 'moving',
        clientId: 'socket-1',
      }),
    );
  });
});

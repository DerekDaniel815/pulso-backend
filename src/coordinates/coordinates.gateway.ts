import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { CoordinatePayload } from './coordinate.types.js';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'coordinates',
})
export class CoordinatesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CoordinatesGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
    client.emit('connected', { clientId: client.id });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() payload: { room?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = payload?.room ?? 'live';
    void client.join(room);
    return { event: 'joined', data: { room, clientId: client.id } };
  }

  @SubscribeMessage('coordinate')
  handleCoordinate(
    @MessageBody() payload: CoordinatePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const coordinate: CoordinatePayload = {
      ...payload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    };

    this.server.emit('coordinate', {
      ...coordinate,
      clientId: client.id,
    });

    return { ok: true };
  }
}

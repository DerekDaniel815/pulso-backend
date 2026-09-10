import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { corsOrigins } from '../common/config/cors.js';
import { RolSistema } from '../common/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UsersService } from '../users/users.service.js';
import type { LocationUpdatedPayload } from './location-updated.payload.js';

type JwtPayload = {
  sub: number;
  correo: string;
  rol: string;
};

@WebSocketGateway({
  namespace: '/locations',
  cors: {
    origin: corsOrigins(),
    credentials: true,
  },
})
export class LocationsRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LocationsRealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log('[WS] client connecting');

    try {
      const user = await this.authenticate(client);
      client.data.user = user;
      const room = `user:${user.idUsuario}`;
      await client.join(room);
      this.logger.log(`[WS] authenticated userId=${user.idUsuario}`);
      this.logger.log(`[WS] joined room ${room}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data.user as AuthenticatedUser | undefined;

    if (user) {
      this.logger.log(`[WS] disconnected userId=${user.idUsuario}`);
      return;
    }

    this.logger.log('[WS] disconnected');
  }

  emitLocationUpdated(idUsuario: number, payload: LocationUpdatedPayload): void {
    this.server.to(`user:${idUsuario}`).emit('location.updated', payload);
  }

  private async authenticate(client: Socket): Promise<AuthenticatedUser> {
    const token = this.extractToken(client);

    if (!token) {
      throw new Error('Missing token');
    }

    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    const user = await this.usersService.findActiveById(payload.sub);

    if (!user) {
      throw new Error('Usuario no autorizado');
    }

    return {
      idUsuario: user.idUsuario,
      correo: user.correo,
      nombres: user.nombres,
      apellidos: user.apellidos,
      rol: user.rol as RolSistema,
    };
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    return undefined;
  }
}

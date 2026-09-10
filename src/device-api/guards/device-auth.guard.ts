import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedDevice } from '../../common/types/authenticated-device.js';
import { DeviceAuthService } from '../device-auth.service.js';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly deviceAuthService: DeviceAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; device?: AuthenticatedDevice }>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de dispositivo requerido');
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      throw new UnauthorizedException('Token de dispositivo requerido');
    }

    request.device = await this.deviceAuthService.authenticate(token);
    return true;
  }
}

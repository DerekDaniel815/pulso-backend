import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SimulationEnabledGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    if (this.configService.get<string>('ENABLE_DEVICE_SIMULATION') !== 'true') {
      throw new NotFoundException();
    }

    return true;
  }
}

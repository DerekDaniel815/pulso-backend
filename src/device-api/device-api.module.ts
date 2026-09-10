import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { EmergenciesModule } from '../emergencies/emergencies.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { DeviceApiController } from './device-api.controller.js';
import { DeviceApiService } from './device-api.service.js';
import { DeviceAuthService } from './device-auth.service.js';
import { DeviceAuthGuard } from './guards/device-auth.guard.js';

@Module({
  imports: [LocationsModule, EmergenciesModule, DevicesModule],
  controllers: [DeviceApiController],
  providers: [DeviceApiService, DeviceAuthService, DeviceAuthGuard],
  exports: [DeviceApiService],
})
export class DeviceApiModule {}

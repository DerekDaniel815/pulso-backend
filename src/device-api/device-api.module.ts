import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { EmergenciesModule } from '../emergencies/emergencies.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { UserDevicesModule } from '../user-devices/user-devices.module.js';
import { NetworkLocationJob } from '../locations/network-location.job.js';
import { NetworkLocationService } from '../locations/network-location.service.js';
import { DeviceApiController } from './device-api.controller.js';
import { DeviceApiService } from './device-api.service.js';
import { DeviceAuthService } from './device-auth.service.js';
import { DeviceAuthGuard } from './guards/device-auth.guard.js';

@Module({
  imports: [LocationsModule, EmergenciesModule, DevicesModule, UserDevicesModule],
  controllers: [DeviceApiController],
  providers: [
    DeviceApiService,
    DeviceAuthService,
    DeviceAuthGuard,
    NetworkLocationService,
    NetworkLocationJob,
  ],
  exports: [DeviceApiService],
})
export class DeviceApiModule {}

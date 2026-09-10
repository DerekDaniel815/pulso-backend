import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { LocationsRealtimeModule } from '../locations-realtime/locations-realtime.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UserDevicesController } from './user-devices.controller.js';
import { UserDevicesService } from './user-devices.service.js';

@Module({
  imports: [NotificationsModule, LocationsModule, LocationsRealtimeModule],
  controllers: [UserDevicesController],
  providers: [UserDevicesService],
  exports: [UserDevicesService],
})
export class UserDevicesModule {}

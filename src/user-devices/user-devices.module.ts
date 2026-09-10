import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UserDevicesController } from './user-devices.controller.js';
import { UserDevicesService } from './user-devices.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [UserDevicesController],
  providers: [UserDevicesService],
  exports: [UserDevicesService],
})
export class UserDevicesModule {}

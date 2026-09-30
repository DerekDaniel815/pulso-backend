import { Module } from '@nestjs/common';
import { LocationsRealtimeModule } from '../locations-realtime/locations-realtime.module.js';
import { PushModule } from '../push/push.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [LocationsRealtimeModule, PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

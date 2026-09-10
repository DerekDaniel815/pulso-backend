import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EmergenciesController } from './emergencies.controller.js';
import { EmergenciesService } from './emergencies.service.js';

@Module({
  imports: [NotificationsModule, LocationsModule],
  controllers: [EmergenciesController],
  providers: [EmergenciesService],
  exports: [EmergenciesService],
})
export class EmergenciesModule {}

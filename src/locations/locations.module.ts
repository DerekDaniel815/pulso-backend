import { Module } from '@nestjs/common';
import { LocationsRealtimeModule } from '../locations-realtime/locations-realtime.module.js';
import { LocationAccessService } from './location-access.service.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { PrivateLocationRemovalNotifier } from './private-location-removal.notifier.js';

@Module({
  imports: [LocationsRealtimeModule],
  controllers: [LocationsController],
  providers: [LocationsService, LocationAccessService, PrivateLocationRemovalNotifier],
  exports: [LocationsService, LocationAccessService, PrivateLocationRemovalNotifier],
})
export class LocationsModule {}

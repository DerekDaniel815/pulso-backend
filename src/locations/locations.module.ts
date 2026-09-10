import { Module } from '@nestjs/common';
import { LocationsRealtimeModule } from '../locations-realtime/locations-realtime.module.js';
import { LocationAccessService } from './location-access.service.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';

@Module({
  imports: [LocationsRealtimeModule],
  controllers: [LocationsController],
  providers: [LocationsService, LocationAccessService],
  exports: [LocationsService, LocationAccessService],
})
export class LocationsModule {}

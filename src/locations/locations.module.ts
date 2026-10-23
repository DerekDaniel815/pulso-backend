import { Module, forwardRef } from '@nestjs/common';
import { EmergenciesModule } from '../emergencies/emergencies.module.js';
import { LocationsRealtimeModule } from '../locations-realtime/locations-realtime.module.js';
import { LocationAccessService } from './location-access.service.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { PrivateLocationRemovalNotifier } from './private-location-removal.notifier.js';

@Module({
  imports: [LocationsRealtimeModule, forwardRef(() => EmergenciesModule)],
  controllers: [LocationsController],
  providers: [LocationsService, LocationAccessService, PrivateLocationRemovalNotifier],
  exports: [LocationsService, LocationAccessService, PrivateLocationRemovalNotifier],
})
export class LocationsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { LocationsRealtimeModule } from '../locations-realtime/locations-realtime.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EmergenciesController } from './emergencies.controller.js';
import { EmergencyExpirationJob } from './emergency-expiration.job.js';
import { EmergencyExpirationService } from './emergency-expiration.service.js';
import { EMERGENCY_SWEEP } from './emergency-sweep.token.js';
import { EmergenciesService } from './emergencies.service.js';

@Module({
  imports: [NotificationsModule, forwardRef(() => LocationsModule), LocationsRealtimeModule],
  controllers: [EmergenciesController],
  providers: [
    EmergenciesService,
    EmergencyExpirationService,
    EmergencyExpirationJob,
    { provide: EMERGENCY_SWEEP, useExisting: EmergencyExpirationService },
  ],
  exports: [EmergenciesService, EmergencyExpirationService, EMERGENCY_SWEEP],
})
export class EmergenciesModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { LocationRealtimeNotifier } from './location-realtime-notifier.service.js';
import { LocationsRealtimeGateway } from './locations-realtime.gateway.js';

@Module({
  imports: [AuthModule, UsersModule],
  providers: [LocationsRealtimeGateway, LocationRealtimeNotifier],
  exports: [LocationRealtimeNotifier, LocationsRealtimeGateway],
})
export class LocationsRealtimeModule {}

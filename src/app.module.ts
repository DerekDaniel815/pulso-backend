import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ContactsModule } from './contacts/contacts.module.js';
import { DeviceApiModule } from './device-api/device-api.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { EmergenciesModule } from './emergencies/emergencies.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SimulationModule } from './simulation/simulation.module.js';
import { UserDevicesModule } from './user-devices/user-devices.module.js';
import { UsersModule } from './users/users.module.js';

const simulationImports =
  process.env.ENABLE_DEVICE_SIMULATION === 'true' ? [SimulationModule] : [];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DevicesModule,
    DeviceApiModule,
    UserDevicesModule,
    ContactsModule,
    GroupsModule,
    LocationsModule,
    EmergenciesModule,
    NotificationsModule,
    ...simulationImports,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

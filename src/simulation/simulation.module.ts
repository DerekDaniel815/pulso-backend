import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DeviceApiModule } from '../device-api/device-api.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SimulationEnabledGuard } from './guards/simulation-enabled.guard.js';
import { SimulationController } from './simulation.controller.js';
import { SimulationExpirationJob } from './simulation-expiration.job.js';
import { SimulationSessionService } from './simulation-session.service.js';
import { SimulationService } from './simulation.service.js';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot(), DeviceApiModule, PrismaModule],
  controllers: [SimulationController],
  providers: [
    SimulationService,
    SimulationSessionService,
    SimulationExpirationJob,
    SimulationEnabledGuard,
  ],
})
export class SimulationModule {}

import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, RolesGuard],
  exports: [DevicesService],
})
export class DevicesModule {}

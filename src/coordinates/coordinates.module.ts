import { Module } from '@nestjs/common';
import { CoordinatesGateway } from './coordinates.gateway.js';

@Module({
  providers: [CoordinatesGateway],
})
export class CoordinatesModule {}

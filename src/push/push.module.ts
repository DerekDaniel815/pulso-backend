import { Module } from '@nestjs/common';
import { ExpoPushClient } from './expo-push.client.js';
import { PushTokensController } from './push.controller.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [PushTokensController],
  providers: [PushService, ExpoPushClient],
  exports: [PushService],
})
export class PushModule {}

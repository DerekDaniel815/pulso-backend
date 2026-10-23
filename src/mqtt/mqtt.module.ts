// Prototipo aparte. AppModule no lo importa: HTTPS sigue siendo el único transporte.
import { Module } from '@nestjs/common';
import { DeviceApiModule } from '../device-api/device-api.module.js';
import { MqttIngressService } from './mqtt-ingress.service.js';
import { MqttPublisher } from './mqtt-publisher.service.js';
import { MqttWebhookController } from './mqtt-webhook.controller.js';

@Module({
  imports: [DeviceApiModule],
  controllers: [MqttWebhookController],
  providers: [MqttIngressService, MqttPublisher],
})
export class MqttModule {}

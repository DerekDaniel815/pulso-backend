import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { MqttIngressService } from './mqtt-ingress.service.js';

class MqttUplinkDto {
  @IsString()
  @MaxLength(16)
  username!: string;

  @IsString()
  @MaxLength(80)
  topic!: string;

  @IsString()
  @MaxLength(80)
  payloadBase64!: string;
}

function decodePayload(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new BadRequestException('Carga MQTT ilegible');
  }
  const payload = Buffer.from(value, 'base64');
  const normalized = payload.toString('base64').replace(/=+$/, '');
  if (payload.length === 0 || normalized !== value.replace(/=+$/, '')) {
    throw new BadRequestException('Carga MQTT ilegible');
  }
  return payload;
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  const left = Buffer.from(provided ?? '');
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

@Controller('internal/mqtt')
export class MqttWebhookController {
  constructor(private readonly ingress: MqttIngressService) {}

  @Post('uplink')
  @HttpCode(200)
  async uplink(
    @Headers('x-pulso-mqtt-secret') secret: string | undefined,
    @Body() body: MqttUplinkDto,
  ) {
    const expected = process.env.MQTT_WEBHOOK_SECRET;
    if (!expected) {
      throw new ServiceUnavailableException('El ingreso MQTT está desactivado');
    }
    if (!secretMatches(secret, expected)) {
      throw new UnauthorizedException('Credencial del broker rechazada');
    }
    return this.ingress.ingest(body.username, body.topic, decodePayload(body.payloadBase64));
  }
}

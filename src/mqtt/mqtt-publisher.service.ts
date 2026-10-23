import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { MqttClient } from 'mqtt';

@Injectable()
export class MqttPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(MqttPublisher.name);
  private client: MqttClient | null = null;
  private connecting: Promise<MqttClient | null> | null = null;

  async publish(topic: string, payload: Buffer): Promise<void> {
    const client = await this.connect();
    if (!client) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, payload, { qos: 1 }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) {
      return;
    }
    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
  }

  private connect(): Promise<MqttClient | null> {
    const url = process.env.MQTT_BROKER_URL;
    const username = process.env.MQTT_BACKEND_USERNAME;
    const password = process.env.MQTT_BACKEND_PASSWORD;
    if (!url || !username || !password) {
      return Promise.resolve(null);
    }
    if (this.client?.connected) {
      return Promise.resolve(this.client);
    }
    if (this.connecting) {
      return this.connecting;
    }
    this.connecting = import('mqtt').then(
      (mqtt) =>
        new Promise<MqttClient | null>((resolve) => {
          const client = mqtt.connect(url, {
            username,
            password,
            clientId: 'pulso-backend',
            rejectUnauthorized: true,
            reconnectPeriod: 0,
            connectTimeout: 10000,
          });
          const fail = () => {
            client.end(true);
            this.client = null;
            this.logger.warn('No se pudo publicar la orden MQTT. La ubicación ya procesada no se revierte.');
            resolve(null);
          };
          client.once('connect', () => {
            this.client = client;
            resolve(client);
          });
          client.once('error', fail);
        }),
    ).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }
}

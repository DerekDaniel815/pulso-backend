import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NetworkLocationService } from './network-location.service.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class NetworkLocationJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NetworkLocationJob.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly networkLocation: NetworkLocationService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.handleTick();
    }, SIX_HOURS_MS);
    this.logger.log('[NETWORK] Depuración de coordenadas Google cada 6 h, retención 30 días');
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async handleTick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.networkLocation.purgeExpired();
    } catch (error) {
      this.logger.error(
        'No se pudieron depurar las coordenadas de red',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}

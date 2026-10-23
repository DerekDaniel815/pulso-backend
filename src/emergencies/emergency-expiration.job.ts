import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmergencyExpirationService } from './emergency-expiration.service.js';

const DEFAULT_INTERVAL_MS = 60_000;

@Injectable()
export class EmergencyExpirationJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmergencyExpirationJob.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly expiration: EmergencyExpirationService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const configured = this.configService.get<string>('EMERGENCY_EXPIRE_INTERVAL_MS');
    const intervalMs = configured ? Number.parseInt(configured, 10) : DEFAULT_INTERVAL_MS;
    const safeIntervalMs =
      Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;

    this.timer = setInterval(() => {
      void this.handleTick();
    }, safeIntervalMs);
    this.logger.log(`[EMERGENCY] expiration job every ${safeIntervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async handleTick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.expiration.sweepOverdue();
    } catch (error) {
      this.logger.error(
        'Error expirando emergencias',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}

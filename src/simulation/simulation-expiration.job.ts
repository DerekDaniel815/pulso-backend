import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SimulationSessionService } from './simulation-session.service.js';

const DEFAULT_EXPIRE_INTERVAL_MS = 10_000;

@Injectable()
export class SimulationExpirationJob implements OnModuleInit {
  private readonly logger = new Logger(SimulationExpirationJob.name);
  private running = false;

  constructor(
    private readonly simulationSessionService: SimulationSessionService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('ENABLE_DEVICE_SIMULATION') !== 'true') {
      return;
    }

    const configured = this.configService.get<string>('SIMULATION_EXPIRE_INTERVAL_MS');
    const intervalMs = configured
      ? Number.parseInt(configured, 10)
      : DEFAULT_EXPIRE_INTERVAL_MS;
    const safeIntervalMs =
      Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_EXPIRE_INTERVAL_MS;

    const interval = setInterval(() => {
      void this.handleExpirationTick();
    }, safeIntervalMs);

    this.schedulerRegistry.addInterval('simulation-expiration', interval);
    this.logger.log(`[SIM SESSION] expiration job every ${safeIntervalMs}ms`);
  }

  async handleExpirationTick(): Promise<void> {
    if (this.configService.get<string>('ENABLE_DEVICE_SIMULATION') !== 'true') {
      return;
    }

    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.simulationSessionService.expireSessions();
    } catch (error) {
      this.logger.error(
        'Error expirando sesiones de simulación',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}

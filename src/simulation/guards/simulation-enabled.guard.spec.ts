import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { SimulationEnabledGuard } from './simulation-enabled.guard.js';

describe('SimulationEnabledGuard', () => {
  let guard: SimulationEnabledGuard;

  beforeEach(() => {
    guard = new SimulationEnabledGuard({
      get: (key: string) => (key === 'ENABLE_DEVICE_SIMULATION' ? 'false' : undefined),
    } as ConfigService);
  });

  it('responde 404 cuando el feature flag está desactivado', () => {
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it('permite el acceso cuando el feature flag está activo', () => {
    const enabledGuard = new SimulationEnabledGuard({
      get: (key: string) => (key === 'ENABLE_DEVICE_SIMULATION' ? 'true' : undefined),
    } as ConfigService);

    expect(enabledGuard.canActivate()).toBe(true);
  });
});

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedDevice } from '../types/authenticated-device.js';

export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedDevice => {
    const request = ctx.switchToHttp().getRequest<{ device: AuthenticatedDevice }>();
    return request.device;
  },
);

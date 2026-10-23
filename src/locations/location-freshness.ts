import { BadRequestException } from '@nestjs/common';
import type { LocationResponseDto } from './dto/location-response.dto.js';

export const DEFAULT_LOCATION_LIVE_TTL_SECONDS = 90;
export const DEFAULT_EMERGENCY_MAX_ACTIVE_DAYS = 30;
export const MAX_FUTURE_DEVICE_TIMESTAMP_MS = 2 * 60 * 1000;

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

export function locationLiveTtlSeconds(): number {
  return readPositiveInt('LOCATION_LIVE_TTL_SECONDS', DEFAULT_LOCATION_LIVE_TTL_SECONDS);
}

export function emergencyMaxActiveDays(): number {
  return readPositiveInt('EMERGENCY_MAX_ACTIVE_DAYS', DEFAULT_EMERGENCY_MAX_ACTIVE_DAYS);
}

export function liveCutoff(now = new Date(), ttlSeconds = locationLiveTtlSeconds()): Date {
  return new Date(now.getTime() - ttlSeconds * 1000);
}

export function emergencyExpiryCutoff(now = new Date(), days = emergencyMaxActiveDays()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function assertDeviceTimestampNotInFuture(iso: string, now = new Date()): void {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) {
    throw new BadRequestException('La hora del dispositivo no es válida');
  }
  if (time > now.getTime() + MAX_FUTURE_DEVICE_TIMESTAMP_MS) {
    throw new BadRequestException('La hora del dispositivo está demasiado en el futuro');
  }
}

export function applyLiveMetadata(
  location: LocationResponseDto,
  now = new Date(),
  ttlSeconds = locationLiveTtlSeconds(),
): LocationResponseDto {
  const received = Date.parse(location.fechaHoraServidor);
  const expiresAt = Number.isFinite(received)
    ? new Date(received + ttlSeconds * 1000).toISOString()
    : null;
  const isLive =
    location.fueSincronizadaOffline === false &&
    Number.isFinite(received) &&
    received >= now.getTime() - ttlSeconds * 1000;

  return {
    ...location,
    isLive,
    liveExpiresAt: location.fueSincronizadaOffline ? null : expiresAt,
  };
}

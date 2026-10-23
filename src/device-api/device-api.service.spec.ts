import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoDispositivo } from '../common/enums.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { DeviceApiService } from './device-api.service.js';

const assignedDevice: AuthenticatedDevice = {
  idDispositivo: 5,
  codigoDispositivo: 'PUL-X7K4M92Q',
  idUsuarioDispositivo: 1,
  idUsuario: 1,
  dispositivoEstado: EstadoDispositivo.ASIGNADO,
  ubicacionActiva: true,
};

describe('DeviceApiService reportLocation', () => {
  let createForAssignment: ReturnType<typeof vi.fn>;
  let service: DeviceApiService;

  beforeEach(() => {
    createForAssignment = vi.fn().mockResolvedValue({
      fechaHoraServidor: '2026-09-10T06:00:01.000Z',
    });
    service = new DeviceApiService(
      { createForAssignment } as never,
      {} as never,
      {} as never,
      { hasActiveEmergency: vi.fn().mockResolvedValue(false) } as never,
    );
  });

  it('persiste vía LocationsService.createForAssignment (mismo punto que el simulador)', async () => {
    await service.reportLocation(assignedDevice, {
      latitude: 37.421998,
      longitude: -122.084,
      accuracy: 5,
      deviceTimestamp: '2026-09-10T06:00:00.000Z',
    });

    expect(createForAssignment).toHaveBeenCalledOnce();
    expect(createForAssignment).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        latitud: 37.421998,
        longitud: -122.084,
        fechaHoraDispositivo: '2026-09-10T06:00:00.000Z',
      }),
    );
  });

  it('con ubicacionActiva=false no guarda la ubicación e informa tracking y emergencia', async () => {
    const hasActiveEmergency = vi.fn().mockResolvedValue(true);
    service = new DeviceApiService(
      { createForAssignment } as never,
      {} as never,
      {} as never,
      { hasActiveEmergency } as never,
    );

    await expect(
      service.reportLocation({ ...assignedDevice, ubicacionActiva: false }, {
        latitude: 37.42,
        longitude: -122.08,
        accuracy: 5,
        deviceTimestamp: '2026-09-10T06:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Seguimiento desactivado',
        trackingEnabled: false,
        emergencyActive: true,
      },
    });
    expect(createForAssignment).not.toHaveBeenCalled();
  });
});

describe('DeviceApiService heartbeat', () => {
  it('devuelve trackingEnabled y emergencyActive sin aceptar una ubicación', async () => {
    const touchConnection = vi.fn().mockResolvedValue(new Date('2026-10-23T05:00:00.000Z'));
    const hasActiveEmergency = vi.fn().mockResolvedValue(false);
    const service = new DeviceApiService(
      { createForAssignment: vi.fn() } as never,
      {} as never,
      { touchConnection } as never,
      { hasActiveEmergency } as never,
    );

    await expect(service.heartbeat({ ...assignedDevice, ubicacionActiva: false })).resolves.toEqual({
      ok: true,
      ultimaConexion: '2026-10-23T05:00:00.000Z',
      trackingEnabled: false,
      emergencyActive: false,
    });
  });
});

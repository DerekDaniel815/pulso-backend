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
  let storeDeviceLocation: ReturnType<typeof vi.fn>;
  let touchConnection: ReturnType<typeof vi.fn>;
  let service: DeviceApiService;

  beforeEach(() => {
    storeDeviceLocation = vi.fn().mockResolvedValue({
      location: { fechaHoraServidor: '2026-09-10T06:00:01.000Z' },
      created: true,
    });
    touchConnection = vi.fn().mockResolvedValue(new Date('2026-09-10T06:00:02.000Z'));
    service = new DeviceApiService(
      { storeDeviceLocation } as never,
      {} as never,
      { touchConnection } as never,
      { hasActiveEmergency: vi.fn().mockResolvedValue(false) } as never,
    );
  });

  it('persiste vía LocationsService.storeDeviceLocation (mismo punto que el simulador)', async () => {
    await service.reportLocation(assignedDevice, {
      latitude: 37.421998,
      longitude: -122.084,
      accuracy: 5,
      deviceTimestamp: '2026-09-10T06:00:00.000Z',
    });

    expect(storeDeviceLocation).toHaveBeenCalledOnce();
    expect(touchConnection).toHaveBeenCalledWith(5);
    expect(storeDeviceLocation).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        latitud: 37.421998,
        longitud: -122.084,
        fechaHoraDispositivo: '2026-09-10T06:00:00.000Z',
      }),
    );
  });

  it('repite clientLocationId sin tocar la conexión ni crear otra fila', async () => {
    storeDeviceLocation.mockResolvedValue({
      location: { fechaHoraServidor: '2026-09-10T05:00:00.000Z' },
      created: false,
    });

    await expect(
      service.reportLocation(assignedDevice, {
        latitude: 37.421998,
        longitude: -122.084,
        deviceTimestamp: '2026-09-10T06:00:00.000Z',
        clientLocationId: 'b0000000100000001',
      }),
    ).resolves.toEqual({
      ok: true,
      receivedAt: '2026-09-10T05:00:00.000Z',
      trackingEnabled: true,
      emergencyActive: false,
    });
    expect(touchConnection).not.toHaveBeenCalled();
  });

  it('con ubicacionActiva=false no guarda la ubicación e informa tracking y emergencia', async () => {
    const hasActiveEmergency = vi.fn().mockResolvedValue(true);
    service = new DeviceApiService(
      { storeDeviceLocation } as never,
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
    expect(storeDeviceLocation).not.toHaveBeenCalled();
    expect(touchConnection).not.toHaveBeenCalled();
  });

  it('una ubicación aceptada actualiza la conexión y devuelve el estado de seguimiento', async () => {
    const hasActiveEmergency = vi.fn().mockResolvedValue(false);
    service = new DeviceApiService(
      { storeDeviceLocation } as never,
      {} as never,
      { touchConnection } as never,
      { hasActiveEmergency } as never,
    );

    await expect(
      service.reportLocation(assignedDevice, {
        latitude: 37.421998,
        longitude: -122.084,
        deviceTimestamp: '2026-09-10T06:00:00.000Z',
      }),
    ).resolves.toEqual({
      ok: true,
      receivedAt: '2026-09-10T06:00:01.000Z',
      trackingEnabled: true,
      emergencyActive: false,
    });
    expect(touchConnection).toHaveBeenCalledWith(5);
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

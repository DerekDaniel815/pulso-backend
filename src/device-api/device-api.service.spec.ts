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
      {} as never,
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
        fuente: 'GNSS',
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

  it('con ubicacionActiva=false y sin emergencia no guarda la ubicación', async () => {
    const hasActiveEmergency = vi.fn().mockResolvedValue(false);
    service = new DeviceApiService(
      { storeDeviceLocation } as never,
      {} as never,
      { touchConnection } as never,
      { hasActiveEmergency } as never,
      {} as never,
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
        emergencyActive: false,
      },
    });
    expect(storeDeviceLocation).not.toHaveBeenCalled();
    expect(touchConnection).not.toHaveBeenCalled();
  });

  it('durante una emergencia activa guarda CELL aunque el seguimiento periódico esté apagado', async () => {
    const hasActiveEmergency = vi.fn().mockResolvedValue(true);
    service = new DeviceApiService(
      { storeDeviceLocation } as never,
      {} as never,
      { touchConnection } as never,
      { hasActiveEmergency } as never,
      {} as never,
    );

    await service.reportLocation({ ...assignedDevice, ubicacionActiva: false }, {
      latitude: -12.0,
      longitude: -77.0,
      accuracy: 550,
      locationSource: 'CELL',
      deviceTimestamp: '2026-09-10T06:00:00.000Z',
      offlineSync: false,
      clientLocationId: 'b0000000100000009',
    });

    expect(storeDeviceLocation).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        precisionGps: 550,
        fuente: 'CELL',
        clientLocationId: 'b0000000100000009',
        fueSincronizadaOffline: false,
      }),
    );
  });

  it('rechaza CELL sin precisión positiva', async () => {
    await expect(
      service.reportLocation(assignedDevice, {
        latitude: -12.0,
        longitude: -77.0,
        locationSource: 'CELL',
        deviceTimestamp: '2026-09-10T06:00:00.000Z',
      }),
    ).rejects.toThrow(/precisión positiva/);
    expect(storeDeviceLocation).not.toHaveBeenCalled();
  });

  it('guarda CELL sintético sin intercambiar latitud y longitud', async () => {
    await service.reportLocation(assignedDevice, {
      latitude: -11.95,
      longitude: -76.99,
      accuracy: 550,
      locationSource: 'CELL',
      deviceTimestamp: '2026-09-10T06:00:00.000Z',
    });

    expect(storeDeviceLocation).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        latitud: -11.95,
        longitud: -76.99,
        precisionGps: 550,
        fuente: 'CELL',
      }),
    );
  });

  it('rechaza CELL fuera del recuadro de servicio y conserva GNSS fuera de ese recuadro', async () => {
    await expect(
      service.reportLocation(assignedDevice, {
        latitude: -76.99,
        longitude: -11.95,
        accuracy: 550,
        locationSource: 'CELL',
        deviceTimestamp: '2026-09-10T06:00:00.000Z',
      }),
    ).rejects.toThrow(/área de servicio/);
    expect(storeDeviceLocation).not.toHaveBeenCalled();

    await service.reportLocation(assignedDevice, {
      latitude: 37.42,
      longitude: -122.08,
      accuracy: 5,
      locationSource: 'GNSS',
      deviceTimestamp: '2026-09-10T06:01:00.000Z',
    });
    expect(storeDeviceLocation).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        latitud: 37.42,
        longitud: -122.08,
        fuente: 'GNSS',
      }),
    );
  });

  it('una ubicación aceptada actualiza la conexión y devuelve el estado de seguimiento', async () => {
    const hasActiveEmergency = vi.fn().mockResolvedValue(false);
    service = new DeviceApiService(
      { storeDeviceLocation } as never,
      {} as never,
      { touchConnection } as never,
      { hasActiveEmergency } as never,
      {} as never,
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

describe('DeviceApiService ordenes del monitor', () => {
  it('encender o apagar seguimiento usa el mismo update de la app', async () => {
    const update = vi.fn().mockResolvedValue({ ubicacionActiva: false });
    const hasActiveEmergency = vi.fn().mockResolvedValue(false);
    const service = new DeviceApiService(
      {} as never,
      {} as never,
      {} as never,
      { hasActiveEmergency } as never,
      { update } as never,
    );

    await expect(service.setTracking(assignedDevice, false)).resolves.toEqual({
      ok: true,
      trackingEnabled: false,
      emergencyActive: false,
    });
    expect(update).toHaveBeenCalledWith(1, 1, { ubicacionActiva: false });
  });

  it('apagar SOS finaliza la emergencia del dispositivo y conserva el seguimiento', async () => {
    const finishForDevice = vi.fn().mockResolvedValue(undefined);
    const hasActiveEmergency = vi.fn().mockResolvedValue(false);
    const service = new DeviceApiService(
      {} as never,
      { finishForDevice } as never,
      {} as never,
      { hasActiveEmergency } as never,
      {} as never,
    );

    await expect(service.finishEmergency(assignedDevice)).resolves.toEqual({
      ok: true,
      trackingEnabled: true,
      emergencyActive: false,
    });
    expect(finishForDevice).toHaveBeenCalledWith(1);
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
      {} as never,
    );

    await expect(service.heartbeat({ ...assignedDevice, ubicacionActiva: false })).resolves.toEqual({
      ok: true,
      ultimaConexion: '2026-10-23T05:00:00.000Z',
      trackingEnabled: false,
      emergencyActive: false,
    });
  });
});

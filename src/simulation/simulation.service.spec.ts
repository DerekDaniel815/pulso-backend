import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoDispositivo } from '../common/enums.js';
import { DeviceApiService } from '../device-api/device-api.service.js';
import type { DeviceEmergencyDto } from '../device-api/dto/device-emergency.dto.js';
import type { DeviceLocationDto } from '../device-api/dto/device-location.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SimulationSessionService } from './simulation-session.service.js';
import { SimulationService } from './simulation.service.js';

const locationDto: DeviceLocationDto = {
  latitude: 4.6097,
  longitude: -74.0817,
  accuracy: 10,
  deviceTimestamp: '2026-09-09T18:45:20-05:00',
};

const emergencyDto: DeviceEmergencyDto = {
  type: 'SOS',
  deviceTimestamp: '2026-09-09T18:47:12-05:00',
  location: {
    latitude: 4.6097,
    longitude: -74.0817,
    accuracy: 12,
  },
};

const mockSession = {
  idSimulationSession: 99,
  idUsuarioDispositivo: 10,
  estado: 'ACTIVA',
  ultimaActividad: '2026-09-10T12:00:00.000Z',
  expiraEn: '2026-09-10T12:00:45.000Z',
  fechaInicio: '2026-09-10T12:00:00.000Z',
  fechaFin: null,
};

function buildAssignment(overrides: {
  idUsuario?: number;
  idUsuarioDispositivo?: number;
  estado?: boolean;
  ubicacionActiva?: boolean;
  dispositivoEstado?: string;
}) {
  return {
    idUsuario: overrides.idUsuario ?? 1,
    idUsuarioDispositivo: overrides.idUsuarioDispositivo ?? 10,
    idDispositivo: 5,
    estado: overrides.estado ?? true,
    ubicacionActiva: overrides.ubicacionActiva ?? true,
    dispositivo: {
      idDispositivo: 5,
      codigoDispositivo: 'PUL-TEST1234',
      estado: overrides.dispositivoEstado ?? EstadoDispositivo.ASIGNADO,
    },
  };
}

describe('SimulationService', () => {
  let simulationService: SimulationService;
  let deviceApiService: DeviceApiService;
  let simulationSessionService: SimulationSessionService;
  let createForAssignment: ReturnType<typeof vi.fn>;
  let reportEmergency: ReturnType<typeof vi.fn>;
  let ensureSession: ReturnType<typeof vi.fn>;
  let prisma: { usuarioDispositivo: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    prisma = {
      usuarioDispositivo: {
        findUnique: vi.fn(),
      },
    };

    createForAssignment = vi.fn().mockResolvedValue({
      idUbicacion: 1,
      fechaHoraServidor: '2026-09-09T23:45:21.000Z',
    });

    reportEmergency = vi.fn().mockResolvedValue({
      codigoPublico: 'EME-A1B2C3D4',
      estado: 'ACTIVA',
      receivedAt: '2026-09-09T23:47:13.000Z',
    });

    ensureSession = vi.fn().mockResolvedValue(mockSession);

    deviceApiService = new DeviceApiService(
      { createForAssignment } as never,
      { createForDevice: reportEmergency } as never,
      {} as never,
    );

    simulationSessionService = {
      ensureSession,
      renewSession: ensureSession,
      getActiveSession: vi.fn(),
      endSession: vi.fn(),
      setTracking: vi.fn(),
    } as unknown as SimulationSessionService;

    simulationService = new SimulationService(
      prisma as unknown as PrismaService,
      deviceApiService,
      simulationSessionService,
    );
  });

  it('C. location simulada renueva lease vía ensureSession', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(
      buildAssignment({ ubicacionActiva: true }),
    );

    await simulationService.reportLocation(1, 10, locationDto);

    expect(ensureSession).toHaveBeenCalledWith(1, 10);
  });

  it('permite simular la asignación propia con ubicacionActiva=true', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(
      buildAssignment({ ubicacionActiva: true }),
    );

    const result = await simulationService.reportLocation(1, 10, locationDto);

    expect(result.ok).toBe(true);
    expect(result.receivedAt).toBe('2026-09-09T23:45:21.000Z');
  });

  it('D. SOS simulada pasa idSimulationSession a DeviceApiService', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(
      buildAssignment({ ubicacionActiva: false }),
    );

    const result = await simulationService.reportEmergency(1, 10, emergencyDto);

    expect(result.codigoPublico).toBe('EME-A1B2C3D4');
    expect(reportEmergency).toHaveBeenCalledWith(
      1,
      10,
      5,
      'SOS',
      expect.any(Object),
      99,
    );
  });

  it('heartbeat devuelve ok y expiresAt', async () => {
    const result = await simulationService.heartbeat(1, 10);

    expect(result).toEqual({
      ok: true,
      expiresAt: '2026-09-10T12:00:45.000Z',
    });
  });

  it('rechaza simular la asignación de otro usuario', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(
      buildAssignment({ idUsuario: 2 }),
    );

    await expect(simulationService.reportLocation(1, 10, locationDto)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechaza location cuando ubicacionActiva=false', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(
      buildAssignment({ ubicacionActiva: false }),
    );

    await expect(simulationService.reportLocation(1, 10, locationDto)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('permite SOS aunque ubicacionActiva=false', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(
      buildAssignment({ ubicacionActiva: false }),
    );

    const result = await simulationService.reportEmergency(1, 10, emergencyDto);

    expect(result.codigoPublico).toBe('EME-A1B2C3D4');
    expect(result.estado).toBe('ACTIVA');
  });

  it('responde not found si la asignación no existe', async () => {
    prisma.usuarioDispositivo.findUnique.mockResolvedValue(null);

    await expect(simulationService.reportLocation(1, 10, locationDto)).rejects.toThrow(
      NotFoundException,
    );
  });
});

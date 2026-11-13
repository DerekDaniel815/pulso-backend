import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Emergencia, Ubicacion } from '../generated/prisma/client.js';
import { EstadoEmergencia } from '../common/enums.js';
import { toPublicEmergencyResponse } from './dto/emergency-response.dto.js';
import { EmergenciesService } from './emergencies.service.js';

const now = new Date('2026-11-13T04:00:00.000Z');

function emergency(estado: string): Emergencia {
  return {
    idEmergencia: 50n,
    codigoPublico: 'EME-B1334920',
    idUsuarioDispositivo: 13,
    idSimulationSession: null,
    tipo: 'SOS',
    estado,
    fechaInicio: new Date('2026-10-28T02:05:43.946Z'),
    fechaFin: estado === EstadoEmergencia.FINALIZADA ? new Date('2026-11-13T04:05:02.589Z') : null,
    activadaDesde: 'DISPOSITIVO',
    motivoFinalizacion: estado === EstadoEmergencia.FINALIZADA ? 'MANUAL_APP' : null,
    finalizadaDesde: estado === EstadoEmergencia.FINALIZADA ? 'APP' : null,
    descripcion: null,
  };
}

function location(server: string, device: string): Ubicacion {
  return {
    idUbicacion: 9n,
    idUsuarioDispositivo: 13,
    latitud: 1 as never,
    longitud: 2 as never,
    altitud: null,
    precisionGps: 12 as never,
    velocidad: null,
    fechaHoraDispositivo: new Date(device),
    fechaHoraServidor: new Date(server),
    fueSincronizadaOffline: false,
    clientLocationId: null,
    fuente: 'GNSS',
  };
}

describe('respuesta pública de emergencia', () => {
  it('conserva una coordenada viva sin cambiar sus fechas', () => {
    const result = toPublicEmergencyResponse(
      emergency(EstadoEmergencia.ACTIVA),
      location('2026-11-13T03:59:50.000Z', '2026-11-13T03:59:40.000Z'),
      now,
    );

    expect(result.estado).toBe('ACTIVA');
    expect(result.clavePublica).toBe('EME-B1334920');
    expect(result.ubicacion).toMatchObject({
      fechaHoraServidor: '2026-11-13T03:59:50.000Z',
      fechaHoraDispositivo: '2026-11-13T03:59:40.000Z',
      isLive: true,
      liveExpiresAt: '2026-11-13T04:00:15.000Z',
      locationSource: 'GNSS',
      isApproximate: false,
      precisionGps: 12,
    });
  });

  it('marca como vencida una coordenada antigua y no renueva su fecha', () => {
    const result = toPublicEmergencyResponse(
      emergency(EstadoEmergencia.ACTIVA),
      location('2026-10-28T02:10:12.094Z', '2026-10-28T02:10:06.000Z'),
      now,
    );

    expect(result.estado).toBe('ACTIVA');
    expect(result.ubicacion).toMatchObject({
      fechaHoraServidor: '2026-10-28T02:10:12.094Z',
      fechaHoraDispositivo: '2026-10-28T02:10:06.000Z',
      isLive: false,
      liveExpiresAt: '2026-10-28T02:10:37.094Z',
      locationSource: 'GNSS',
    });
    expect(result.fechaUltimaUbicacion).toBe('2026-10-28T02:10:06.000Z');
  });

  it('informa una emergencia activa sin coordenada', () => {
    const result = toPublicEmergencyResponse(emergency(EstadoEmergencia.ACTIVA), null, now);

    expect(result.ubicacion).toBeNull();
    expect(result.fechaUltimaUbicacion).toBeNull();
    expect(result.estado).toBe('ACTIVA');
  });

  it('una coordenada nueva reemplaza la anterior con su propia frescura', () => {
    const known = toPublicEmergencyResponse(
      emergency(EstadoEmergencia.ACTIVA),
      location('2026-10-28T02:10:12.094Z', '2026-10-28T02:10:06.000Z'),
      now,
    );
    const fresh = toPublicEmergencyResponse(
      emergency(EstadoEmergencia.ACTIVA),
      location('2026-11-13T03:59:50.000Z', '2026-11-13T03:59:40.000Z'),
      now,
    );

    expect(known.ubicacion?.isLive).toBe(false);
    expect(fresh.ubicacion?.isLive).toBe(true);
    expect(fresh.ubicacion?.fechaHoraServidor).not.toBe(known.ubicacion?.fechaHoraServidor);
    expect(fresh.ubicacion?.fechaHoraDispositivo).toBe('2026-11-13T03:59:40.000Z');
  });
});

describe('EmergenciesService visibilidad pública', () => {
  function serviceWith(rows: Emergencia[]) {
    const findMany = vi.fn().mockResolvedValue(rows.filter((row) => row.estado === EstadoEmergencia.ACTIVA));
    const findUnique = vi.fn(async ({ where }: { where: { codigoPublico: string } }) =>
      rows.find((row) => row.codigoPublico === where.codigoPublico) ?? null,
    );
    const prisma = {
      emergencia: { findMany, findUnique },
    };
    const service = new EmergenciesService(
      prisma as never,
      {} as never,
      {} as never,
      { publishLatestForAssignment: vi.fn() } as never,
      { notifyEmergencyPublicUpdated: vi.fn(), notifyEmergencyPublicEnded: vi.fn() } as never,
      { sweepOverdue: vi.fn(), finalizeIfActive: vi.fn() } as never,
    );
    vi.spyOn(service as never, 'findLatestLocation').mockResolvedValue(null);
    return { service, findMany };
  }

  it('no publica una emergencia finalizada', async () => {
    const { service, findMany } = serviceWith([
      emergency(EstadoEmergencia.FINALIZADA),
    ]);

    await expect(service.findPublic()).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { estado: EstadoEmergencia.ACTIVA },
    }));
    await expect(service.findPublicByCode('EME-B1334920')).rejects.toBeInstanceOf(NotFoundException);
  });
});

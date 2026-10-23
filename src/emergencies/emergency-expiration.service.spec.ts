import { describe, expect, it, vi } from 'vitest';
import { FinalizadaDesde, MotivoFinalizacionEmergencia } from '../common/enums.js';
import { EmergencyExpirationService } from './emergency-expiration.service.js';

describe('EmergencyExpirationService', () => {
  function setup() {
    const updateMany = vi.fn();
    const findUnique = vi.fn();
    const findMany = vi.fn();
    const findFirst = vi.fn().mockResolvedValue(null);
    const publishAfterEmergencyEnded = vi.fn();
    const notifyEmergencyPublicEnded = vi.fn();
    const service = new EmergencyExpirationService(
      {
        emergencia: { updateMany, findUnique, findMany },
        ubicacion: { findFirst },
      } as never,
      { publishAfterEmergencyEnded } as never,
      { notifyEmergencyPublicEnded } as never,
    );
    return { service, updateMany, findUnique, findMany, publishAfterEmergencyEnded, notifyEmergencyPublicEnded };
  }

  it('dos cierres concurrentes emiten el fin una sola vez', async () => {
    const { service, updateMany, findUnique, publishAfterEmergencyEnded, notifyEmergencyPublicEnded } = setup();
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    findUnique.mockResolvedValue({
      idEmergencia: 4n,
      codigoPublico: 'EME-1',
      idUsuarioDispositivo: 10,
      tipo: 'SOS',
      estado: 'FINALIZADA',
      activadaDesde: 'APP',
      descripcion: null,
      fechaInicio: new Date('2026-10-01T00:00:00.000Z'),
      fechaFin: new Date('2026-10-22T00:00:00.000Z'),
      motivoFinalizacion: 'MANUAL_APP',
      finalizadaDesde: 'APP',
    });

    const input = {
      motivoFinalizacion: MotivoFinalizacionEmergencia.MANUAL_APP,
      finalizadaDesde: FinalizadaDesde.APP,
    };
    const [first, second] = await Promise.all([
      service.finalizeIfActive(4n, input),
      service.finalizeIfActive(4n, input),
    ]);

    expect(first?.estado).toBe('FINALIZADA');
    expect(second).toBeNull();
    expect(notifyEmergencyPublicEnded).toHaveBeenCalledOnce();
    expect(notifyEmergencyPublicEnded).toHaveBeenCalledWith('EME-1');
    expect(publishAfterEmergencyEnded).toHaveBeenCalledOnce();
  });

  it('el barrido marca EXPIRADA y SISTEMA solo a las activas vencidas', async () => {
    const { service, findMany, updateMany, findUnique } = setup();
    findMany.mockResolvedValue([{ idEmergencia: 8n }]);
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({
      idEmergencia: 8n,
      codigoPublico: 'EME-OLD',
      idUsuarioDispositivo: 10,
      tipo: 'SOS',
      estado: 'FINALIZADA',
      activadaDesde: 'DISPOSITIVO',
      descripcion: null,
      fechaInicio: new Date('2026-08-01T00:00:00.000Z'),
      fechaFin: new Date(),
      motivoFinalizacion: 'EXPIRADA',
      finalizadaDesde: 'SISTEMA',
    });

    const finished = await service.sweepOverdue(new Date('2026-10-22T00:00:00.000Z'));

    expect(finished).toBe(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        estado: 'ACTIVA',
        fechaInicio: { lte: new Date('2026-09-22T00:00:00.000Z') },
      },
      select: { idEmergencia: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { idEmergencia: 8n, estado: 'ACTIVA' },
      data: expect.objectContaining({
        estado: 'FINALIZADA',
        motivoFinalizacion: 'EXPIRADA',
        finalizadaDesde: 'SISTEMA',
      }),
    });
  });
});

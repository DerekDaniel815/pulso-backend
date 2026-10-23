import { Injectable, Logger } from '@nestjs/common';
import {
  FinalizadaDesde,
  MotivoFinalizacionEmergencia,
} from '../common/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { emergencyExpiryCutoff } from '../locations/location-freshness.js';
import {
  toEmergencyResponse,
  type EmergencyResponseDto,
} from './dto/emergency-response.dto.js';

@Injectable()
export class EmergencyExpirationService {
  private readonly logger = new Logger(EmergencyExpirationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationsService: LocationsService,
    private readonly locationRealtimeNotifier: LocationRealtimeNotifier,
  ) {}

  async sweepOverdue(now = new Date()): Promise<number> {
    const cutoff = emergencyExpiryCutoff(now);
    const due = await this.prisma.emergencia.findMany({
      where: {
        estado: 'ACTIVA',
        fechaInicio: { lte: cutoff },
      },
      select: { idEmergencia: true },
    });

    let finished = 0;
    for (const row of due) {
      const won = await this.finalizeIfActive(row.idEmergencia, {
        motivoFinalizacion: MotivoFinalizacionEmergencia.EXPIRADA,
        finalizadaDesde: FinalizadaDesde.SISTEMA,
        now,
      });
      if (won) finished += 1;
    }

    if (finished > 0) {
      this.logger.log(`[EMERGENCY] expired ${finished} emergency(s)`);
    }

    return finished;
  }

  /**
   * Gana una sola ejecución concurrente. Devuelve null si otra ya la finalizó.
   */
  async finalizeIfActive(
    idEmergencia: bigint,
    input: {
      motivoFinalizacion: MotivoFinalizacionEmergencia;
      finalizadaDesde: FinalizadaDesde;
      now?: Date;
    },
  ): Promise<EmergencyResponseDto | null> {
    const claimed = await this.prisma.emergencia.updateMany({
      where: { idEmergencia, estado: 'ACTIVA' },
      data: {
        estado: 'FINALIZADA',
        fechaFin: input.now ?? new Date(),
        motivoFinalizacion: input.motivoFinalizacion,
        finalizadaDesde: input.finalizadaDesde,
      },
    });

    if (claimed.count === 0) {
      return null;
    }

    const updated = await this.prisma.emergencia.findUnique({
      where: { idEmergencia },
    });

    if (!updated) {
      return null;
    }

    this.locationRealtimeNotifier.notifyEmergencyPublicEnded(updated.codigoPublico);
    try {
      await this.locationsService.publishAfterEmergencyEnded(updated.idUsuarioDispositivo);
    } catch (error) {
      this.logger.error(
        `No se pudo recalcular la visibilidad tras finalizar ${updated.codigoPublico}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    const location = await this.prisma.ubicacion.findFirst({
      where: { idUsuarioDispositivo: updated.idUsuarioDispositivo },
      orderBy: { fechaHoraServidor: 'desc' },
    });

    return toEmergencyResponse(updated, location);
  }
}

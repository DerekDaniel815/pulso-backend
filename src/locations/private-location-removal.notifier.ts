import { Injectable } from '@nestjs/common';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocationAccessService } from './location-access.service.js';

@Injectable()
export class PrivateLocationRemovalNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationAccessService: LocationAccessService,
    private readonly locationRealtimeNotifier: LocationRealtimeNotifier,
  ) {}

  async notifyLostViewers<T>(ownerUserIds: number[], change: () => Promise<T>): Promise<T> {
    const before = await this.snapshotViewers([...new Set(ownerUserIds)]);
    const result = await change();
    await this.emitLostViewers(before);
    return result;
  }

  private async snapshotViewers(ownerUserIds: number[]): Promise<Map<number, Set<number>>> {
    const snapshot = new Map<number, Set<number>>();

    if (ownerUserIds.length === 0) {
      return snapshot;
    }

    const assignments = await this.prisma.usuarioDispositivo.findMany({
      where: { idUsuario: { in: ownerUserIds }, estado: true },
      select: { idUsuarioDispositivo: true },
    });

    for (const assignment of assignments) {
      const viewers = await this.locationAccessService.getAuthorizedPrivateViewerUserIds(
        assignment.idUsuarioDispositivo,
      );
      snapshot.set(assignment.idUsuarioDispositivo, new Set(viewers));
    }

    return snapshot;
  }

  private async emitLostViewers(before: Map<number, Set<number>>): Promise<void> {
    for (const [idUsuarioDispositivo, previousViewers] of before) {
      const currentViewers = new Set(
        await this.locationAccessService.getAuthorizedPrivateViewerUserIds(idUsuarioDispositivo),
      );

      for (const idUsuario of previousViewers) {
        if (!currentViewers.has(idUsuario)) {
          this.locationRealtimeNotifier.notifyPrivateLocationRemoved(
            idUsuario,
            idUsuarioDispositivo,
          );
        }
      }
    }
  }
}

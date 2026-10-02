import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoEmergencia, EstadoSimulationSession } from '../common/enums.js';
import type { Prisma, SimulationSession } from '../generated/prisma/client.js';
import { LocationAccessService } from '../locations/location-access.service.js';
import { LocationRealtimeNotifier } from '../locations-realtime/location-realtime-notifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toSimulationSessionResponse,
  type SimulationSessionResponseDto,
} from './dto/simulation-session-response.dto.js';

const DEFAULT_LEASE_SECONDS = 45;

type CleanupSnapshot = {
  privateViewers: Set<number>;
  normalPublicKey: string | null;
  emergencyCodes: string[];
};

@Injectable()
export class SimulationSessionService {
  private readonly logger = new Logger(SimulationSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly locationAccessService: LocationAccessService,
    private readonly locationRealtimeNotifier: LocationRealtimeNotifier,
  ) {}

  getLeaseSeconds(): number {
    const configured = this.configService.get<string>('SIMULATION_LEASE_SECONDS');
    const parsed = configured ? Number.parseInt(configured, 10) : DEFAULT_LEASE_SECONDS;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LEASE_SECONDS;
  }

  async ensureSession(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto> {
    const assignment = await this.getOwnedAssignment(idUsuario, idUsuarioDispositivo);
    const now = new Date();
    const expiraEn = this.computeExpiry(now);

    const existing = await this.prisma.simulationSession.findFirst({
      where: {
        idUsuarioDispositivo,
        estado: EstadoSimulationSession.ACTIVA,
      },
    });

    if (existing) {
      if (existing.idUsuario !== idUsuario) {
        throw new ForbiddenException('No puedes usar la sesión de simulación de otro usuario');
      }

      const renewed = await this.prisma.simulationSession.update({
        where: { idSimulationSession: existing.idSimulationSession },
        data: {
          ultimaActividad: now,
          expiraEn,
        },
      });

      return toSimulationSessionResponse(renewed);
    }

    const created = await this.prisma.simulationSession.create({
      data: {
        idUsuario,
        idUsuarioDispositivo,
        estado: EstadoSimulationSession.ACTIVA,
        ultimaActividad: now,
        expiraEn,
        ubicacionActivaPrevia: assignment.ubicacionActiva,
        habilitoUbicacionActiva: false,
      },
    });

    return toSimulationSessionResponse(created);
  }

  async renewSession(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto> {
    return this.ensureSession(idUsuario, idUsuarioDispositivo);
  }

  async getActiveSession(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto | null> {
    await this.getOwnedAssignment(idUsuario, idUsuarioDispositivo);

    const session = await this.prisma.simulationSession.findFirst({
      where: {
        idUsuarioDispositivo,
        idUsuario,
        estado: EstadoSimulationSession.ACTIVA,
      },
    });

    return session ? toSimulationSessionResponse(session) : null;
  }

  async endSession(
    idUsuario: number,
    idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto | null> {
    await this.getOwnedAssignment(idUsuario, idUsuarioDispositivo);

    const session = await this.prisma.simulationSession.findFirst({
      where: {
        idUsuarioDispositivo,
        idUsuario,
        estado: EstadoSimulationSession.ACTIVA,
      },
    });

    if (!session) {
      return null;
    }

    const closed = await this.closeSession(session, EstadoSimulationSession.FINALIZADA);
    return toSimulationSessionResponse(closed);
  }

  async setTracking(
    idUsuario: number,
    idUsuarioDispositivo: number,
    ubicacionActiva: boolean,
  ): Promise<SimulationSessionResponseDto> {
    const sessionDto = await this.ensureSession(idUsuario, idUsuarioDispositivo);

    const session = await this.prisma.simulationSession.findUniqueOrThrow({
      where: { idSimulationSession: sessionDto.idSimulationSession },
    });

    if (ubicacionActiva) {
      if (!session.ubicacionActivaPrevia) {
        await this.prisma.$transaction(async (tx) => {
          await tx.usuarioDispositivo.update({
            where: { idUsuarioDispositivo },
            data: { ubicacionActiva: true },
          });

          if (!session.habilitoUbicacionActiva) {
            await tx.simulationSession.update({
              where: { idSimulationSession: session.idSimulationSession },
              data: { habilitoUbicacionActiva: true },
            });
          }
        });
      }
    } else if (session.habilitoUbicacionActiva) {
      await this.prisma.$transaction(async (tx) => {
        await tx.usuarioDispositivo.update({
          where: { idUsuarioDispositivo },
          data: { ubicacionActiva: session.ubicacionActivaPrevia },
        });

        await tx.simulationSession.update({
          where: { idSimulationSession: session.idSimulationSession },
          data: { habilitoUbicacionActiva: false },
        });
      });
    }

    return this.renewSession(idUsuario, idUsuarioDispositivo);
  }

  async expireSessions(): Promise<number> {
    const now = new Date();
    const expiredCandidates = await this.prisma.simulationSession.findMany({
      where: {
        estado: EstadoSimulationSession.ACTIVA,
        expiraEn: { lt: now },
      },
      take: 50,
    });

    let processed = 0;

    for (const candidate of expiredCandidates) {
      const closed = await this.tryExpireSession(candidate);
      if (closed) {
        processed += 1;
      }
    }

    if (processed > 0) {
      this.logger.log(`[SIM SESSION] expired ${processed} session(s)`);
    }

    return processed;
  }

  private async tryExpireSession(session: SimulationSession): Promise<boolean> {
    const snapshot = await this.captureCleanupSnapshot(session);
    const closed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.simulationSession.updateMany({
        where: {
          idSimulationSession: session.idSimulationSession,
          estado: EstadoSimulationSession.ACTIVA,
        },
        data: {
          estado: EstadoSimulationSession.EXPIRADA,
          fechaFin: new Date(),
        },
      });

      if (claim.count === 0) {
        return false;
      }

      const current = await tx.simulationSession.findUniqueOrThrow({
        where: { idSimulationSession: session.idSimulationSession },
      });

      await this.applySessionCleanup(tx, current);
      return true;
    });

    if (closed) {
      await this.publishCleanupRealtime(session.idUsuarioDispositivo, snapshot);
    }

    return closed;
  }

  private async closeSession(
    session: SimulationSession,
    targetState: EstadoSimulationSession.EXPIRADA | EstadoSimulationSession.FINALIZADA,
  ): Promise<SimulationSession> {
    const snapshot = await this.captureCleanupSnapshot(session);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.simulationSession.updateMany({
        where: {
          idSimulationSession: session.idSimulationSession,
          estado: EstadoSimulationSession.ACTIVA,
        },
        data: {
          estado: targetState,
          fechaFin: new Date(),
        },
      });

      const current = await tx.simulationSession.findUniqueOrThrow({
        where: { idSimulationSession: session.idSimulationSession },
      });

      if (claim.count === 0) {
        return { session: current, cleaned: false };
      }

      await this.applySessionCleanup(tx, current);
      return { session: current, cleaned: true };
    });

    if (outcome.cleaned) {
      await this.publishCleanupRealtime(session.idUsuarioDispositivo, snapshot);
    }

    return outcome.session;
  }

  private async captureCleanupSnapshot(session: SimulationSession): Promise<CleanupSnapshot> {
    const [privateViewers, normalPublicKey, emergencies] = await Promise.all([
      this.currentLivePrivateViewers(session.idUsuarioDispositivo),
      this.currentNormalPublicKey(session.idUsuarioDispositivo),
      this.prisma.emergencia.findMany({
        where: {
          idSimulationSession: session.idSimulationSession,
          estado: EstadoEmergencia.ACTIVA,
        },
        select: { codigoPublico: true },
      }),
    ]);

    return {
      privateViewers,
      normalPublicKey,
      emergencyCodes: emergencies.map((row) => row.codigoPublico),
    };
  }

  private async publishCleanupRealtime(
    idUsuarioDispositivo: number,
    snapshot: CleanupSnapshot,
  ): Promise<void> {
    const afterViewers = await this.currentLivePrivateViewers(idUsuarioDispositivo);

    for (const idUsuario of snapshot.privateViewers) {
      if (!afterViewers.has(idUsuario)) {
        this.locationRealtimeNotifier.notifyPrivateLocationRemoved(idUsuario, idUsuarioDispositivo);
      }
    }

    const afterPublicKey = await this.currentNormalPublicKey(idUsuarioDispositivo);

    if (snapshot.normalPublicKey && snapshot.normalPublicKey !== afterPublicKey) {
      this.locationRealtimeNotifier.notifyLocationPublicRemoved(snapshot.normalPublicKey);
    }

    for (const codigoPublico of snapshot.emergencyCodes) {
      this.locationRealtimeNotifier.notifyEmergencyPublicEnded(codigoPublico);
    }
  }

  private async currentLivePrivateViewers(idUsuarioDispositivo: number): Promise<Set<number>> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
    });

    if (!assignment?.estado) {
      return new Set();
    }

    const emergencyActive = await this.locationAccessService.hasActiveEmergency(idUsuarioDispositivo);

    if (!assignment.ubicacionActiva && !emergencyActive) {
      return new Set();
    }

    const viewers = await this.locationAccessService.getAuthorizedPrivateViewerUserIds(
      idUsuarioDispositivo,
    );
    return new Set(viewers);
  }

  private async currentNormalPublicKey(idUsuarioDispositivo: number): Promise<string | null> {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
    });

    if (!assignment?.estado || !assignment.ubicacionActiva) {
      return null;
    }

    const audience = await this.locationAccessService.getPublicAudience(assignment);

    if (audience.origen === 'PUBLICO' && audience.clavePublica) {
      return audience.clavePublica;
    }

    return null;
  }

  private async applySessionCleanup(
    tx: Prisma.TransactionClient,
    session: SimulationSession,
  ): Promise<void> {
    if (session.habilitoUbicacionActiva) {
      await tx.usuarioDispositivo.update({
        where: { idUsuarioDispositivo: session.idUsuarioDispositivo },
        data: { ubicacionActiva: session.ubicacionActivaPrevia },
      });
    }

    await tx.emergencia.updateMany({
      where: {
        idSimulationSession: session.idSimulationSession,
        estado: EstadoEmergencia.ACTIVA,
      },
      data: {
        estado: EstadoEmergencia.FINALIZADA,
        fechaFin: new Date(),
      },
    });
  }

  private computeExpiry(from: Date): Date {
    return new Date(from.getTime() + this.getLeaseSeconds() * 1000);
  }

  private async getOwnedAssignment(idUsuario: number, idUsuarioDispositivo: number) {
    const assignment = await this.prisma.usuarioDispositivo.findUnique({
      where: { idUsuarioDispositivo },
    });

    if (!assignment || !assignment.estado) {
      throw new NotFoundException('Asignación no encontrada');
    }

    if (assignment.idUsuario !== idUsuario) {
      throw new ForbiddenException('No puedes simular la asignación de otro usuario');
    }

    return assignment;
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoSimulationSession } from '../../common/enums.js';
import { toIso } from '../../common/utils/serialize.js';
import type { SimulationSession } from '../../generated/prisma/client.js';

export class SimulationSessionResponseDto {
  @ApiProperty()
  idSimulationSession: number;

  @ApiProperty()
  idUsuarioDispositivo: number;

  @ApiProperty({ enum: EstadoSimulationSession })
  estado: EstadoSimulationSession;

  @ApiProperty()
  ultimaActividad: string;

  @ApiProperty()
  expiraEn: string;

  @ApiPropertyOptional()
  fechaInicio?: string;

  @ApiPropertyOptional()
  fechaFin?: string | null;
}

export class SimulationHeartbeatResponseDto {
  @ApiProperty({ example: true })
  ok: boolean;

  @ApiProperty()
  expiresAt: string;
}

export function toSimulationSessionResponse(
  session: SimulationSession,
): SimulationSessionResponseDto {
  return {
    idSimulationSession: session.idSimulationSession,
    idUsuarioDispositivo: session.idUsuarioDispositivo,
    estado: session.estado as EstadoSimulationSession,
    ultimaActividad: toIso(session.ultimaActividad) as string,
    expiraEn: toIso(session.expiraEn) as string,
    fechaInicio: toIso(session.fechaInicio) as string,
    fechaFin: toIso(session.fechaFin),
  };
}

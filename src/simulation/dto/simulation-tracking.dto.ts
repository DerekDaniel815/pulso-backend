import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SimulationTrackingDto {
  @ApiProperty({ description: 'Activar o desactivar tracking simulado en la asignación' })
  @IsBoolean()
  ubicacionActiva: boolean;
}

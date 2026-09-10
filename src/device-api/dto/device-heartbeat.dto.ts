import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class DeviceHeartbeatDto {
  @ApiProperty({
    example: '2026-09-09T18:48:00-05:00',
    description: 'Marca de tiempo del dispositivo al enviar el heartbeat.',
  })
  @IsDateString()
  deviceTimestamp: string;
}

export class DeviceHeartbeatResponseDto {
  @ApiProperty({ example: true })
  ok: boolean;

  @ApiProperty({
    example: '2026-09-09T23:48:01.000Z',
    description: 'Última comunicación técnica registrada (dispositivo.ultima_conexion).',
  })
  ultimaConexion: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Dispositivo } from '../../generated/prisma/client.js';
import { toIso } from '../../common/utils/serialize.js';

export class DeviceResponseDto {
  @ApiProperty()
  idDispositivo: number;

  @ApiProperty()
  codigoDispositivo: string;

  @ApiPropertyOptional()
  imei: string | null;

  @ApiPropertyOptional()
  modelo: string | null;

  @ApiPropertyOptional()
  numeroSerie: string | null;

  @ApiProperty()
  estado: string;

  @ApiPropertyOptional({
    description: 'Última comunicación técnica del dispositivo con el backend. No es el último login del usuario.',
  })
  ultimaConexion: string | null;

  @ApiPropertyOptional()
  fechaFabricacion: string | null;

  @ApiProperty()
  fechaRegistro: string;
}

export class DeviceCreatedResponseDto extends DeviceResponseDto {
  @ApiProperty({
    description:
      'Token del dispositivo. Solo se devuelve al crear o regenerar. Guardarlo en firmware de forma segura.',
    example: 'pul_xK9mN2pQ7rT4vW8yZ1aB3cD5eF6gH0j',
  })
  deviceToken: string;
}

export function toDeviceResponse(device: Dispositivo): DeviceResponseDto {
  return {
    idDispositivo: device.idDispositivo,
    codigoDispositivo: device.codigoDispositivo,
    imei: device.imei,
    modelo: device.modelo,
    numeroSerie: device.numeroSerie,
    estado: device.estado,
    ultimaConexion: toIso(device.ultimaConexion),
    fechaFabricacion: toIso(device.fechaFabricacion),
    fechaRegistro: toIso(device.fechaRegistro) as string,
  };
}

export function toDeviceCreatedResponse(
  device: Dispositivo,
  deviceToken: string,
): DeviceCreatedResponseDto {
  return {
    ...toDeviceResponse(device),
    deviceToken,
  };
}

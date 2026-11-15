import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentDevice } from '../common/decorators/current-device.decorator.js';
import type { AuthenticatedDevice } from '../common/types/authenticated-device.js';
import { DeviceApiService } from './device-api.service.js';
import {
  DeviceEmergencyDto,
  DeviceEmergencyResponseDto,
} from './dto/device-emergency.dto.js';
import {
  DeviceHeartbeatDto,
  DeviceHeartbeatResponseDto,
} from './dto/device-heartbeat.dto.js';
import {
  DeviceLocationDto,
  DeviceLocationResponseDto,
} from './dto/device-location.dto.js';
import { DeviceAuthGuard } from './guards/device-auth.guard.js';
import { DeviceNetworkCellDto, DeviceNetworkCellResponseDto } from './dto/device-network-cell.dto.js';
import { NetworkLocationService } from '../locations/network-location.service.js';

class DeviceTrackingDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}

@ApiTags('Device API')
@ApiBearerAuth('device-token')
@Public()
@UseGuards(DeviceAuthGuard)
@Controller('device')
export class DeviceApiController {
  constructor(
    private readonly deviceApiService: DeviceApiService,
    private readonly networkLocationService: NetworkLocationService,
  ) {}

  @Post('locations')
  @ApiOperation({
    summary: 'Enviar ubicación GNSS desde el hardware',
    description:
      'El dispositivo se identifica con Bearer token. El backend resuelve la asignación activa y actualiza ultima_conexion. clientLocationId es opcional: si se repite en la misma asignación, la respuesta confirma la primera fila sin insertar otra ni emitir location.updated.',
  })
  @ApiCreatedResponse({ type: DeviceLocationResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de ubicación inválidos' })
  @ApiUnauthorizedResponse({ description: 'Token de dispositivo ausente o inválido' })
  @ApiForbiddenResponse({
    description:
      'Seguimiento no permitido: dispositivo en MANTENIMIENTO, no ASIGNADO, o ubicacion_activa = false',
  })
  @ApiNotFoundResponse({ description: 'Sin asignación activa' })
  reportLocation(
    @CurrentDevice() device: AuthenticatedDevice,
    @Body() dto: DeviceLocationDto,
  ): Promise<DeviceLocationResponseDto> {
    return this.deviceApiService.reportLocation(device, dto);
  }

  @Post('network-cell')
  @ApiOperation({
    summary: 'Enviar la celda LTE para el respaldo Google',
    description:
      'No incluye coordenadas. El servidor consulta Google Geolocation solo si tiene clave y no hay una respuesta reciente de esta misma celda. La coordenada resultante se guarda como NETWORK.',
  })
  @ApiCreatedResponse({ type: DeviceNetworkCellResponseDto })
  @ApiBadRequestResponse({ description: 'Celda LTE incompleta' })
  @ApiUnauthorizedResponse({ description: 'Token de dispositivo ausente o inválido' })
  reportNetworkCell(
    @CurrentDevice() device: AuthenticatedDevice,
    @Body() dto: DeviceNetworkCellDto,
  ): Promise<DeviceNetworkCellResponseDto> {
    return this.networkLocationService.report(device, dto);
  }

  @Post('emergencies')
  @ApiOperation({
    summary: 'Activar emergencia (SOS) desde el hardware',
    description:
      'Crea emergencia ACTIVA con activada_desde=DISPOSITIVO. No modifica visibilidad_preferida. Visibilidad efectiva pasa a PUBLICO mientras dure.',
  })
  @ApiCreatedResponse({ type: DeviceEmergencyResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token de dispositivo ausente o inválido' })
  @ApiForbiddenResponse({ description: 'Dispositivo dado de baja' })
  @ApiConflictResponse({ description: 'Ya existe una emergencia activa para esta asignación' })
  @ApiNotFoundResponse({ description: 'Sin asignación activa' })
  reportEmergency(
    @CurrentDevice() device: AuthenticatedDevice,
    @Body() dto: DeviceEmergencyDto,
  ): Promise<DeviceEmergencyResponseDto> {
    return this.deviceApiService.reportEmergency(device, dto);
  }

  @Post('emergencies/finish')
  @ApiOperation({
    summary: 'Finalizar la emergencia activa desde el hardware',
    description: 'Usa el mismo cierre que la app, marcado como finalizado desde el dispositivo.',
  })
  finishEmergency(@CurrentDevice() device: AuthenticatedDevice) {
    return this.deviceApiService.finishEmergency(device);
  }

  @Post('tracking')
  @ApiOperation({
    summary: 'Encender o apagar el seguimiento desde el hardware',
    description: 'Cambia ubicacionActiva con la misma lógica que el interruptor de la app.',
  })
  setTracking(@CurrentDevice() device: AuthenticatedDevice, @Body() dto: DeviceTrackingDto) {
    return this.deviceApiService.setTracking(device, dto.enabled);
  }

  @Post('heartbeat')
  @ApiOperation({
    summary: 'Heartbeat de conectividad',
    description:
      'Actualiza dispositivo.ultima_conexion sin registrar una nueva coordenada GNSS.',
  })
  @ApiCreatedResponse({ type: DeviceHeartbeatResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token de dispositivo ausente o inválido' })
  @ApiForbiddenResponse({ description: 'Dispositivo dado de baja' })
  @ApiNotFoundResponse({ description: 'Sin asignación activa' })
  heartbeat(
    @CurrentDevice() device: AuthenticatedDevice,
    @Body() _dto: DeviceHeartbeatDto,
  ): Promise<DeviceHeartbeatResponseDto> {
    return this.deviceApiService.heartbeat(device);
  }
}

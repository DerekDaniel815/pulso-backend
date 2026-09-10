import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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

@ApiTags('Device API')
@ApiBearerAuth('device-token')
@Public()
@UseGuards(DeviceAuthGuard)
@Controller('device')
export class DeviceApiController {
  constructor(private readonly deviceApiService: DeviceApiService) {}

  @Post('locations')
  @ApiOperation({
    summary: 'Enviar ubicación GNSS desde el hardware',
    description:
      'El dispositivo se identifica con Bearer token. El backend resuelve la asignación activa y actualiza ultima_conexion.',
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

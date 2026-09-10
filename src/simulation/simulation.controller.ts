import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import {
  DeviceEmergencyDto,
  DeviceEmergencyResponseDto,
} from '../device-api/dto/device-emergency.dto.js';
import {
  DeviceLocationDto,
  DeviceLocationResponseDto,
} from '../device-api/dto/device-location.dto.js';
import {
  SimulationHeartbeatResponseDto,
  SimulationSessionResponseDto,
} from './dto/simulation-session-response.dto.js';
import { SimulationTrackingDto } from './dto/simulation-tracking.dto.js';
import { SimulationEnabledGuard } from './guards/simulation-enabled.guard.js';
import { SimulationService } from './simulation.service.js';

@ApiTags('Simulation (DEV)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@UseGuards(SimulationEnabledGuard)
@Controller('simulation/user-devices')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  @Post(':idUsuarioDispositivo/session')
  @ApiOperation({
    summary: 'Iniciar o renovar sesión de simulación DEV',
    description: 'SOLO DESARROLLO / STAGING. Crea sesión ACTIVA o renueva lease si ya existe.',
  })
  @ApiCreatedResponse({ type: SimulationSessionResponseDto })
  @ApiNotFoundResponse({ description: 'Asignación no encontrada' })
  @ApiForbiddenResponse({ description: 'Asignación ajena' })
  startSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('idUsuarioDispositivo', ParseIntPipe) idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto> {
    return this.simulationService.startSession(user.idUsuario, idUsuarioDispositivo);
  }

  @Get(':idUsuarioDispositivo/session')
  @ApiOperation({ summary: 'Consultar sesión ACTIVA de simulación DEV' })
  @ApiOkResponse({ type: SimulationSessionResponseDto })
  @ApiNotFoundResponse({ description: 'Asignación no encontrada' })
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('idUsuarioDispositivo', ParseIntPipe) idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto | null> {
    return this.simulationService.getSession(user.idUsuario, idUsuarioDispositivo);
  }

  @Post(':idUsuarioDispositivo/session/end')
  @ApiOperation({
    summary: 'Finalizar sesión de simulación DEV',
    description: 'Ejecuta cleanup seguro: restaura tracking y finaliza emergencias simuladas.',
  })
  @ApiOkResponse({ type: SimulationSessionResponseDto })
  endSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('idUsuarioDispositivo', ParseIntPipe) idUsuarioDispositivo: number,
  ): Promise<SimulationSessionResponseDto | null> {
    return this.simulationService.endSession(user.idUsuario, idUsuarioDispositivo);
  }

  @Post(':idUsuarioDispositivo/heartbeat')
  @ApiOperation({
    summary: 'Heartbeat de sesión simulada (no actualiza dispositivo.ultima_conexion)',
  })
  @ApiCreatedResponse({ type: SimulationHeartbeatResponseDto })
  heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('idUsuarioDispositivo', ParseIntPipe) idUsuarioDispositivo: number,
  ): Promise<SimulationHeartbeatResponseDto> {
    return this.simulationService.heartbeat(user.idUsuario, idUsuarioDispositivo);
  }

  @Patch(':idUsuarioDispositivo/tracking')
  @ApiOperation({
    summary: 'Activar/desactivar tracking simulado con cleanup seguro',
    description:
      'Preferir este endpoint sobre PATCH /user-devices durante simulación. Marca habilitoUbicacionActiva solo si la simulación enciende tracking que antes estaba apagado.',
  })
  @ApiOkResponse({ type: SimulationSessionResponseDto })
  setTracking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('idUsuarioDispositivo', ParseIntPipe) idUsuarioDispositivo: number,
    @Body() dto: SimulationTrackingDto,
  ): Promise<SimulationSessionResponseDto> {
    return this.simulationService.setTracking(
      user.idUsuario,
      idUsuarioDispositivo,
      dto.ubicacionActiva,
    );
  }

  @Post(':idUsuarioDispositivo/locations')
  @ApiOperation({
    summary: 'Simular envío de ubicación GNSS desde la app móvil',
    description:
      'SOLO DESARROLLO / STAGING. Renueva lease de sesión y reutiliza POST /device/locations.',
  })
  @ApiCreatedResponse({ type: DeviceLocationResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de ubicación inválidos' })
  @ApiForbiddenResponse({
    description:
      'Asignación ajena, dispositivo dado de baja, o seguimiento no permitido (ubicacion_activa=false, no ASIGNADO, etc.)',
  })
  @ApiNotFoundResponse({ description: 'Asignación no encontrada o simulación deshabilitada' })
  reportLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('idUsuarioDispositivo', ParseIntPipe) idUsuarioDispositivo: number,
    @Body() dto: DeviceLocationDto,
  ): Promise<DeviceLocationResponseDto> {
    return this.simulationService.reportLocation(user.idUsuario, idUsuarioDispositivo, dto);
  }

  @Post(':idUsuarioDispositivo/emergencies')
  @ApiOperation({
    summary: 'Simular activación SOS desde la app móvil',
    description:
      'SOLO DESARROLLO / STAGING. Renueva lease y asocia emergencia a simulation_session.',
  })
  @ApiCreatedResponse({ type: DeviceEmergencyResponseDto })
  @ApiForbiddenResponse({ description: 'Asignación ajena o dispositivo dado de baja' })
  @ApiConflictResponse({ description: 'Ya existe una emergencia activa para esta asignación' })
  @ApiNotFoundResponse({ description: 'Asignación no encontrada o simulación deshabilitada' })
  reportEmergency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('idUsuarioDispositivo', ParseIntPipe) idUsuarioDispositivo: number,
    @Body() dto: DeviceEmergencyDto,
  ): Promise<DeviceEmergencyResponseDto> {
    return this.simulationService.reportEmergency(user.idUsuario, idUsuarioDispositivo, dto);
  }
}

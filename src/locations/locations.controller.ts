import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { LocationHistoryQueryDto } from './dto/location-history-query.dto.js';
import { LocationResponseDto } from './dto/location-response.dto.js';
import {
  PublicLocationMarkerDto,
  VisibleLocationResponseDto,
} from './dto/visible-location.dto.js';
import { LocationsService } from './locations.service.js';

@ApiTags('locations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar una coordenada enviada por el dispositivo GPS' })
  @ApiCreatedResponse({ type: LocationResponseDto })
  @ApiForbiddenResponse({ description: 'Solo el propietario puede reportar esta asignación' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLocationDto,
  ): Promise<LocationResponseDto> {
    return this.locationsService.create(user.idUsuario, dto);
  }

  @Get('me/latest')
  @ApiOperation({ summary: 'Última ubicación del usuario autenticado' })
  @ApiOkResponse({ type: LocationResponseDto })
  @ApiNotFoundResponse({ description: 'No hay ubicaciones registradas' })
  findMyLatest(@CurrentUser() user: AuthenticatedUser): Promise<LocationResponseDto> {
    return this.locationsService.findMyLatest(user.idUsuario);
  }

  @Get('visible')
  @ApiOperation({
    summary: 'Última ubicación de todas las asignaciones que el usuario autenticado puede ver',
    description:
      'Usa la misma autorización que el realtime. No incluye capa pública anonimizada; esa va en GET /locations/public y GET /emergencies/public.',
  })
  @ApiOkResponse({ type: [VisibleLocationResponseDto] })
  findVisible(@CurrentUser() user: AuthenticatedUser): Promise<VisibleLocationResponseDto[]> {
    return this.locationsService.findVisibleForUser(user.idUsuario);
  }

  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'Markers públicos de tracking (visibilidadPreferida=PUBLICO), anonimizados',
    description:
      'Sin login. No incluye emergencias: usar GET /emergencies/public. No expone nombres, correo ni ids de usuario.',
  })
  @ApiOkResponse({ type: [PublicLocationMarkerDto] })
  findPublic(): Promise<PublicLocationMarkerDto[]> {
    return this.locationsService.findPublicMarkers();
  }

  @Get('user-device/:id/latest')
  @ApiOperation({ summary: 'Última ubicación de una asignación, si el usuario tiene permiso' })
  @ApiOkResponse({ type: LocationResponseDto })
  @ApiForbiddenResponse({ description: 'Sin permiso para ver esta ubicación' })
  findLatestByAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LocationResponseDto> {
    return this.locationsService.findLatestByAssignment(user.idUsuario, id);
  }

  @Get('user-device/:id/history')
  @ApiOperation({ summary: 'Historial de ubicaciones de una asignación' })
  @ApiOkResponse({ type: [LocationResponseDto] })
  findHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: LocationHistoryQueryDto,
  ): Promise<LocationResponseDto[]> {
    return this.locationsService.findHistory(user.idUsuario, id, query);
  }
}

import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import {
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
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { CreateEmergencyDto } from './dto/create-emergency.dto.js';
import { EmergencyResponseDto, PublicEmergencyResponseDto } from './dto/emergency-response.dto.js';
import { EmergenciesService } from './emergencies.service.js';

@ApiTags('emergencies')
@Controller('emergencies')
export class EmergenciesController {
  constructor(private readonly emergenciesService: EmergenciesService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activar una emergencia. No modifica visibilidadPreferida.' })
  @ApiCreatedResponse({ type: EmergencyResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
  @ApiConflictResponse({ description: 'Ya existe una emergencia activa' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmergencyDto,
  ): Promise<EmergencyResponseDto> {
    return this.emergenciesService.create(user.idUsuario, dto);
  }

  @Patch(':id/finish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Finalizar una emergencia propia' })
  @ApiOkResponse({ type: EmergencyResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
  @ApiForbiddenResponse({ description: 'Solo el propietario puede finalizarla' })
  finish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EmergencyResponseDto> {
    return this.emergenciesService.finish(user.idUsuario, BigInt(id));
  }

  @Get('active')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Emergencias activas que el usuario autenticado puede ver' })
  @ApiOkResponse({ type: [EmergencyResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
  findActive(@CurrentUser() user: AuthenticatedUser): Promise<EmergencyResponseDto[]> {
    return this.emergenciesService.findActiveForUser(user.idUsuario);
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Listar emergencias activas con datos públicos limitados' })
  @ApiOkResponse({ type: [PublicEmergencyResponseDto] })
  findPublic(): Promise<PublicEmergencyResponseDto[]> {
    return this.emergenciesService.findPublic();
  }

  @Public()
  @Get('public/:codigoPublico')
  @ApiOperation({ summary: 'Consultar una emergencia pública por código' })
  @ApiOkResponse({ type: PublicEmergencyResponseDto })
  @ApiNotFoundResponse({ description: 'Emergencia no encontrada' })
  findPublicByCode(
    @Param('codigoPublico') codigoPublico: string,
  ): Promise<PublicEmergencyResponseDto> {
    return this.emergenciesService.findPublicByCode(codigoPublico);
  }
}

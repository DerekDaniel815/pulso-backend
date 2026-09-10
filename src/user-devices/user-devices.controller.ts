import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
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
import { CreateUserDeviceDto } from './dto/create-user-device.dto.js';
import { UpdateUserDeviceDto } from './dto/update-user-device.dto.js';
import { UserDeviceResponseDto } from './dto/user-device-response.dto.js';
import { UserDevicesService } from './user-devices.service.js';

@ApiTags('user-devices')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('user-devices')
export class UserDevicesController {
  constructor(private readonly userDevicesService: UserDevicesService) {}

  @Post()
  @ApiOperation({
    summary: 'Vincular un dispositivo al usuario autenticado por codigoDispositivo',
    description:
      'El dispositivo debe estar en estado DISPONIBLE. visibilidadPreferida y ubicacionActiva se inicializan en backend (SOLO_YO / false).',
  })
  @ApiCreatedResponse({ type: UserDeviceResponseDto })
  @ApiNotFoundResponse({ description: 'Dispositivo no encontrado con ese código' })
  @ApiBadRequestResponse({ description: 'El dispositivo no está en estado DISPONIBLE' })
  @ApiConflictResponse({ description: 'El dispositivo ya tiene una asignación activa' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDeviceDto,
  ): Promise<UserDeviceResponseDto> {
    return this.userDevicesService.assign(user.idUsuario, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Consultar asignaciones e historial del usuario autenticado' })
  @ApiOkResponse({ type: [UserDeviceResponseDto] })
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<UserDeviceResponseDto[]> {
    return this.userDevicesService.findMine(user.idUsuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar una asignación propia' })
  @ApiOkResponse({ type: UserDeviceResponseDto })
  @ApiNotFoundResponse({ description: 'Asignación no encontrada' })
  @ApiForbiddenResponse({ description: 'La asignación pertenece a otro usuario' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserDeviceResponseDto> {
    return this.userDevicesService.findOne(user.idUsuario, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar alias, visibilidad o estado de ubicación' })
  @ApiOkResponse({ type: UserDeviceResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDeviceDto,
  ): Promise<UserDeviceResponseDto> {
    return this.userDevicesService.update(user.idUsuario, id, dto);
  }

  @Post(':id/unlink')
  @ApiOperation({ summary: 'Desvincular un dispositivo sin borrar el historial' })
  @ApiOkResponse({ type: UserDeviceResponseDto })
  unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserDeviceResponseDto> {
    return this.userDevicesService.unlink(user.idUsuario, id);
  }
}

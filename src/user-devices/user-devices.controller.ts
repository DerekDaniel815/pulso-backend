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
import {
  GroupSharingItemDto,
  UpdateGroupSharingDto,
  UpdateMemberGroupSharingDto,
} from './dto/group-sharing.dto.js';
import { UpdateUserDeviceDto } from './dto/update-user-device.dto.js';
import { UserDeviceResponseDto } from './dto/user-device-response.dto.js';
import { GroupSharingService } from './group-sharing.service.js';
import { UserDevicesService } from './user-devices.service.js';

@ApiTags('user-devices')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('user-devices')
export class UserDevicesController {
  constructor(
    private readonly userDevicesService: UserDevicesService,
    private readonly groupSharingService: GroupSharingService,
  ) {}

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

  @Get(':id/groups-sharing')
  @ApiOperation({
    summary: 'Grupos del propietario y con cuáles comparte esta asignación',
    description:
      'compartiendo solo aplica cuando visibilidadPreferida es GRUPO. La exclusión es por asignación y grupo, no un DENY global.',
  })
  @ApiOkResponse({ type: [GroupSharingItemDto] })
  @ApiNotFoundResponse({ description: 'Asignación no encontrada' })
  @ApiForbiddenResponse({ description: 'La asignación pertenece a otro usuario' })
  listGroupSharing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GroupSharingItemDto[]> {
    return this.groupSharingService.list(user.idUsuario, id);
  }

  @Patch(':id/groups/:groupId/sharing')
  @ApiOperation({ summary: 'Activar o desactivar el sharing normal con un grupo' })
  @ApiOkResponse({ type: GroupSharingItemDto })
  @ApiBadRequestResponse({ description: 'Grupo inactivo o asignación desvinculada' })
  @ApiForbiddenResponse({ description: 'No eres el propietario o no perteneces al grupo' })
  setGroupSharing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: UpdateGroupSharingDto,
  ): Promise<GroupSharingItemDto> {
    return this.groupSharingService.setGroupSharing(
      user.idUsuario,
      id,
      groupId,
      dto.comparteUbicacion,
    );
  }

  @Patch(':id/groups/:groupId/members/:userId/sharing')
  @ApiOperation({ summary: 'Excluir o volver a permitir a un miembro en el sharing de este grupo' })
  @ApiOkResponse({ type: GroupSharingItemDto })
  @ApiBadRequestResponse({ description: 'No se puede excluir al propietario ni a quien no es miembro' })
  setMemberGroupSharing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateMemberGroupSharingDto,
  ): Promise<GroupSharingItemDto> {
    return this.groupSharingService.setMemberSharing(
      user.idUsuario,
      id,
      groupId,
      userId,
      dto.permitido,
    );
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

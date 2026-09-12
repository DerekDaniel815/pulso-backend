import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
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
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { GroupMemberResponseDto, GroupResponseDto } from './dto/group-response.dto.js';
import { InvitationResponseDto } from './dto/invitation-response.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import { GroupsService } from './groups.service.js';

@ApiTags('groups')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un grupo y agregar al creador como administrador' })
  @ApiCreatedResponse({ type: GroupResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupDto,
  ): Promise<GroupResponseDto> {
    return this.groupsService.create(user.idUsuario, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar grupos del usuario autenticado' })
  @ApiOkResponse({ type: [GroupResponseDto] })
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<GroupResponseDto[]> {
    return this.groupsService.findMine(user.idUsuario);
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Listar invitaciones pendientes recibidas' })
  @ApiOkResponse({ type: [InvitationResponseDto] })
  findMyInvitations(@CurrentUser() user: AuthenticatedUser): Promise<InvitationResponseDto[]> {
    return this.groupsService.findMyInvitations(user.idUsuario);
  }

  @Patch('invitations/:id/accept')
  @ApiOperation({ summary: 'Aceptar una invitación y unirse al grupo' })
  @ApiOkResponse({ type: InvitationResponseDto })
  acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<InvitationResponseDto> {
    return this.groupsService.acceptInvitation(user.idUsuario, id);
  }

  @Patch('invitations/:id/reject')
  @ApiOperation({ summary: 'Rechazar una invitación a grupo' })
  @ApiOkResponse({ type: InvitationResponseDto })
  rejectInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<InvitationResponseDto> {
    return this.groupsService.rejectInvitation(user.idUsuario, id);
  }

  @Patch('invitations/:id/cancel')
  @ApiOperation({ summary: 'Cancelar una invitación pendiente. Requiere rol ADMIN del grupo.' })
  @ApiOkResponse({ type: InvitationResponseDto })
  cancelInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<InvitationResponseDto> {
    return this.groupsService.cancelInvitation(user.idUsuario, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un grupo propio' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiForbiddenResponse({ description: 'No perteneces a este grupo' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GroupResponseDto> {
    return this.groupsService.findOne(user.idUsuario, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un grupo. Requiere rol ADMIN.' })
  @ApiOkResponse({ type: GroupResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupDto,
  ): Promise<GroupResponseDto> {
    return this.groupsService.update(user.idUsuario, id, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Listar miembros activos de un grupo' })
  @ApiOkResponse({ type: [GroupMemberResponseDto] })
  findMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GroupMemberResponseDto[]> {
    return this.groupsService.findMembers(user.idUsuario, id);
  }

  @Post(':id/invitations')
  @ApiOperation({ summary: 'Invitar a un usuario al grupo. Requiere rol ADMIN.' })
  @ApiCreatedResponse({ type: InvitationResponseDto })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    return this.groupsService.invite(user.idUsuario, id, dto);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Salir del grupo o eliminar a un miembro (ADMIN)' })
  @ApiOkResponse({ type: GroupMemberResponseDto })
  @ApiNotFoundResponse({ description: 'El usuario no es miembro activo' })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<GroupMemberResponseDto> {
    return this.groupsService.removeMember(user.idUsuario, id, userId);
  }
}

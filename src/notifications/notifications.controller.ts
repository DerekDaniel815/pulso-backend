import { Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { NotificationQueryDto } from './dto/notification-query.dto.js';
import { NotificationResponseDto } from './dto/notification-response.dto.js';
import { MarkAllReadResponseDto, UnreadCountResponseDto } from './dto/unread-count.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones del usuario autenticado (paginado)' })
  @ApiOkResponse({ type: [NotificationResponseDto] })
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ): Promise<NotificationResponseDto[]> {
    return this.notificationsService.findMine(user.idUsuario, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('unread')
  @ApiOperation({ summary: 'Listar notificaciones no leídas' })
  @ApiOkResponse({ type: [NotificationResponseDto] })
  findUnread(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ): Promise<NotificationResponseDto[]> {
    return this.notificationsService.findMine(user.idUsuario, {
      unreadOnly: true,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Contar notificaciones no leídas del usuario autenticado' })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCountResponseDto> {
    const count = await this.notificationsService.unreadCount(user.idUsuario);
    return { count };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones del usuario como leídas' })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<MarkAllReadResponseDto> {
    const count = await this.notificationsService.markAllRead(user.idUsuario);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiNotFoundResponse({ description: 'Notificación no encontrada' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markRead(user.idUsuario, BigInt(id));
  }
}

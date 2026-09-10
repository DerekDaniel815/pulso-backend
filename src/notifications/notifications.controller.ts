import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
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
import { NotificationResponseDto } from './dto/notification-response.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones del usuario autenticado' })
  @ApiOkResponse({ type: [NotificationResponseDto] })
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<NotificationResponseDto[]> {
    return this.notificationsService.findMine(user.idUsuario);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Listar notificaciones no leídas' })
  @ApiOkResponse({ type: [NotificationResponseDto] })
  findUnread(@CurrentUser() user: AuthenticatedUser): Promise<NotificationResponseDto[]> {
    return this.notificationsService.findMine(user.idUsuario, true);
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

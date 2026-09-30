import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
import { DeactivatePushTokenDto } from './dto/deactivate-push-token.dto.js';
import { PushTokenResponseDto } from './dto/push-token-response.dto.js';
import { RegisterPushTokenDto } from './dto/register-push-token.dto.js';
import { PushService } from './push.service.js';

@ApiTags('push-tokens')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('push-tokens')
export class PushTokensController {
  constructor(private readonly pushService: PushService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar o reactivar el Expo push token del celular autenticado' })
  @ApiOkResponse({ type: PushTokenResponseDto })
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<PushTokenResponseDto> {
    return this.pushService.register(user.idUsuario, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar el Expo push token de este celular al cerrar sesión' })
  @ApiOkResponse({ type: PushTokenResponseDto })
  @ApiNotFoundResponse({ description: 'El token no pertenece al usuario autenticado' })
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeactivatePushTokenDto,
  ): Promise<PushTokenResponseDto> {
    return this.pushService.deactivate(user.idUsuario, dto.token);
  }
}

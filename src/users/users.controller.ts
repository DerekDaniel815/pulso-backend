import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserSearchQueryDto } from './dto/user-search-query.dto.js';
import { UserResponseDto, UserSearchDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obtener el perfil del usuario autenticado' })
  @ApiOkResponse({ type: UserResponseDto })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.getMe(user.idUsuario);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar el perfil del usuario autenticado' })
  @ApiOkResponse({ type: UserResponseDto })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateMe(user.idUsuario, dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar usuarios para contactos o invitaciones' })
  @ApiOkResponse({ type: [UserSearchDto] })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UserSearchQueryDto,
  ): Promise<UserSearchDto[]> {
    return this.usersService.search(query.q, user.idUsuario);
  }
}

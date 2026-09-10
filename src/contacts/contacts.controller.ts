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
import { ContactsService } from './contacts.service.js';
import { ContactResponseDto } from './dto/contact-response.dto.js';
import { CreateContactRequestDto } from './dto/create-contact-request.dto.js';
import { UpdateLocationPermissionDto } from './dto/update-location-permission.dto.js';

@ApiTags('contacts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post('requests')
  @ApiOperation({ summary: 'Enviar una solicitud de contacto' })
  @ApiCreatedResponse({ type: ContactResponseDto })
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContactRequestDto,
  ): Promise<ContactResponseDto> {
    return this.contactsService.createRequest(user.idUsuario, dto.idUsuarioDestino);
  }

  @Get()
  @ApiOperation({ summary: 'Listar contactos aceptados' })
  @ApiOkResponse({ type: [ContactResponseDto] })
  findAccepted(@CurrentUser() user: AuthenticatedUser): Promise<ContactResponseDto[]> {
    return this.contactsService.findAccepted(user.idUsuario);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Listar solicitudes de contacto pendientes' })
  @ApiOkResponse({ type: [ContactResponseDto] })
  findRequests(@CurrentUser() user: AuthenticatedUser): Promise<ContactResponseDto[]> {
    return this.contactsService.findRequests(user.idUsuario);
  }

  @Patch('requests/:id/accept')
  @ApiOperation({ summary: 'Aceptar una solicitud de contacto' })
  @ApiOkResponse({ type: ContactResponseDto })
  @ApiForbiddenResponse({ description: 'Solo el destinatario puede aceptar' })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ContactResponseDto> {
    return this.contactsService.accept(user.idUsuario, id);
  }

  @Patch('requests/:id/reject')
  @ApiOperation({ summary: 'Rechazar una solicitud de contacto' })
  @ApiOkResponse({ type: ContactResponseDto })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ContactResponseDto> {
    return this.contactsService.reject(user.idUsuario, id);
  }

  @Patch(':id/location-permission')
  @ApiOperation({ summary: 'Activar o desactivar el permiso direccional de ubicación' })
  @ApiOkResponse({ type: ContactResponseDto })
  updateLocationPermission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocationPermissionDto,
  ): Promise<ContactResponseDto> {
    return this.contactsService.updateLocationPermission(user.idUsuario, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un contacto de forma lógica' })
  @ApiOkResponse({ type: ContactResponseDto })
  @ApiNotFoundResponse({ description: 'Contacto no encontrado' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ContactResponseDto> {
    return this.contactsService.remove(user.idUsuario, id);
  }
}

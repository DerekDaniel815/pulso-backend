import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
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
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolSistema } from '../common/enums.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { DevicesService } from './devices.service.js';
import { CreateDeviceDto } from './dto/create-device.dto.js';
import { DeviceCreatedResponseDto, DeviceResponseDto } from './dto/device-response.dto.js';
import { UpdateDeviceDto } from './dto/update-device.dto.js';

@ApiTags('devices')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente o inválido' })
@ApiForbiddenResponse({ description: 'Se requiere rol ADMIN de sistema' })
@UseGuards(RolesGuard)
@Roles(RolSistema.ADMIN)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar inventario de dispositivos (solo ADMIN)' })
  @ApiOkResponse({ type: [DeviceResponseDto] })
  findAll(): Promise<DeviceResponseDto[]> {
    return this.devicesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un dispositivo del inventario (solo ADMIN)' })
  @ApiOkResponse({ type: DeviceResponseDto })
  @ApiNotFoundResponse({ description: 'Dispositivo no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<DeviceResponseDto> {
    return this.devicesService.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un dispositivo GPS en inventario (solo ADMIN)',
    description:
      'El backend genera codigoDispositivo (formato PUL-XXXXXXXX) y devuelve deviceToken una sola vez.',
  })
  @ApiCreatedResponse({ type: DeviceCreatedResponseDto })
  @ApiConflictResponse({ description: 'IMEI o número de serie duplicado' })
  create(@Body() dto: CreateDeviceDto): Promise<DeviceCreatedResponseDto> {
    return this.devicesService.create(dto);
  }

  @Post(':id/token')
  @ApiOperation({
    summary: 'Regenerar el token de autenticación del dispositivo (solo ADMIN, invalida el anterior)',
  })
  @ApiCreatedResponse({ type: DeviceCreatedResponseDto })
  @ApiNotFoundResponse({ description: 'Dispositivo no encontrado' })
  regenerateToken(@Param('id', ParseIntPipe) id: number): Promise<DeviceCreatedResponseDto> {
    return this.devicesService.regenerateToken(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un dispositivo del inventario (solo ADMIN)',
    description: 'Usar estado=DISPONIBLE para pasar de FABRICADO a disponible para vinculación.',
  })
  @ApiOkResponse({ type: DeviceResponseDto })
  @ApiNotFoundResponse({ description: 'Dispositivo no encontrado' })
  @ApiConflictResponse({ description: 'El estado solicitado es inconsistente con la asignación' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeviceDto,
  ): Promise<DeviceResponseDto> {
    return this.devicesService.update(id, dto);
  }
}

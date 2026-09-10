import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoDispositivo } from '../common/enums.js';
import { generateCodigoDispositivo } from '../common/utils/codigo-dispositivo.js';
import { generateDeviceToken, hashDeviceToken } from '../common/utils/device-token.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateDeviceDto } from './dto/create-device.dto.js';
import {
  toDeviceCreatedResponse,
  toDeviceResponse,
  type DeviceCreatedResponseDto,
  type DeviceResponseDto,
} from './dto/device-response.dto.js';
import type { UpdateDeviceDto } from './dto/update-device.dto.js';

const MAX_CODE_GENERATION_ATTEMPTS = 10;

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<DeviceResponseDto[]> {
    const devices = await this.prisma.dispositivo.findMany({
      orderBy: { fechaRegistro: 'desc' },
    });

    return devices.map(toDeviceResponse);
  }

  async findOne(idDispositivo: number): Promise<DeviceResponseDto> {
    const device = await this.prisma.dispositivo.findUnique({
      where: { idDispositivo },
    });

    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado');
    }

    return toDeviceResponse(device);
  }

  async create(dto: CreateDeviceDto): Promise<DeviceCreatedResponseDto> {
    await this.assertUniquePhysicalIdentifiers(dto.imei, dto.numeroSerie);

    const deviceToken = generateDeviceToken();

    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const codigoDispositivo = generateCodigoDispositivo();
      const existingCode = await this.prisma.dispositivo.findUnique({
        where: { codigoDispositivo },
        select: { idDispositivo: true },
      });

      if (existingCode) {
        continue;
      }

      const device = await this.prisma.dispositivo.create({
        data: {
          codigoDispositivo,
          imei: dto.imei,
          modelo: dto.modelo,
          numeroSerie: dto.numeroSerie,
          estado: EstadoDispositivo.FABRICADO,
          fechaFabricacion: dto.fechaFabricacion ? new Date(dto.fechaFabricacion) : undefined,
          tokenHash: hashDeviceToken(deviceToken),
        },
      });

      return toDeviceCreatedResponse(device, deviceToken);
    }

    throw new ConflictException('No se pudo generar un código de dispositivo único');
  }

  async regenerateToken(idDispositivo: number): Promise<DeviceCreatedResponseDto> {
    const device = await this.prisma.dispositivo.findUnique({
      where: { idDispositivo },
    });

    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado');
    }

    const deviceToken = generateDeviceToken();
    const updated = await this.prisma.dispositivo.update({
      where: { idDispositivo },
      data: { tokenHash: hashDeviceToken(deviceToken) },
    });

    return toDeviceCreatedResponse(updated, deviceToken);
  }

  async touchConnection(idDispositivo: number): Promise<Date> {
    const now = new Date();
    await this.prisma.dispositivo.update({
      where: { idDispositivo },
      data: { ultimaConexion: now },
    });
    return now;
  }

  async update(idDispositivo: number, dto: UpdateDeviceDto): Promise<DeviceResponseDto> {
    const device = await this.prisma.dispositivo.findUnique({
      where: { idDispositivo },
      include: { asignaciones: { where: { estado: true } } },
    });

    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado');
    }

    if (dto.estado === EstadoDispositivo.BAJA && device.asignaciones.length > 0) {
      throw new ConflictException('No se puede dar de baja un dispositivo con asignación activa');
    }

    if (dto.estado === EstadoDispositivo.ASIGNADO && device.asignaciones.length === 0) {
      throw new ConflictException('No se puede marcar como ASIGNADO sin una asignación activa');
    }

    const updated = await this.prisma.dispositivo.update({
      where: { idDispositivo },
      data: {
        modelo: dto.modelo,
        estado: dto.estado,
      },
    });

    return toDeviceResponse(updated);
  }

  private async assertUniquePhysicalIdentifiers(imei?: string, numeroSerie?: string) {
    if (!imei && !numeroSerie) {
      return;
    }

    const existing = await this.prisma.dispositivo.findFirst({
      where: {
        OR: [...(imei ? [{ imei }] : []), ...(numeroSerie ? [{ numeroSerie }] : [])],
      },
    });

    if (existing) {
      throw new ConflictException('Ya existe un dispositivo con el mismo IMEI o número de serie');
    }
  }
}

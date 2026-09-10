import { Injectable, NotFoundException } from '@nestjs/common';
import type { Usuario } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { toUserResponse, toUserSearch, type UserResponseDto, type UserSearchDto } from './dto/user-response.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(idUsuario: number): Promise<Usuario | null> {
    return this.prisma.usuario.findUnique({ where: { idUsuario } });
  }

  async findActiveById(idUsuario: number): Promise<Usuario | null> {
    return this.prisma.usuario.findFirst({
      where: { idUsuario, estado: true },
    });
  }

  async findByCorreo(correo: string): Promise<Usuario | null> {
    return this.prisma.usuario.findFirst({
      where: {
        correo: { equals: correo, mode: 'insensitive' },
      },
    });
  }

  async getMe(idUsuario: number): Promise<UserResponseDto> {
    const user = await this.findById(idUsuario);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return toUserResponse(user);
  }

  async updateMe(idUsuario: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.findById(idUsuario);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const updated = await this.prisma.usuario.update({
      where: { idUsuario },
      data: {
        nombres: dto.nombres,
        apellidos: dto.apellidos,
        telefono: dto.telefono,
      },
    });

    return toUserResponse(updated);
  }

  async search(q: string, excludeUserId: number): Promise<UserSearchDto[]> {
    const users = await this.prisma.usuario.findMany({
      where: {
        estado: true,
        idUsuario: { not: excludeUserId },
        OR: [
          { nombres: { contains: q, mode: 'insensitive' } },
          { apellidos: { contains: q, mode: 'insensitive' } },
          { correo: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
    });

    return users.map(toUserSearch);
  }
}

import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { RolSistema } from '../common/enums.js';
import type { Usuario } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserResponse } from '../users/dto/user-response.dto.js';
import { UsersService } from '../users/users.service.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.usersService.findByCorreo(dto.correo);

    if (existing) {
      throw new ConflictException('El correo ya está registrado');
    }

    const passwordHash = await hash(dto.password, 12);
    const user = await this.prisma.usuario.create({
      data: {
        nombres: dto.nombres,
        apellidos: dto.apellidos,
        correo: dto.correo.toLowerCase(),
        telefono: dto.telefono,
        passwordHash,
        rol: RolSistema.USUARIO,
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByCorreo(dto.correo);

    if (!user || !user.estado) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const matches = await compare(dto.password, user.passwordHash);

    if (!matches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: Usuario): Promise<AuthResponseDto> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.idUsuario,
      correo: user.correo,
      rol: user.rol,
    });

    return {
      accessToken,
      user: toUserResponse(user),
    };
  }
}

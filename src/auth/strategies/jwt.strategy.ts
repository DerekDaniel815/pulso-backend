import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RolSistema } from '../../common/enums.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { UsersService } from '../../users/users.service.js';

type JwtPayload = {
  sub: number;
  correo: string;
  rol: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findActiveById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    return {
      idUsuario: user.idUsuario,
      correo: user.correo,
      nombres: user.nombres,
      apellidos: user.apellidos,
      rol: user.rol as RolSistema,
    };
  }
}

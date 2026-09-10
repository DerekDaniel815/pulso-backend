import type { RolSistema } from '../enums.js';

export type AuthenticatedUser = {
  idUsuario: number;
  correo: string;
  nombres: string;
  apellidos: string;
  rol: RolSistema;
};

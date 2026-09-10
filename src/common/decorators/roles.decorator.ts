import { SetMetadata } from '@nestjs/common';
import type { RolSistema } from '../enums.js';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RolSistema[]) => SetMetadata(ROLES_KEY, roles);

import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'pul_';

export function generateDeviceToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isDeviceTokenFormat(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX) && token.length > TOKEN_PREFIX.length + 20;
}

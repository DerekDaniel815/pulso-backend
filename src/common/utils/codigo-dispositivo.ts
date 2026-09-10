import { randomBytes } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCodigoDispositivo(): string {
  const suffix = Array.from({ length: 8 }, () => {
    const index = randomBytes(1)[0] % CODE_CHARS.length;
    return CODE_CHARS[index];
  }).join('');

  return `PUL-${suffix}`;
}

/**
 * Trama binaria Pulso v1, 30 bytes, little-endian.
 *
 * La cuantización coincide con el JSON HTTPS ya enviado: 6 decimales en
 * grados y 2 decimales en metros o m/s. No es una reducción adicional.
 *
 *  0 u8  version = 1
 *  1 u8  flags
 *        bit 0 offlineSync
 *        bit 1 hay altitud
 *        bit 2 hay velocidad
 *        bits 3..7 reservados en 0
 *  2 u16 reservado = 0
 *  4 i32 latitud en microgrados (grados × 1_000_000). Rango -90_000_000..90_000_000
 *  8 i32 longitud en microgrados. Rango -180_000_000..180_000_000
 * 12 i32 altitud en centímetros (metros × 100). 0x80000000 = ausente
 * 16 i16 velocidad en cm/s (m/s × 100). -32768 = ausente. Rango válido 0..32767
 * 18 u16 reservado = 0
 * 20 u32 timestamp del dispositivo, segundos Unix UTC. El JSON actual tampoco lleva milisegundos
 * 24 u32 secuencia de idempotencia. 0 no se usa
 * 28 u16 CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) de los bytes 0..27
 */

export const LOCATION_FRAME_BYTES = 30;
export const LOCATION_FRAME_VERSION = 1;
export const ALTITUDE_ABSENT = 0x80000000;
export const SPEED_ABSENT = 0x8000;

const FLAG_OFFLINE = 0x01;
const FLAG_ALTITUDE = 0x02;
const FLAG_SPEED = 0x04;

export type LocationFrame = {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  deviceTimestamp: string;
  offlineSync: boolean;
  sequence: number;
};

export class LocationFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationFrameError';
  }
}

export function roundHalfAway(value: number): number {
  if (!Number.isFinite(value)) {
    throw new LocationFrameError('Valor numérico no finito');
  }
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function crc16CcittFalse(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function writeInt32(view: DataView, offset: number, value: number): void {
  view.setInt32(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

export function encodeLocationFrame(frame: LocationFrame): Buffer {
  if (!Number.isInteger(frame.sequence) || frame.sequence <= 0 || frame.sequence > 0xffffffff) {
    throw new LocationFrameError('La secuencia debe ser un entero entre 1 y 4294967295');
  }
  const latitude = roundHalfAway(frame.latitude * 1_000_000);
  const longitude = roundHalfAway(frame.longitude * 1_000_000);
  if (latitude < -90_000_000 || latitude > 90_000_000 || longitude < -180_000_000 || longitude > 180_000_000) {
    throw new LocationFrameError('Coordenada fuera de rango');
  }
  if (latitude === 0 && longitude === 0) {
    throw new LocationFrameError('Coordenada nula rechazada');
  }

  let flags = frame.offlineSync ? FLAG_OFFLINE : 0;
  let altitude = ALTITUDE_ABSENT;
  if (frame.altitude != null) {
    altitude = roundHalfAway(frame.altitude * 100);
    if (altitude === ALTITUDE_ABSENT || altitude < -2147483648 || altitude > 2147483647) {
      throw new LocationFrameError('Altitud fuera de rango');
    }
    flags |= FLAG_ALTITUDE;
  }
  let speed = SPEED_ABSENT;
  if (frame.speed != null) {
    speed = roundHalfAway(frame.speed * 100);
    if (speed < 0 || speed > 32767) {
      throw new LocationFrameError('Velocidad fuera de rango');
    }
    flags |= FLAG_SPEED;
  }

  const time = Date.parse(frame.deviceTimestamp);
  if (!Number.isFinite(time)) {
    throw new LocationFrameError('Timestamp del dispositivo inválido');
  }
  const unix = Math.floor(time / 1000);
  if (unix < 0 || unix > 0xffffffff) {
    throw new LocationFrameError('Timestamp fuera del rango de 32 bits');
  }

  const buffer = Buffer.alloc(LOCATION_FRAME_BYTES);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  buffer[0] = LOCATION_FRAME_VERSION;
  buffer[1] = flags;
  view.setUint16(2, 0, true);
  writeInt32(view, 4, latitude);
  writeInt32(view, 8, longitude);
  writeUint32(view, 12, altitude >>> 0);
  view.setInt16(16, speed, true);
  view.setUint16(18, 0, true);
  writeUint32(view, 20, unix);
  writeUint32(view, 24, frame.sequence);
  view.setUint16(28, crc16CcittFalse(buffer.subarray(0, 28)), true);
  return buffer;
}

export function decodeLocationFrame(payload: Buffer): LocationFrame {
  if (payload.length !== LOCATION_FRAME_BYTES) {
    throw new LocationFrameError(`La trama debe medir ${LOCATION_FRAME_BYTES} bytes`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const expected = crc16CcittFalse(payload.subarray(0, 28));
  if (view.getUint16(28, true) !== expected) {
    throw new LocationFrameError('CRC de la trama inválido');
  }
  if (payload[0] !== LOCATION_FRAME_VERSION) {
    throw new LocationFrameError('Versión de trama no soportada');
  }
  const flags = payload[1];
  if ((flags & ~0x07) !== 0 || view.getUint16(2, true) !== 0 || view.getUint16(18, true) !== 0) {
    throw new LocationFrameError('La trama trae bits reservados');
  }
  const latitude = view.getInt32(4, true);
  const longitude = view.getInt32(8, true);
  if (latitude < -90_000_000 || latitude > 90_000_000 || longitude < -180_000_000 || longitude > 180_000_000) {
    throw new LocationFrameError('Coordenada fuera de rango');
  }
  const altitudeRaw = view.getUint32(12, true);
  const speedRaw = view.getInt16(16, true);
  const hasAltitude = (flags & FLAG_ALTITUDE) !== 0;
  const hasSpeed = (flags & FLAG_SPEED) !== 0;
  if (hasAltitude === (altitudeRaw === ALTITUDE_ABSENT) || hasSpeed === (speedRaw === -32768)) {
    throw new LocationFrameError('Los flags no coinciden con los campos ausentes');
  }
  if (hasSpeed && speedRaw < 0) {
    throw new LocationFrameError('Velocidad negativa');
  }
  const sequence = view.getUint32(24, true);
  if (sequence === 0) {
    throw new LocationFrameError('Secuencia 0 rechazada');
  }
  const unix = view.getUint32(20, true);
  return {
    latitude: latitude / 1_000_000,
    longitude: longitude / 1_000_000,
    altitude: hasAltitude ? altitudeRaw / 100 : undefined,
    speed: hasSpeed ? speedRaw / 100 : undefined,
    deviceTimestamp: new Date(unix * 1000).toISOString(),
    offlineSync: (flags & FLAG_OFFLINE) !== 0,
    sequence,
  };
}

export const CONTROL_FRAME_BYTES = 10;
export const CONTROL_FRAME_VERSION = 1;

export type ControlFrame = {
  trackingEnabled: boolean;
  emergencyActive: boolean;
  revision: number;
};

export function encodeControlFrame(frame: ControlFrame): Buffer {
  if (!Number.isInteger(frame.revision) || frame.revision <= 0 || frame.revision > 0xffffffff) {
    throw new LocationFrameError('La revisión de control debe ser un entero entre 1 y 4294967295');
  }
  const buffer = Buffer.alloc(CONTROL_FRAME_BYTES);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  buffer[0] = CONTROL_FRAME_VERSION;
  buffer[1] = (frame.trackingEnabled ? 0x01 : 0) | (frame.emergencyActive ? 0x02 : 0);
  view.setUint16(2, 0, true);
  view.setUint32(4, frame.revision, true);
  view.setUint16(8, crc16CcittFalse(buffer.subarray(0, 8)), true);
  return buffer;
}

export function decodeControlFrame(payload: Buffer): ControlFrame {
  if (payload.length !== CONTROL_FRAME_BYTES) {
    throw new LocationFrameError(`La orden debe medir ${CONTROL_FRAME_BYTES} bytes`);
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint16(8, true) !== crc16CcittFalse(payload.subarray(0, 8))) {
    throw new LocationFrameError('CRC de la orden inválido');
  }
  if (payload[0] !== CONTROL_FRAME_VERSION || (payload[1] & ~0x03) !== 0 || view.getUint16(2, true) !== 0) {
    throw new LocationFrameError('Orden de control no soportada');
  }
  const revision = view.getUint32(4, true);
  if (revision === 0) {
    throw new LocationFrameError('Revisión 0 rechazada');
  }
  return {
    trackingEnabled: (payload[1] & 0x01) !== 0,
    emergencyActive: (payload[1] & 0x02) !== 0,
    revision,
  };
}

const CODE_PATTERN = /^PUL-[A-Z0-9]{8}$/;

export function deviceTopics(code: string): { location: string; control: string; status: string } {
  if (!CODE_PATTERN.test(code)) {
    throw new LocationFrameError('Código de dispositivo inválido');
  }
  const base = `pulso/v1/${code}`;
  return {
    location: `${base}/loc`,
    control: `${base}/ctl`,
    status: `${base}/status`,
  };
}

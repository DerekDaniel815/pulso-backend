import { describe, expect, it } from 'vitest';
import {
  CONTROL_FRAME_BYTES,
  LOCATION_FRAME_BYTES,
  decodeControlFrame,
  decodeLocationFrame,
  deviceTopics,
  encodeControlFrame,
  encodeLocationFrame,
} from './location-frame.js';

const sample = {
  latitude: -12.046374,
  longitude: -77.042793,
  altitude: 154.5,
  speed: 1.4,
  deviceTimestamp: '2026-10-23T07:20:10.000Z',
  offlineSync: false,
  sequence: 42,
};

function unixFromCivil(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  let y = year;
  y -= month <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  return days * 86400 + hour * 3600 + minute * 60 + second;
}

describe('trama de ubicación v1', () => {
  it('usa segundos Unix civiles, los mismos que el codificador del firmware', () => {
    expect(unixFromCivil(2026, 10, 23, 7, 20, 10)).toBe(Date.parse('2026-10-23T07:20:10.000Z') / 1000);
  });

  it('mide 30 bytes y conserva la cuantización del JSON HTTPS', () => {
    const encoded = encodeLocationFrame(sample);
    expect(encoded).toHaveLength(LOCATION_FRAME_BYTES);
    const decoded = decodeLocationFrame(encoded);
    expect(decoded.latitude).toBe(-12.046374);
    expect(decoded.longitude).toBe(-77.042793);
    expect(decoded.altitude).toBe(154.5);
    expect(decoded.speed).toBe(1.4);
    expect(decoded.deviceTimestamp).toBe('2026-10-23T07:20:10.000Z');
    expect(decoded.offlineSync).toBe(false);
    expect(decoded.sequence).toBe(42);
  });

  it('rechaza un CRC alterado y una coordenada fuera de rango', () => {
    const encoded = encodeLocationFrame(sample);
    encoded[4] ^= 0xff;
    expect(() => decodeLocationFrame(encoded)).toThrow(/CRC/);
    expect(() => encodeLocationFrame({ ...sample, latitude: 91 })).toThrow(/rango/);
  });

  it('marca offlineSync sin convertir el punto en una orden de marcador vivo', () => {
    const encoded = encodeLocationFrame({ ...sample, offlineSync: true, altitude: undefined, speed: undefined });
    const decoded = decodeLocationFrame(encoded);
    expect(decoded.offlineSync).toBe(true);
    expect(decoded.altitude).toBeUndefined();
    expect(decoded.speed).toBeUndefined();
  });
});

describe('orden de control', () => {
  it('mide 10 bytes y exige una revisión creciente', () => {
    const encoded = encodeControlFrame({
      trackingEnabled: false,
      emergencyActive: true,
      revision: 7,
    });
    expect(encoded).toHaveLength(CONTROL_FRAME_BYTES);
    expect(decodeControlFrame(encoded)).toEqual({
      trackingEnabled: false,
      emergencyActive: true,
      revision: 7,
    });
    expect(() => encodeControlFrame({ trackingEnabled: true, emergencyActive: false, revision: 0 })).toThrow(
      /revisión/i,
    );
  });
});

describe('topics por dispositivo', () => {
  it('deriva telemetría, control y estado del código público', () => {
    expect(deviceTopics('PUL-GDZH8RQQ')).toEqual({
      location: 'pulso/v1/PUL-GDZH8RQQ/loc',
      control: 'pulso/v1/PUL-GDZH8RQQ/ctl',
      status: 'pulso/v1/PUL-GDZH8RQQ/status',
    });
    expect(() => deviceTopics('pul_secreto')).toThrow(/Código/);
  });
});

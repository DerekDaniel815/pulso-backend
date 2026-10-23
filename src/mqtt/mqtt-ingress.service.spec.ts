import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoDispositivo } from '../common/enums.js';
import { encodeLocationFrame, decodeControlFrame } from './location-frame.js';
import { MqttIngressService } from './mqtt-ingress.service.js';

const code = 'PUL-GDZH8RQQ';
const locationTopic = `pulso/v1/${code}/loc`;
const controlTopic = `pulso/v1/${code}/ctl`;
const statusTopic = `pulso/v1/${code}/status`;

const frame = {
  latitude: -12.046374,
  longitude: -77.042793,
  altitude: 154.5,
  speed: 1.4,
  deviceTimestamp: '2026-10-23T07:20:10.000Z',
  offlineSync: false,
  sequence: 42,
};

function harness() {
  const reportLocation = vi.fn().mockResolvedValue({
    trackingEnabled: true,
    emergencyActive: false,
    receivedAt: '2026-10-23T07:20:16.000Z',
  });
  const publish = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    dispositivo: {
      findFirst: vi.fn().mockResolvedValue({
        idDispositivo: 15,
        codigoDispositivo: code,
        estado: EstadoDispositivo.ASIGNADO,
        asignaciones: [{ idUsuarioDispositivo: 13, idUsuario: 17, ubicacionActiva: true }],
      }),
      update: vi.fn().mockResolvedValue({ idDispositivo: 15 }),
    },
    emergencia: {
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ mqtt_control_revision: 3 }]),
  };
  const service = new MqttIngressService(prisma as never, { reportLocation } as never, { publish } as never);
  return { service, reportLocation, publish, prisma };
}

describe('ingreso MQTT de ubicaciones', () => {
  let ctx: ReturnType<typeof harness>;

  beforeEach(() => {
    ctx = harness();
  });

  it('entrega la trama al mismo reportLocation que el POST HTTPS', async () => {
    const result = await ctx.service.ingest(code, locationTopic, encodeLocationFrame(frame));

    expect(result.accepted).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(ctx.reportLocation).toHaveBeenCalledWith(
      expect.objectContaining({ idUsuarioDispositivo: 13, ubicacionActiva: true }),
      expect.objectContaining({
        latitude: -12.046374,
        longitude: -77.042793,
        altitude: 154.5,
        speed: 1.4,
        deviceTimestamp: '2026-10-23T07:20:10.000Z',
        offlineSync: false,
      }),
    );
    const control = decodeControlFrame(ctx.publish.mock.calls[0][1] as Buffer);
    expect(ctx.publish.mock.calls[0][0]).toBe(controlTopic);
    expect(control).toEqual({ trackingEnabled: true, emergencyActive: false, revision: 3 });
  });

  it('no vuelve a guardar un PUBLISH QoS 1 repetido', async () => {
    ctx.prisma.$executeRaw.mockRejectedValueOnce({ code: '23505' });

    const result = await ctx.service.ingest(code, locationTopic, encodeLocationFrame(frame));

    expect(result.duplicate).toBe(true);
    expect(result.accepted).toBe(false);
    expect(ctx.reportLocation).not.toHaveBeenCalled();
    expect(ctx.publish).toHaveBeenCalledOnce();
  });

  it('conserva offlineSync para que un punto antiguo no refresque el marcador', async () => {
    await ctx.service.ingest(
      code,
      locationTopic,
      encodeLocationFrame({ ...frame, offlineSync: true, sequence: 43 }),
    );

    expect(ctx.reportLocation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ offlineSync: true }),
    );
  });

  it('con el seguimiento apagado no inserta y devuelve la orden de pausa', async () => {
    ctx.reportLocation.mockRejectedValue(
      new ForbiddenException({
        message: 'Seguimiento desactivado',
        trackingEnabled: false,
        emergencyActive: true,
      }),
    );

    const result = await ctx.service.ingest(code, locationTopic, encodeLocationFrame(frame));

    expect(result.accepted).toBe(false);
    expect(result.trackingEnabled).toBe(false);
    expect(result.emergencyActive).toBe(true);
    expect(ctx.prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(decodeControlFrame(ctx.publish.mock.calls[0][1] as Buffer).trackingEnabled).toBe(false);
  });

  it('un last will offline no toca la emergencia ni guarda una ubicación', async () => {
    const result = await ctx.service.ingest(code, statusTopic, Buffer.from([0]));

    expect(result.presence).toBe('offline');
    expect(result.emergencyActive).toBe(true);
    expect(ctx.reportLocation).not.toHaveBeenCalled();
    expect(ctx.prisma.dispositivo.update).not.toHaveBeenCalled();
    expect(ctx.prisma.emergencia.update).not.toHaveBeenCalled();
    expect(ctx.publish).not.toHaveBeenCalled();
  });

  it('rechaza el topic de otro dispositivo', async () => {
    await expect(ctx.service.ingest(code, 'pulso/v1/PUL-OTRODISP/loc', encodeLocationFrame(frame))).rejects.toThrow(
      /no pertenece/,
    );
    expect(ctx.reportLocation).not.toHaveBeenCalled();
  });
});

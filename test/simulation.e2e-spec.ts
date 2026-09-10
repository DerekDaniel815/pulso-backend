import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolSistema } from '../src/common/enums.js';
import type { AuthenticatedUser } from '../src/common/types/authenticated-user.js';
import { DeviceApiService } from '../src/device-api/device-api.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SimulationEnabledGuard } from '../src/simulation/guards/simulation-enabled.guard.js';
import { SimulationController } from '../src/simulation/simulation.controller.js';
import { SimulationSessionService } from '../src/simulation/simulation-session.service.js';
import { SimulationService } from '../src/simulation/simulation.service.js';

const mockUser: AuthenticatedUser = {
  idUsuario: 1,
  correo: 'user@test.com',
  nombres: 'Test',
  apellidos: 'User',
  rol: RolSistema.USUARIO,
};

const mockSession = {
  idSimulationSession: 99,
  idUsuarioDispositivo: 10,
  estado: 'ACTIVA',
  ultimaActividad: '2026-09-10T12:00:00.000Z',
  expiraEn: '2026-09-10T12:00:45.000Z',
  fechaInicio: '2026-09-10T12:00:00.000Z',
  fechaFin: null,
};

async function createSimulationApp(enableFlag: boolean) {
  const reportLocation = vi.fn().mockResolvedValue({
    ok: true,
    receivedAt: '2026-09-09T23:45:21.000Z',
  });
  const reportEmergency = vi.fn().mockResolvedValue({
    codigoPublico: 'EME-TEST0001',
    estado: 'ACTIVA',
    receivedAt: '2026-09-09T23:47:13.000Z',
  });
  const findUnique = vi.fn();
  const ensureSession = vi.fn().mockResolvedValue(mockSession);
  const getActiveSession = vi.fn().mockResolvedValue(mockSession);
  const endSession = vi.fn().mockResolvedValue({ ...mockSession, estado: 'FINALIZADA' });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [() => ({ ENABLE_DEVICE_SIMULATION: enableFlag ? 'true' : 'false' })],
      }),
    ],
    controllers: [SimulationController],
    providers: [
      SimulationService,
      SimulationEnabledGuard,
      {
        provide: DeviceApiService,
        useValue: { reportLocation, reportEmergency },
      },
      {
        provide: SimulationSessionService,
        useValue: { ensureSession, getActiveSession, endSession, renewSession: ensureSession, setTracking: ensureSession },
      },
      {
        provide: PrismaService,
        useValue: { usuarioDispositivo: { findUnique } },
      },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use((req: { user?: AuthenticatedUser }, _res, next) => {
    req.user = mockUser;
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  return { app, reportLocation, reportEmergency, findUnique, ensureSession };
}

describe('Simulation (e2e)', () => {
  describe('feature flag desactivado', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      ({ app } = await createSimulationApp(false));
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /simulation/user-devices/:id/locations responde 404', async () => {
      await request(app.getHttpServer())
        .post('/simulation/user-devices/10/locations')
        .send({
          latitude: 4.6097,
          longitude: -74.0817,
          deviceTimestamp: '2026-09-09T18:45:20-05:00',
        })
        .expect(404);
    });
  });

  describe('feature flag activado', () => {
    let app: INestApplication<App>;
    let reportLocation: ReturnType<typeof vi.fn>;
    let reportEmergency: ReturnType<typeof vi.fn>;
    let findUnique: ReturnType<typeof vi.fn>;
    let ensureSession: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      ({ app, reportLocation, reportEmergency, findUnique, ensureSession } =
        await createSimulationApp(true));
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /simulation/user-devices/:id/session crea o renueva sesión', async () => {
      const response = await request(app.getHttpServer())
        .post('/simulation/user-devices/10/session')
        .expect(201);

      expect(response.body.idSimulationSession).toBe(99);
      expect(response.body.expiraEn).toBe('2026-09-10T12:00:45.000Z');
      expect(ensureSession).toHaveBeenCalledWith(1, 10);
    });

    it('GET /simulation/user-devices/:id/session devuelve sesión activa', async () => {
      const response = await request(app.getHttpServer())
        .get('/simulation/user-devices/10/session')
        .expect(200);

      expect(response.body.estado).toBe('ACTIVA');
    });

    it('POST /simulation/user-devices/:id/heartbeat devuelve ok y expiresAt', async () => {
      const response = await request(app.getHttpServer())
        .post('/simulation/user-devices/10/heartbeat')
        .expect(201);

      expect(response.body).toEqual({
        ok: true,
        expiresAt: '2026-09-10T12:00:45.000Z',
      });
    });

    it('POST /simulation/user-devices/:id/locations delega en DeviceApiService para asignación propia', async () => {
      findUnique.mockResolvedValue({
        idUsuario: 1,
        idUsuarioDispositivo: 10,
        idDispositivo: 5,
        estado: true,
        ubicacionActiva: true,
        dispositivo: {
          idDispositivo: 5,
          codigoDispositivo: 'PUL-TEST1234',
          estado: 'ASIGNADO',
        },
      });

      await request(app.getHttpServer())
        .post('/simulation/user-devices/10/locations')
        .send({
          latitude: 4.6097,
          longitude: -74.0817,
          accuracy: 10,
          deviceTimestamp: '2026-09-09T18:45:20-05:00',
        })
        .expect(201);

      expect(ensureSession).toHaveBeenCalledWith(1, 10);
      expect(reportLocation).toHaveBeenCalledOnce();
    });

    it('POST /simulation/user-devices/:id/locations responde 403 para asignación ajena', async () => {
      findUnique.mockResolvedValue({
        idUsuario: 2,
        idUsuarioDispositivo: 10,
        idDispositivo: 5,
        estado: true,
        ubicacionActiva: true,
        dispositivo: {
          idDispositivo: 5,
          codigoDispositivo: 'PUL-TEST1234',
          estado: 'ASIGNADO',
        },
      });

      await request(app.getHttpServer())
        .post('/simulation/user-devices/10/locations')
        .send({
          latitude: 4.6097,
          longitude: -74.0817,
          deviceTimestamp: '2026-09-09T18:45:20-05:00',
        })
        .expect(403);

      expect(reportLocation).not.toHaveBeenCalled();
    });

    it('POST /simulation/user-devices/:id/emergencies delega SOS con idSimulationSession', async () => {
      findUnique.mockResolvedValue({
        idUsuario: 1,
        idUsuarioDispositivo: 10,
        idDispositivo: 5,
        estado: true,
        ubicacionActiva: false,
        dispositivo: {
          idDispositivo: 5,
          codigoDispositivo: 'PUL-TEST1234',
          estado: 'ASIGNADO',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/simulation/user-devices/10/emergencies')
        .send({
          type: 'SOS',
          deviceTimestamp: '2026-09-09T18:47:12-05:00',
          location: {
            latitude: 4.6097,
            longitude: -74.0817,
            accuracy: 12,
          },
        })
        .expect(201);

      expect(response.body.codigoPublico).toBe('EME-TEST0001');
      expect(reportEmergency).toHaveBeenCalledWith(
        expect.objectContaining({ idUsuarioDispositivo: 10 }),
        expect.any(Object),
        99,
      );
    });
  });
});

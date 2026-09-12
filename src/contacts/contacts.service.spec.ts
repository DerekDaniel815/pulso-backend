import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoContacto, TipoNotificacion } from '../common/enums.js';
import { ContactsService } from './contacts.service.js';

const users = {
  1: { idUsuario: 1, nombres: 'Ana', apellidos: 'A' },
  2: { idUsuario: 2, nombres: 'Bruno', apellidos: 'B' },
};

function buildContact(overrides: Record<string, unknown> = {}) {
  return {
    idUsuarioContacto: 10,
    idUsuario1: 1,
    idUsuario2: 2,
    idUsuarioSolicitante: 1,
    estado: EstadoContacto.PENDIENTE,
    usuario1ComparteUbicacion: false,
    usuario2ComparteUbicacion: false,
    fechaSolicitud: new Date(),
    fechaRespuesta: null,
    fechaActualizacion: new Date(),
    usuario1: users[1],
    usuario2: users[2],
    ...overrides,
  };
}

describe('ContactsService', () => {
  let service: ContactsService;
  let prisma: {
    usuario: { findFirst: ReturnType<typeof vi.fn> };
    usuarioContacto: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let createForUsers: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      usuario: { findFirst: vi.fn().mockResolvedValue(users[2]) },
      usuarioContacto: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma)),
    };
    createForUsers = vi.fn().mockResolvedValue(null);
    service = new ContactsService(prisma as never, { createForUsers } as never);
  });

  it('rechaza auto-solicitud', async () => {
    await expect(service.createRequest(1, 1)).rejects.toThrow(BadRequestException);
  });

  it('crea solicitud PENDIENTE y notifica al destinatario', async () => {
    prisma.usuarioContacto.findUnique.mockResolvedValue(null);
    prisma.usuarioContacto.create.mockResolvedValue(buildContact());

    const result = await service.createRequest(1, 2);

    expect(result.estado).toBe(EstadoContacto.PENDIENTE);
    expect(createForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: TipoNotificacion.SOLICITUD_CONTACTO,
        userIds: [2],
      }),
      prisma,
    );
  });

  it('rechaza solicitud duplicada pendiente o aceptada', async () => {
    prisma.usuarioContacto.findUnique.mockResolvedValue(buildContact());

    await expect(service.createRequest(1, 2)).rejects.toThrow(ConflictException);
  });

  it('acepta solo el destinatario y notifica al emisor', async () => {
    prisma.usuarioContacto.findUnique.mockResolvedValue(buildContact());
    prisma.usuarioContacto.update.mockResolvedValue(
      buildContact({ estado: EstadoContacto.ACEPTADO }),
    );

    await service.accept(2, 10);

    expect(createForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: TipoNotificacion.CONTACTO_AGREGADO,
        userIds: [1],
      }),
      prisma,
    );
  });

  it('el solicitante no puede aceptar su propia solicitud', async () => {
    prisma.usuarioContacto.findUnique.mockResolvedValue(buildContact());

    await expect(service.accept(1, 10)).rejects.toThrow(ForbiddenException);
  });

  it('rechaza y notifica al emisor', async () => {
    prisma.usuarioContacto.findUnique.mockResolvedValue(buildContact());
    prisma.usuarioContacto.update.mockResolvedValue(
      buildContact({ estado: EstadoContacto.RECHAZADO }),
    );

    await service.reject(2, 10);

    expect(createForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: TipoNotificacion.CONTACTO_RECHAZADO,
        userIds: [1],
      }),
      prisma,
    );
  });

  it('el destinatario no puede cancelar; el solicitante sí', async () => {
    prisma.usuarioContacto.findUnique.mockResolvedValue(buildContact());

    await expect(service.cancel(2, 10)).rejects.toThrow(ForbiddenException);

    prisma.usuarioContacto.update.mockResolvedValue(
      buildContact({ estado: EstadoContacto.CANCELADO }),
    );
    const cancelled = await service.cancel(1, 10);
    expect(cancelled.estado).toBe(EstadoContacto.CANCELADO);
  });

  it('el permiso de ubicación A→B es independiente de B→A', async () => {
    const accepted = buildContact({ estado: EstadoContacto.ACEPTADO });
    prisma.usuarioContacto.findUnique.mockResolvedValue(accepted);
    prisma.usuarioContacto.update.mockResolvedValue({
      ...accepted,
      usuario1ComparteUbicacion: true,
    });

    const fromA = await service.updateLocationPermission(1, 10, { comparteUbicacion: true });
    expect(fromA.yoCompartoUbicacion).toBe(true);
    expect(fromA.contactoComparteUbicacion).toBe(false);
  });

  it('eliminar contacto deja estado ELIMINADO y apaga flags', async () => {
    prisma.usuarioContacto.findUnique.mockResolvedValue(
      buildContact({ estado: EstadoContacto.ACEPTADO, usuario1ComparteUbicacion: true }),
    );
    prisma.usuarioContacto.update.mockResolvedValue(
      buildContact({
        estado: EstadoContacto.ELIMINADO,
        usuario1ComparteUbicacion: false,
        usuario2ComparteUbicacion: false,
      }),
    );

    const removed = await service.remove(1, 10);
    expect(removed.estado).toBe(EstadoContacto.ELIMINADO);
    expect(prisma.usuarioContacto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoContacto.ELIMINADO,
          usuario1ComparteUbicacion: false,
          usuario2ComparteUbicacion: false,
        }),
      }),
    );
  });
});

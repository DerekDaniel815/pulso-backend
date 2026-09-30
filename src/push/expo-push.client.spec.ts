import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPO_PUSH_URL, ExpoPushClient, type ExpoPushMessage } from './expo-push.client.js';

const message: ExpoPushMessage = {
  to: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]',
  title: 'Contacto agregado',
  body: 'Ahora son contactos.',
  data: {
    idNotificacionUsuario: '1',
    tipo: 'CONTACTO_AGREGADO',
    tipoReferencia: 'CONTACTO',
    idReferencia: '10',
  },
};

describe('ExpoPushClient', () => {
  let client: ExpoPushClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    client = new ExpoPushClient({ get: vi.fn().mockReturnValue(undefined) } as never);
  });

  it('envía el lote a Expo Push Service', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    } as Response);

    const tickets = await client.send([message]);

    expect(fetch).toHaveBeenCalledWith(
      EXPO_PUSH_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify([message]),
      }),
    );
    expect(tickets).toEqual([{ status: 'ok', id: 'ticket-1' }]);
  });

  it('propaga un HTTP de error para que el caller lo trate como best-effort', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);

    await expect(client.send([message])).rejects.toThrow('HTTP 500');
  });
});

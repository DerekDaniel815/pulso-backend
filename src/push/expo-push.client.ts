import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_CHUNK = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: {
    idNotificacionUsuario: string;
    tipo: string;
    tipoReferencia: string;
    idReferencia: string;
  };
};

export type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
  errors?: { message?: string }[];
};

@Injectable()
export class ExpoPushClient {
  private readonly logger = new Logger(ExpoPushClient.name);

  constructor(private readonly configService: ConfigService) {}

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) {
      return [];
    }

    const tickets: ExpoPushTicket[] = [];

    for (let index = 0; index < messages.length; index += EXPO_PUSH_CHUNK) {
      const chunk = messages.slice(index, index + EXPO_PUSH_CHUNK);
      tickets.push(...(await this.sendChunk(chunk)));
    }

    return tickets;
  }

  private async sendChunk(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const accessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      throw new Error(`Expo push respondió HTTP ${response.status}`);
    }

    const body = (await response.json()) as ExpoPushResponse;

    if (body.errors?.length) {
      const detail = body.errors.map((error) => error.message ?? 'error').join('; ');
      throw new Error(`Expo push rechazó el lote: ${detail}`);
    }

    if (!body.data) {
      this.logger.warn('Expo push respondió sin tickets');
      return [];
    }

    return body.data;
  }
}

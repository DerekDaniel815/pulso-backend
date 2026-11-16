import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';
import { AppService } from './app.service.js';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Healthcheck básico' })
  @ApiOkResponse({ description: 'Servicio activo' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Healthcheck para la plataforma de despliegue' })
  @ApiOkResponse({
    description: 'Servicio activo',
    schema: { example: { status: 'ok' } },
  })
  getHealth(): { status: 'ok'; revision?: string } {
    const revision = process.env.RENDER_GIT_COMMIT;
    if (revision == null || !/^[0-9a-f]{7,40}$/.test(revision)) {
      return { status: 'ok' };
    }
    return { status: 'ok', revision };
  }
}

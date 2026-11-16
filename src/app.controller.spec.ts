import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should report an ok status', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok' });
    });

    it('incluye la revisión publicada cuando la plataforma la entrega', () => {
      const previous = process.env.RENDER_GIT_COMMIT;
      process.env.RENDER_GIT_COMMIT = 'afb79c6deadbeef';
      expect(appController.getHealth()).toEqual({ status: 'ok', revision: 'afb79c6deadbeef' });
      if (previous == null) {
        delete process.env.RENDER_GIT_COMMIT;
      } else {
        process.env.RENDER_GIT_COMMIT = previous;
      }
    });
  });
});

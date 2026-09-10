import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ContactsController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}

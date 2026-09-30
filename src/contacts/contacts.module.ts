import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ContactsController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';

@Module({
  imports: [NotificationsModule, LocationsModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}

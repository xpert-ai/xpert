import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    AnnouncementEntity,
    AnnouncementDismissal,
    AnnouncementAudit,
    NotificationOutbox
} from '../user-notification/notification.entities'
import { AnnouncementService } from './announcement.service'
import { AnnouncementController, AnnouncementAdminController } from './announcement.controller'

@Module({
    imports: [
        TypeOrmModule.forFeature([AnnouncementEntity, AnnouncementDismissal, AnnouncementAudit, NotificationOutbox])
    ],
    providers: [AnnouncementService],
    controllers: [AnnouncementController, AnnouncementAdminController],
    exports: [AnnouncementService]
})
export class AnnouncementModule {}

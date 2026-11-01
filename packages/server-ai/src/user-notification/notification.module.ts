import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule } from '@xpert-ai/server-core'
import { AnnouncementModule } from '../announcement/announcement.module'
import { USER_NOTIFICATION_ENTITIES } from './notification.entities'
import { UserNotificationService } from './notification.service'
import { NotificationRealtime } from './notification.realtime'
import { NotificationWorker } from './notification.worker'
import { UserNotificationController, NotificationDeliveryAdminController } from './notification.controller'

@Module({
    imports: [CqrsModule, RedisModule, AnnouncementModule, TypeOrmModule.forFeature(USER_NOTIFICATION_ENTITIES)],
    providers: [UserNotificationService, NotificationRealtime, NotificationWorker],
    controllers: [UserNotificationController, NotificationDeliveryAdminController]
})
export class UserNotificationModule {}

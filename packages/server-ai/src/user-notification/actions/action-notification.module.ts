import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ActionNotificationSources } from './action-notification.sources'
import { PublishActionNotificationHandler } from './commands/handlers/publish-action-notification.handler'
import { PendingActionNotificationsHandler } from './queries/pending-action-notifications.query'

@Module({
    imports: [CqrsModule],
    providers: [ActionNotificationSources, PublishActionNotificationHandler, PendingActionNotificationsHandler],
    exports: [ActionNotificationSources]
})
export class ActionNotificationModule {}

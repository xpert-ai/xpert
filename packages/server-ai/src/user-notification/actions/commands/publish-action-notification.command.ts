import type { ActionNotificationSource, ActionNotificationPresentation } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'

/** An exact source version and its current recipients, supplied by the owning domain. */
export class PublishActionNotificationCommand extends Command<void> {
    constructor(
        readonly input: {
            tenantId: string
            source: ActionNotificationSource
            recipientIds: string[]
            state: ActionNotificationPresentation['state']
        }
    ) {
        super()
    }
}

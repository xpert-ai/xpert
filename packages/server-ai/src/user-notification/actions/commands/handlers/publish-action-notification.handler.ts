// The domain's durable record is the recovery source. Projection and invalidation commit together.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { actionNotificationSourceSchema } from '@xpert-ai/contracts'
import { UserNotificationEntity } from '../../../notification.entities'
import { enqueueNotification } from '../../../notification.outbox'
import { PublishActionNotificationCommand } from '../publish-action-notification.command'

@CommandHandler(PublishActionNotificationCommand)
export class PublishActionNotificationHandler implements ICommandHandler<PublishActionNotificationCommand> {
    constructor(private readonly database: DataSource) {}

    async execute({ input }: PublishActionNotificationCommand) {
        const source = actionNotificationSourceSchema.parse(input.source)
        const eventKey = `action:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`
        await this.database.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                `notification:${input.tenantId}:${eventKey}`
            ])
            const rows = await manager.findBy(UserNotificationEntity, { tenantId: input.tenantId, eventKey })
            const recipients = new Set(input.recipientIds)
            // Terminal sources never create new historical notifications for newly assigned users.
            if (input.state === 'pending') {
                for (const userId of recipients) {
                    if (rows.some((row) => row.userId === userId)) continue
                    const row = manager.create(UserNotificationEntity, {
                        tenantId: input.tenantId,
                        userId,
                        eventKey,
                        kind: 'action.required',
                        source,
                        actionState: 'pending',
                        resolvedAt: null,
                        readAt: null
                    })
                    await manager.save(row)
                    rows.push(row)
                    await enqueueNotification(manager, row.tenantId, row.userId, `action:${row.id}:created`, {
                        type: 'changed'
                    })
                }
            }
            for (const row of rows) {
                const state = recipients.has(row.userId) ? input.state : 'closed'
                if (row.actionState === state) continue
                row.actionState = state
                row.resolvedAt = state === 'pending' ? null : new Date()
                await manager.save(row)
                await enqueueNotification(manager, row.tenantId, row.userId, `action:${row.id}:${randomUUID()}`, {
                    type: 'changed'
                })
            }
        })
    }
}

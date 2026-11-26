// Failed operations are the durable notification source, including failures predating this worker.
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineRecoveryNotificationSource } from './pipeline-recovery-notification.source'
import { PublishActionNotificationCommand } from '../../../user-notification/actions/commands/publish-action-notification.command'
import { PendingActionNotificationsQuery } from '../../../user-notification/actions/queries/pending-action-notifications.query'

@Injectable()
export class ProjectPipelineRecoveryNotificationWorker {
    private running = false
    private afterId: string | undefined
    private pendingAfterId: string | undefined
    private readonly logger = new Logger(ProjectPipelineRecoveryNotificationWorker.name)
    constructor(
        private readonly database: DataSource,
        private readonly source: ProjectPipelineRecoveryNotificationSource,
        private readonly commands: CommandBus,
        private readonly queries: QueryBus
    ) {}

    @Interval(5000)
    async recover() {
        if (this.running) return
        this.running = true
        try {
            const query = this.database
                .getRepository(ProjectPipelineOperationEntity)
                .createQueryBuilder('a')
                .withDeleted()
                .where('a.kind = :kind', { kind: 'operation' })
                .andWhere("(a.state = 'failed' OR a.updatedAt >= :since)", {
                    since: new Date(Date.now() - 90 * 86400000)
                })
            if (this.afterId) query.andWhere('a.id > :afterId', { afterId: this.afterId })
            const rows = await query.orderBy('a.id', 'ASC').take(40).getMany()
            this.afterId = rows.length === 40 ? rows[rows.length - 1].id : undefined
            for (const attention of rows) {
                try {
                    const current = attention.deletedAt ? null : await this.source.describe(attention)
                    await this.commands.execute(
                        new PublishActionNotificationCommand({
                            tenantId: attention.tenantId,
                            source: this.source.reference(attention),
                            recipientIds: current?.recipientIds ?? [],
                            state: current?.presentation.state ?? 'closed'
                        })
                    )
                } catch {
                    // Advance the scan; one invalid/unavailable plugin must not starve other recipients.
                    this.logger.warn('Pipeline recovery notification deferred')
                }
            }
            // Reconcile retained projections even if the domain record was hard-deleted or aged out.
            const pending = await this.queries.execute(
                new PendingActionNotificationsQuery(this.source.key, this.pendingAfterId)
            )
            this.pendingAfterId = pending.length === 40 ? pending[pending.length - 1].id : undefined
            for (const row of pending) {
                try {
                    const attention = await this.database
                        .getRepository(ProjectPipelineOperationEntity)
                        .findOneBy({ tenantId: row.tenantId, id: row.source.key, kind: 'operation' })
                    const current =
                        attention && this.source.reference(attention).version === row.source.version
                            ? await this.source.describe(attention)
                            : null
                    if (current?.presentation.state === 'pending') continue
                    await this.commands.execute(
                        new PublishActionNotificationCommand({
                            tenantId: row.tenantId,
                            source: row.source,
                            recipientIds: current?.recipientIds ?? [],
                            state: current?.presentation.state ?? 'closed'
                        })
                    )
                } catch {
                    this.logger.warn('Pipeline recovery notification reconciliation deferred')
                }
            }
        } catch {
            this.logger.warn('Pipeline recovery notification scan deferred')
        } finally {
            this.running = false
        }
    }
}

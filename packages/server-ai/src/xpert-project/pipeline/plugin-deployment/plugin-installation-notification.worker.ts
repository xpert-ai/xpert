// Operation inputs and immutable installation authorizations are the durable notification source.
// Reconciliation includes pre-upgrade operations and never authorizes or dispatches an installation.
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { projectPluginDeploymentRefs } from '@xpert-ai/contracts'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { ProjectPluginInstallationNotificationSource } from './plugin-installation-notification.source'
import { PublishActionNotificationCommand } from '../../../user-notification/actions/commands/publish-action-notification.command'
import { PendingActionNotificationsQuery } from '../../../user-notification/actions/queries/pending-action-notifications.query'

@Injectable()
export class ProjectPluginInstallationNotificationWorker {
    private running = false
    private afterId: string | undefined
    private pendingAfterId: string | undefined
    private readonly logger = new Logger(ProjectPluginInstallationNotificationWorker.name)
    constructor(
        private readonly database: DataSource,
        private readonly source: ProjectPluginInstallationNotificationSource,
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
                .where('a.kind = :kind AND a.handlerRef = :ref', {
                    kind: 'operation',
                    ref: projectPluginDeploymentRefs.operation
                })
                .andWhere("(a.state IN ('dispatching', 'pending', 'unknown') OR a.updatedAt >= :since)", {
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
                    this.logger.warn('Plugin installation notification deferred')
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
                        .findOneBy({
                            tenantId: row.tenantId,
                            id: row.source.key,
                            kind: 'operation',
                            handlerRef: projectPluginDeploymentRefs.operation
                        })
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
                    this.logger.warn('Plugin installation notification reconciliation deferred')
                }
            }
        } catch {
            this.logger.warn('Plugin installation notification scan deferred')
        } finally {
            this.running = false
        }
    }
}

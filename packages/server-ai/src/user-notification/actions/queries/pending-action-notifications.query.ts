import { Query, QueryHandler, IQueryHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { actionNotificationSourceSchema, type ActionNotificationSource } from '@xpert-ai/contracts'
import { UserNotificationEntity } from '../../notification.entities'

type PendingActionReference = { id: string; tenantId: string; source: ActionNotificationSource }
/** Internal reconciliation references, never a recipient-facing access API. */
export class PendingActionNotificationsQuery extends Query<PendingActionReference[]> {
    constructor(
        readonly provider: string,
        readonly afterId?: string
    ) {
        super()
    }
}

@QueryHandler(PendingActionNotificationsQuery)
export class PendingActionNotificationsHandler implements IQueryHandler<PendingActionNotificationsQuery> {
    constructor(private readonly database: DataSource) {}
    async execute(query: PendingActionNotificationsQuery): Promise<PendingActionReference[]> {
        const builder = this.database
            .getRepository(UserNotificationEntity)
            .createQueryBuilder('n')
            .where("n.kind = 'action.required' AND n.actionState = 'pending' AND n.source->>'provider' = :provider", {
                provider: query.provider
            })
        if (query.afterId) builder.andWhere('n.id > :afterId', { afterId: query.afterId })
        const rows = await builder.orderBy('n.id', 'ASC').take(40).getMany()
        return rows.map((row) => {
            const source = actionNotificationSourceSchema.parse(row.source)
            return {
                id: row.id,
                tenantId: row.tenantId,
                source: { type: 'action', provider: source.provider, key: source.key, version: source.version }
            }
        })
    }
}

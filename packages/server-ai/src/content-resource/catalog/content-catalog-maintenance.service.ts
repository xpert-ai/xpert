import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThanOrEqual, Repository } from 'typeorm'
import { User } from '@xpert-ai/server-core'
import { ContentOperations } from './content-operations.service'
import { ContentCatalogService } from './content-catalog.service'
import { runWithCapturedRequestContext } from '../../shared/request-context'

@Injectable()
export class ContentCatalogMaintenance implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>
    private running = false
    private readonly logger = new Logger(ContentCatalogMaintenance.name)
    constructor(
        private readonly operations: ContentOperations,
        private readonly catalog: ContentCatalogService,
        @InjectRepository(User) private readonly users: Repository<User>
    ) {}
    onModuleInit() {
        this.timer = setInterval(() => void this.repair(), 30_000)
        this.timer.unref()
    }
    onModuleDestroy() {
        clearInterval(this.timer)
    }
    async repair() {
        if (this.running) return
        this.running = true
        try {
            const rows = await this.operations.rows.find({
                where: { status: In(['pending', 'failed']), nextAttemptAt: LessThanOrEqual(new Date()) },
                order: { nextAttemptAt: 'ASC', id: 'ASC' },
                take: 20
            })
            for (const row of rows) {
                // Lease survives process death. Duplicate execution remains safe because providers
                // use create-only request identities and revision-guarded projection writes.
                const claimed = await this.operations.rows.update(
                    { id: row.id, nextAttemptAt: row.nextAttemptAt },
                    { nextAttemptAt: new Date(Date.now() + 120_000) }
                )
                if (!claimed.affected) continue
                try {
                    const actor = row.payload.input.actor
                    const user = await this.users.findOneOrFail({
                        where: { id: actor.userId, tenantId: actor.tenantId }
                    })
                    await runWithCapturedRequestContext(
                        { user, headers: { 'tenant-id': actor.tenantId, 'organization-id': actor.organizationId } },
                        async () => {
                            if (row.payload.kind === 'create') await this.catalog.create(row.payload.input)
                            else if (row.payload.kind === 'duplicate') await this.catalog.mutate(row.payload.input)
                            else await this.catalog.reconcile(row.payload.input)
                        }
                    )
                    await this.operations.finish(row)
                } catch (error) {
                    await this.operations.finish(row, error)
                }
            }
        } catch {
            this.logger.warn('Content catalog recovery scan deferred')
        } finally {
            this.running = false
        }
    }
}

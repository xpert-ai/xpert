import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThan, Repository } from 'typeorm'
import { CollaborationDocument } from './entities'
import { CollaborationService } from './collaboration.service'

/** Durable pending/failed checkpoints survive a missing queue job or process restart.
 * Retry the latest committed state through the same provider, never a browser/session token. */
@Injectable()
export class CollaborationMaintenance implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CollaborationMaintenance.name)
    private timer: ReturnType<typeof setInterval> | undefined
    private running = false
    constructor(
        @InjectRepository(CollaborationDocument) private readonly documents: Repository<CollaborationDocument>,
        private readonly collaboration: CollaborationService
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
            // Let immediate queue retries finish first. Provider materialization is
            // idempotent and revision guarded, including simultaneous server scans.
            const rows = await this.documents.find({
                where: {
                    status: 'active',
                    materializationStatus: In(['pending', 'failed']),
                    updatedAt: LessThan(new Date(Date.now() - 30_000))
                },
                select: { id: true },
                order: { updatedAt: 'ASC', id: 'ASC' },
                take: 20
            })
            for (const row of rows) {
                try {
                    await this.collaboration.retryMaterialization(row.id)
                } catch {
                    this.logger.debug(`Collaboration recovery deferred for ${row.id}`)
                }
            }
        } catch {
            this.logger.warn('Collaboration recovery scan deferred')
        } finally {
            this.running = false
        }
    }
}

// Invariants: only the owning execution attempt may renew a job lease.
// Renewal never resurrects a completed/requeued job, and stops when its worker exits.
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { getErrorMessage } from '@xpert-ai/server-common'
import { In, Repository } from 'typeorm'
import { KnowledgeWikiJob } from './entities'

const LEASE_MS = 5 * 60_000
const HEARTBEAT_MS = 60_000

@Injectable()
export class KnowledgeWikiJobLeaseService {
    private readonly logger = new Logger(KnowledgeWikiJobLeaseService.name)

    constructor(@InjectRepository(KnowledgeWikiJob) private readonly jobs: Repository<KnowledgeWikiJob>) {}

    async acquire(job: KnowledgeWikiJob) {
        const executionAttempt = job.executionAttempt + 1
        const acquired = await this.jobs.update(
            { id: job.id, status: In(['queued', 'failed']), executionAttempt: job.executionAttempt, isCurrent: true },
            {
                status: 'running',
                executionAttempt,
                lockedAt: new Date(),
                ...this.heartbeat(),
                error: null,
                errorCode: null
            }
        )
        if (!acquired.affected) return null
        job.executionAttempt = executionAttempt
        job.status = 'running'
        let pending: Promise<void> | undefined
        const timer = setInterval(() => {
            if (pending) return
            pending = this.jobs
                .update({ id: job.id, executionAttempt, status: 'running', isCurrent: true }, this.heartbeat())
                .then((result) => {
                    if (!result.affected) clearInterval(timer)
                })
                .catch((error: unknown) => {
                    this.logger.error(getErrorMessage(error))
                })
                .finally(() => {
                    pending = undefined
                })
        }, HEARTBEAT_MS)
        timer.unref()
        return async () => {
            clearInterval(timer)
            await pending
        }
    }

    private heartbeat() {
        return { heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + LEASE_MS) }
    }
}

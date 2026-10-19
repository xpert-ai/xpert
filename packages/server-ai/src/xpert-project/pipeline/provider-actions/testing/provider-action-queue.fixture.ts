import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'bullmq'
import {
    ManagedQueueService,
    ManagedQueueHandlerRegistryService,
    ManagedQueueProcessor,
    type ManagedQueueEnvelope,
    type UserService
} from '@xpert-ai/server-core'
import { ProjectPipelineProviderActionStore } from '../provider-action.store'
import { ProjectPipelineProviderActionsService } from '../provider-actions.service'
import {
    PIPELINE_PROVIDER_ACTION_JOB,
    ProjectPipelineProviderActionWorkerService
} from '../provider-action-worker.service'

/** Real Redis + production ManagedQueue; only user storage is replaced by a test fixture. */
export function providerActionQueueFixture(
    store: ProjectPipelineProviderActionStore,
    actions: ProjectPipelineProviderActionsService,
    redisUrl: string
) {
    const url = new URL(redisUrl),
        connection = { host: url.hostname, port: Number(url.port), maxRetriesPerRequest: null }
    const queue = new Queue<ManagedQueueEnvelope>(`pipeline-action-test-${randomUUID()}`, { connection })
    const managed = new ManagedQueueService(queue)
    const service = () => new ProjectPipelineProviderActionWorkerService(store, actions, managed)
    const workers: Worker<ManagedQueueEnvelope>[] = []
    return {
        recover: () => service().recover(),
        startWorker: () => {
            const handlers = new ManagedQueueHandlerRegistryService(),
                observer = service()
            handlers.register({
                ...PIPELINE_PROVIDER_ACTION_JOB,
                concurrency: 4,
                handler: (job, scope) => observer.handle(job, scope)
            })
            const users = { findOneByIdWithinTenant: async (id: string, tenantId: string) => ({ id, tenantId }) }
            const processor = new ManagedQueueProcessor(handlers, users as UserService)
            const worker = new Worker<ManagedQueueEnvelope>(queue.name, (job) => processor.process(job), {
                connection,
                concurrency: 4
            })
            workers.push(worker)
            return worker
        },
        close: async () => {
            await Promise.all(workers.map((worker) => worker.close()))
            await queue.obliterate({ force: true })
            await queue.close()
        }
    }
}

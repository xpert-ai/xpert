import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'bullmq'
import {
    ManagedQueueService,
    ManagedQueueHandlerRegistryService,
    ManagedQueueProcessor,
    type ManagedQueueEnvelope,
    type UserService
} from '@xpert-ai/server-core'
import { ProjectPipelineOperationStore } from '../pipeline-operation.store'
import { ProjectPipelineOperationRunnerService } from '../pipeline-operation-runner.service'
import { PIPELINE_OPERATION_JOB, ProjectPipelineOperationWorkerService } from '../pipeline-operation-worker.service'

export function operationQueueFixture(
    store: ProjectPipelineOperationStore,
    runner: ProjectPipelineOperationRunnerService,
    redisUrl: string
) {
    const url = new URL(redisUrl),
        connection = { host: url.hostname, port: Number(url.port), maxRetriesPerRequest: null }
    const queue = new Queue<ManagedQueueEnvelope>(`pipeline-operation-test-${randomUUID()}`, { connection })
    const managed = new ManagedQueueService(
        queue,
        queue,
        { getJob: jest.fn().mockResolvedValue(null) } as never,
        { getJob: jest.fn().mockResolvedValue(null) } as never,
        { producer: jest.fn().mockResolvedValue(undefined) } as never
    )
    const service = () => new ProjectPipelineOperationWorkerService(store, runner, managed)
    const workers: Worker<ManagedQueueEnvelope>[] = []
    return {
        recover: () => service().recover(),
        startWorker: () => {
            const handlers = new ManagedQueueHandlerRegistryService(),
                observer = service()
            handlers.register({
                ...PIPELINE_OPERATION_JOB,
                concurrency: 4,
                handler: (job, scope) => observer.handle(job, scope)
            })
            const users = { findOneByIdWithinTenant: async (id: string, tenantId: string) => ({ id, tenantId }) }
            const processor = new ManagedQueueProcessor(
                handlers,
                users as UserService,
                undefined as never,
                undefined as never
            )
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

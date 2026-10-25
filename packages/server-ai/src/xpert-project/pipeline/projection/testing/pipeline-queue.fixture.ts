import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'bullmq'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { DataSource } from 'typeorm'
import {
    ProjectPipelineProjectionProviderRegistry,
    getTenantGlobalScopeKey,
    type IProjectPipelineProjectionProvider,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import {
    ManagedQueueService,
    ManagedQueueProcessor,
    ManagedQueueHandlerRegistryService,
    type ManagedQueueEnvelope,
    type UserService
} from '@xpert-ai/server-core'
import { runWithCapturedRequestContext } from '../../../../shared/request-context'
import { ProjectAccessRuntimeService } from '../../../services/project-access-runtime.service'
import { ProjectPipelineRefreshEntity } from '../../persistence/pipeline.entity'
import { ProjectPipelineRefreshStore } from '../pipeline-refresh.store'
import { ProjectPipelineProjectionStore } from '../pipeline-projection.store'
import { PIPELINE_PROJECTION_JOB, ProjectPipelineProjectionService } from '../pipeline-projection.service'

/** Production ManagedQueue envelope/processor; only identity storage and project ACL are test doubles. */
export function pipelineQueueFixture(
    db: DataSource,
    store: ProjectPipelineProjectionStore,
    provider: IProjectPipelineProjectionProvider,
    context: ProjectPipelineContext,
    redisUrl: string
) {
    const url = new URL(redisUrl)
    const connection = { host: url.hostname, port: Number(url.port), maxRetriesPerRequest: null }
    const queue = new Queue<ManagedQueueEnvelope>(`pipeline-acceptance-${randomUUID()}`, { connection })
    const managed = new ManagedQueueService(
        queue,
        queue,
        { getJob: jest.fn().mockResolvedValue(null) } as never,
        { getJob: jest.fn().mockResolvedValue(null) } as never,
        { producer: jest.fn().mockResolvedValue(undefined) } as never
    )
    const enqueue = managed.enqueue.bind(managed)
    jest.spyOn(managed, 'enqueue').mockImplementation((input) => enqueue({ ...input, backoffMs: 500 }))
    const registry = new ProjectPipelineProjectionProviderRegistry({} as DiscoveryService, new Reflector())
    registry.register(provider.key, provider, {
        kind: 'plugin',
        pluginName: 'neutral',
        scopeKey: getTenantGlobalScopeKey(context.actor.tenantId)
    })
    const access = {
        listReadable: async (input: { actor: ProjectPipelineContext['actor']; projectIds: string[] }) =>
            input.actor.userId === context.actor.userId &&
            input.actor.tenantId === context.actor.tenantId &&
            input.actor.organizationId === context.actor.organizationId &&
            input.projectIds[0] === context.projectId
                ? [{ role: 'viewer' }]
                : []
    }
    const createService = () =>
        new ProjectPipelineProjectionService(
            store,
            access as ProjectAccessRuntimeService,
            registry,
            { list: () => [] } as never,
            managed,
            new ProjectPipelineRefreshStore(db.getRepository(ProjectPipelineRefreshEntity))
        )
    const workers: Worker<ManagedQueueEnvelope>[] = []
    return {
        queue,
        request: () =>
            runWithCapturedRequestContext(
                {
                    user: { id: context.actor.userId, tenantId: context.actor.tenantId },
                    headers: {
                        'tenant-id': context.actor.tenantId,
                        'organization-id': context.actor.organizationId!,
                        'x-scope-level': 'organization'
                    }
                },
                () => createService().request(context, { providerRef: provider.key, sourceKey: 'case-a' })
            ),
        startWorker: () => {
            const registry = new ManagedQueueHandlerRegistryService(),
                service = createService()
            registry.register({
                ...PIPELINE_PROJECTION_JOB,
                concurrency: 2,
                handler: (job, scope) => service.handle(job, scope)
            })
            const users = { findOneByIdWithinTenant: async (id: string, tenantId: string) => ({ id, tenantId }) }
            const processor = new ManagedQueueProcessor(
                registry,
                users as UserService,
                undefined as never,
                undefined as never
            )
            const worker = new Worker<ManagedQueueEnvelope>(queue.name, (job) => processor.process(job), {
                connection,
                concurrency: 2
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

export async function untilPipeline(check: () => Promise<boolean>, timeout = 15_000) {
    const deadline = Date.now() + timeout
    while (!(await check())) {
        if (Date.now() > deadline) throw new Error('Pipeline acceptance condition timed out')
        await new Promise((resolve) => setTimeout(resolve, 25))
    }
}

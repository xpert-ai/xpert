jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    PLUGIN_JOB_PROCESSOR_METADATA,
    ProjectTaskProviderRegistry
} from '@xpert-ai/plugin-sdk'
import { ProjectTaskProjectionService, PROJECT_TASK_PROJECTION_JOB } from './project-task-projection.service'
import { ProjectTaskProjectionStore } from './project-task-projection.store'
import { ProjectTaskProjectionCoordinator } from './project-task-projection.coordinator'
import { ProjectAccessRuntimeService } from '../project-access-runtime.service'

const context = {
    projectId: randomUUID(),
    actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
}
const requestRevision = randomUUID()
const job = {
    data: { projectId: context.projectId, requestRevision },
    name: 'refresh',
    attemptsMade: 0,
    updateData: jest.fn()
}
const scope = { ...PROJECT_TASK_PROJECTION_JOB, ...context.actor }

async function fixture() {
    const claim = { context, revision: requestRevision, token: 'lease' }
    const coordinator = {
        invalidate: jest.fn().mockResolvedValue(requestRevision),
        claim: jest.fn().mockResolvedValue(claim),
        assertCurrent: jest.fn(),
        finish: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        diagnostics: jest.fn().mockResolvedValue([])
    }
    const store = { apply: jest.fn().mockResolvedValue([]) }
    const queue = { enqueue: jest.fn().mockResolvedValue({ jobId: 'queued' }) }
    const provider = { key: 'bid.tasks', snapshot: jest.fn(), linked: jest.fn() }
    const providers = [provider]
    const access = { listReadable: jest.fn().mockResolvedValue([{ role: 'editor' }]) }
    const module = await Test.createTestingModule({
        providers: [
            ProjectTaskProjectionService,
            { provide: ProjectTaskProjectionCoordinator, useValue: coordinator },
            { provide: ProjectTaskProjectionStore, useValue: store },
            { provide: ProjectAccessRuntimeService, useValue: access },
            { provide: ProjectTaskProviderRegistry, useValue: { list: () => providers } },
            { provide: MANAGED_QUEUE_SERVICE_TOKEN, useValue: queue }
        ]
    }).compile()
    return {
        module,
        coordinator,
        store,
        queue,
        provider,
        providers,
        access,
        claim,
        service: module.get(ProjectTaskProjectionService)
    }
}

describe('managed project task projection', () => {
    afterEach(() => jest.useRealTimers())

    it('keeps other providers synchronized when one provider fails', async () => {
        const f = await fixture()
        const independent = {
            key: 'other.tasks',
            snapshot: jest.fn().mockResolvedValue({ tasks: [] }),
            linked: jest.fn()
        }
        f.providers.push(independent)
        f.provider.snapshot.mockRejectedValue(new Error('bid temporarily unavailable'))
        try {
            await expect(f.service.handle(job, scope)).rejects.toThrow('bid temporarily unavailable')
            expect(independent.linked).toHaveBeenCalledWith(context, [])
            expect(f.coordinator.finish).toHaveBeenCalledWith(f.claim, [
                { providerKey: 'bid.tasks', message: 'bid temporarily unavailable' }
            ])
        } finally {
            await f.module.close()
        }
    })

    it('registers with the platform queue and acknowledges only a durably accepted scoped wake-up', async () => {
        const f = await fixture()
        try {
            expect(Reflect.getMetadata(PLUGIN_JOB_PROCESSOR_METADATA, ProjectTaskProjectionService)).toEqual([
                { ...PROJECT_TASK_PROJECTION_JOB, concurrency: 1 }
            ])
            await expect(f.service.request(context)).resolves.toEqual({ status: 'queued' })
            expect(f.queue.enqueue).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...scope,
                    payload: job.data,
                    jobId: `project-task-refresh-${requestRevision}`,
                    attempts: 60,
                    backoffMs: { type: 'fixed', delay: 5000 }
                })
            )
            expect(f.provider.snapshot).not.toHaveBeenCalled()
            f.queue.enqueue.mockRejectedValueOnce(new Error('queue unavailable'))
            await expect(f.service.request(context)).rejects.toThrow('queue unavailable')
        } finally {
            await f.module.close()
        }
    })

    it('revalidates the restored actor and rejects missing scope or untrusted payload fields', async () => {
        const f = await fixture()
        try {
            await expect(f.service.handle(job, { ...scope, userId: undefined })).rejects.toThrow()
            await expect(
                f.service.handle({ ...job, data: { ...job.data, tenantId: 'override' } }, scope)
            ).rejects.toThrow()
            f.access.listReadable.mockResolvedValueOnce([])
            await expect(f.service.handle(job, scope)).rejects.toThrow()
            expect(f.coordinator.claim).not.toHaveBeenCalled()
            expect(f.provider.snapshot).not.toHaveBeenCalled()
        } finally {
            await f.module.close()
        }
    })

    it('records callback timeout, throws for queue retry and discards a late snapshot', async () => {
        jest.useFakeTimers()
        const f = await fixture()
        let resolve: (value: { revision: string; tasks: [] }) => void
        f.provider.snapshot.mockReturnValue(
            new Promise((done) => {
                resolve = done
            })
        )
        try {
            const running = expect(f.service.handle(job, scope)).rejects.toThrow()
            await jest.advanceTimersByTimeAsync(30_001)
            await running
            expect(f.coordinator.finish).toHaveBeenCalledWith(f.claim, [
                expect.objectContaining({ providerKey: 'bid.tasks' })
            ])
            expect(f.coordinator.release).toHaveBeenCalledWith(f.claim)
            resolve({ revision: 'late', tasks: [] })
            await Promise.resolve()
            expect(f.store.apply).not.toHaveBeenCalled()
        } finally {
            await f.module.close()
        }
    })

    it('skips completed revisions and retries a linked callback failure without claiming success', async () => {
        const f = await fixture()
        try {
            f.coordinator.claim.mockResolvedValueOnce(null)
            await f.service.handle(job, scope)
            expect(f.provider.snapshot).not.toHaveBeenCalled()
            f.provider.snapshot.mockResolvedValue({ revision: 'current', tasks: [] })
            f.provider.linked.mockRejectedValueOnce(new Error('link unavailable'))
            await expect(f.service.handle(job, scope)).rejects.toThrow('link unavailable')
            expect(f.coordinator.finish).not.toHaveBeenCalledWith(f.claim, [])
            await f.service.handle(job, scope)
            expect(f.coordinator.finish).toHaveBeenLastCalledWith(f.claim, [])
        } finally {
            await f.module.close()
        }
    })
})

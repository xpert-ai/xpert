import { Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { AiModelTypeEnum, KnowledgebaseStatusEnum } from '@xpert-ai/contracts'
import { runWithExecutionIdentity } from '@xpert-ai/server-core'
import { DataSource, FindOptionsWhere, IsNull, Repository } from 'typeorm'
import { Queue } from 'bull'
import { KnowledgebaseRebuildOperations } from './knowledgebase-rebuild.operations'
import { Knowledgebase } from '../persistence/knowledgebase.entity'
import { TKnowledgebaseRebuildEmbeddingJob } from '../shared/types'
import { createService } from '../testing/knowledgebase-service.fixture'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { executionIdentityFixture } from '../../shared/testing/execution-identity.fixture'
import { KnowledgeDocumentService } from '../../knowledge-document/document.service'

const data: TKnowledgebaseRebuildEmbeddingJob = {
    userId: 'user',
    tenantId: 'tenant',
    organizationId: 'org',
    knowledgebaseId: 'kb',
    rebuildTaskId: 'task-1',
    pendingEmbeddingRevision: 2
}

function fixture() {
    const state = Object.assign(new Knowledgebase(), {
        id: 'kb',
        tenantId: 'tenant',
        organizationId: 'org',
        workspaceId: 'workspace',
        createdById: 'user',
        status: KnowledgebaseStatusEnum.REBUILDING,
        rebuildTaskId: 'task-1',
        pendingEmbeddingRevision: 2,
        embeddingRebuildError: null,
        embeddingRevision: 1,
        embeddingCollectionName: 'old-vectors',
        embeddingModelFingerprint: 'old',
        pendingEmbeddingModelFingerprint: 'new',
        pendingEmbeddingCollectionName: 'new-vectors',
        pendingEmbeddingDimensions: 1024,
        copilotModel: { id: 'old-model', copilotId: null, model: 'old', modelType: AiModelTypeEnum.TEXT_EMBEDDING },
        pendingCopilotModel: {
            id: 'new-model',
            copilotId: 'connection',
            model: 'new',
            modelType: AiModelTypeEnum.TEXT_EMBEDDING
        },
        pendingCopilotModelId: 'new-model'
    })
    const identity = executionIdentityFixture({ userId: 'user', tenantId: 'tenant', organizationId: 'org' })
    const workspace = Object.assign(new XpertWorkspace(), {
        id: 'workspace',
        tenantId: 'tenant',
        organizationId: 'org',
        ownerId: 'user',
        members: []
    })
    const access = new XpertWorkspaceAccessService(
        Object.assign(Object.create(Repository.prototype) as Repository<XpertWorkspace>, {
            findOne: jest.fn(async () => workspace)
        })
    )
    const repository = {
        findOne: jest
            .fn<ReturnType<Repository<Knowledgebase>['findOne']>, Parameters<Repository<Knowledgebase>['findOne']>>()
            .mockImplementation(async () => Object.assign(new Knowledgebase(), state)),
        delete: jest.fn(),
        save: jest.fn(async (row: Knowledgebase) => Object.assign(state, row)),
        update: jest.fn(async (where: FindOptionsWhere<Knowledgebase>, patch: Partial<Knowledgebase>) => {
            const matches = Object.entries(where).every(([key, value]) => Reflect.get(state, key) === value)
            if (matches) Object.assign(state, patch)
            return { affected: matches ? 1 : 0, raw: {}, generatedMaps: [] }
        })
    }
    const service = createService({
        repository,
        workspaceAccessService: {
            assertCan: jest.fn((...args: Parameters<XpertWorkspaceAccessService['assertCan']>) =>
                access.assertCan(...args)
            )
        },
        commandBus: { execute: jest.fn() },
        xpertService: { updateXpert: jest.fn() }
    })
    const vector = { clear: jest.fn(), addKnowledgeChunks: jest.fn(), embeddingModelContextSize: 4096 }
    const chunkRepository = { find: jest.fn(async () => []), save: jest.fn() }
    const manager = {
        getRepository: jest.fn((target: unknown) => (target === Knowledgebase ? repository : chunkRepository))
    }
    const database = {
        ...manager,
        transaction: jest.fn(async (fn: (transactionManager: typeof manager) => Promise<Knowledgebase>) => fn(manager))
    }
    const terminal = { data, failedReason: 'Access denied to workspace', getState: jest.fn(async () => 'failed') }
    const queue = {
        add: jest.fn(async () => ({ id: 'queued' })),
        getJob: jest.fn(async () => terminal),
        getJobs: jest.fn(async () => [])
    }
    const commands = { execute: jest.fn(async () => identity) }
    const operations = new KnowledgebaseRebuildOperations({
        commandBus: commands as unknown as CommandBus,
        logger: new Logger('rebuild-test'),
        dataSource: database as unknown as DataSource,
        assertKnowledgebaseWriteAccess: service.assertKnowledgebaseWriteAccess.bind(service),
        findOne: service.findOne.bind(service),
        save: service.save.bind(service),
        update: service.update.bind(service),
        createVectorStoreForModel: jest.fn().mockResolvedValue(vector),
        getPendingVectorStoreForRebuild: jest.fn().mockResolvedValue(vector),
        getPendingVectorStoreRelations: () => [],
        getEmbeddingModelName: (model) => model?.model,
        getEmbeddingProviderName: () => 'provider',
        rebuildQueue: queue as unknown as Queue<TKnowledgebaseRebuildEmbeddingJob>,
        documentService: { findAllEmbeddingNodes: jest.fn(async () => []) } as unknown as KnowledgeDocumentService
    })
    return {
        state,
        identity,
        repository,
        queue,
        terminal,
        commands,
        operations,
        vector,
        run: <T>(fn: () => Promise<T>) => runWithExecutionIdentity(identity, fn)
    }
}

describe('Embedding rebuild lifecycle with actual workspace authorization', () => {
    it('an authorized owner promotes a pending connection after a legacy null binding', async () => {
        const f = fixture()
        const result = await f.run(() => f.operations.processEmbeddingRebuildJob(data))
        expect(result).toMatchObject({
            status: KnowledgebaseStatusEnum.READY,
            copilotModelId: 'new-model',
            copilotModel: { copilotId: 'connection' },
            embeddingCollectionName: 'new-vectors'
        })
        expect(f.vector.clear).toHaveBeenCalled()
        expect(f.state.pendingCopilotModelId).toBeNull()
        expect(f.commands.execute).toHaveBeenCalledTimes(1)
    })

    it('denied write access stops vector work but still persists the scoped terminal error', async () => {
        const f = fixture()
        f.identity.user.role.rolePermissions = []
        await expect(f.run(() => f.operations.processEmbeddingRebuildJob(data))).rejects.toThrow(
            'Access denied to workspace'
        )
        expect(f.vector.clear).not.toHaveBeenCalled()
        await f.operations.markEmbeddingRebuildFailed(data, 'Access denied')
        expect(f.state).toMatchObject({
            status: KnowledgebaseStatusEnum.REBUILD_FAILED,
            embeddingCollectionName: 'old-vectors',
            pendingCopilotModelId: 'new-model'
        })
        expect(f.repository.update).toHaveBeenCalledWith(
            {
                id: 'kb',
                tenantId: 'tenant',
                organizationId: 'org',
                rebuildTaskId: 'task-1',
                pendingEmbeddingRevision: 2,
                status: KnowledgebaseStatusEnum.REBUILDING
            },
            { status: KnowledgebaseStatusEnum.REBUILD_FAILED, embeddingRebuildError: 'Access denied' }
        )
    })

    it.each(['new-task', 'other-tenant', 'other-org', 'completed'])(
        'does not overwrite %s on late failure',
        async (kind) => {
            const f = fixture()
            if (kind === 'new-task') f.state.rebuildTaskId = 'task-2'
            if (kind === 'other-tenant') f.state.tenantId = 'other'
            if (kind === 'other-org') f.state.organizationId = 'other'
            if (kind === 'completed') f.state.status = KnowledgebaseStatusEnum.READY
            const previous = { ...f.state }
            await f.operations.markEmbeddingRebuildFailed(data, 'late')
            expect(f.state).toEqual(previous)
        }
    )

    it('records enqueue failure after claiming a revision without deleting existing vectors', async () => {
        const f = fixture()
        f.state.status = KnowledgebaseStatusEnum.REBUILD_FAILED
        f.queue.add.mockRejectedValue(new Error('redis unavailable'))
        await expect(f.run(() => f.operations.startEmbeddingRebuild('kb'))).rejects.toThrow('redis unavailable')
        expect(f.state.status).toBe(KnowledgebaseStatusEnum.REBUILD_FAILED)
        expect(f.state.embeddingRebuildError).toBe('redis unavailable')
        expect(f.state.pendingEmbeddingRevision).toBe(3)
        expect(f.state.embeddingCollectionName).toBe('old-vectors')
        expect(f.state.pendingEmbeddingCollectionName).toContain('_r3')
        expect(f.vector.clear).not.toHaveBeenCalled()
    })

    it('recovers an exact terminal job and permits an authorized retry', async () => {
        const f = fixture()
        await f.run(() => f.operations.recoverEmbeddingRebuild('kb'))
        expect(f.state.status).toBe(KnowledgebaseStatusEnum.REBUILD_FAILED)
        await f.run(() => f.operations.startEmbeddingRebuild('kb'))
        expect(f.state.status).toBe(KnowledgebaseStatusEnum.REBUILDING)
        expect(f.queue.add).toHaveBeenCalledWith(
            expect.objectContaining({ pendingEmbeddingRevision: 3 }),
            expect.objectContaining({ jobId: f.state.rebuildTaskId })
        )
    })

    it('does not recover an active job or an unverifiable receipt', async () => {
        const f = fixture()
        f.terminal.getState.mockResolvedValue('active')
        await expect(f.run(() => f.operations.recoverEmbeddingRebuild('kb'))).rejects.toThrow()
        f.queue.getJob.mockResolvedValue(null)
        await expect(f.run(() => f.operations.recoverEmbeddingRebuild('kb'))).rejects.toThrow()
        expect(f.repository.update).not.toHaveBeenCalled()
    })

    it('refreshes identity again before publishing and preserves old vectors on revocation', async () => {
        const f = fixture()
        f.commands.execute.mockRejectedValue(new Error('membership revoked'))
        await expect(f.run(() => f.operations.processEmbeddingRebuildJob(data))).rejects.toThrow('membership revoked')
        expect(f.state.copilotModel.copilotId).toBeNull()
        expect(f.state.embeddingCollectionName).toBe('old-vectors')
    })
})

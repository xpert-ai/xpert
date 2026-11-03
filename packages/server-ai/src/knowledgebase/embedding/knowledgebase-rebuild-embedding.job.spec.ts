import { KnowledgeProcessingReadyService } from '../../knowledge-document/processing-lifecycle.module'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Job } from 'bull'
import { KnowledgebaseRebuildEmbeddingConsumer } from './knowledgebase-rebuild-embedding.job'
import { KnowledgebaseService } from '../management/knowledgebase.service'
import { TKnowledgebaseRebuildEmbeddingJob } from '../shared/types'
import { executionIdentityFixture } from '../../shared/testing/execution-identity.fixture'

jest.mock('../management/knowledgebase.service', () => ({ KnowledgebaseService: class {} }))

describe('KnowledgebaseRebuildEmbeddingConsumer', () => {
    const data: TKnowledgebaseRebuildEmbeddingJob = {
        userId: 'user',
        tenantId: 'tenant',
        organizationId: 'org',
        knowledgebaseId: 'kb',
        rebuildTaskId: 'task',
        pendingEmbeddingRevision: 2
    }
    function fixture() {
        const commands = {
            execute: jest.fn(async () =>
                executionIdentityFixture({
                    userId: data.userId,
                    tenantId: data.tenantId,
                    organizationId: data.organizationId
                })
            )
        }
        const service = {
            processEmbeddingRebuildJob: jest.fn(async () => {
                expect(RequestContext.currentUserId()).toBe('user')
                expect(RequestContext.getOrganizationId()).toBe('org')
                return { id: 'kb' }
            }),
            markEmbeddingRebuildFailed: jest.fn()
        }
        const lifecycle = new KnowledgeProcessingReadyService()
        lifecycle.onApplicationBootstrap()
        const consumer = new KnowledgebaseRebuildEmbeddingConsumer(
            service as unknown as KnowledgebaseService,
            commands as unknown as CommandBus,
            lifecycle
        )
        return { commands, service, run: () => consumer.process({ data } as Job<TKnowledgebaseRebuildEmbeddingJob>) }
    }
    it('executes only after fresh identity restoration', async () => {
        const f = fixture()
        await expect(f.run()).resolves.toEqual({ id: 'kb' })
        expect(f.commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                actor: {
                    kind: 'user',
                    userId: 'user',
                    tenantId: 'tenant',
                    organizationId: 'org'
                }
            })
        )
        expect(f.service.markEmbeddingRebuildFailed).not.toHaveBeenCalled()
    })
    it.each(['identity', 'business'])('records the exact failed task when %s fails', async (phase) => {
        const f = fixture()
        const error = new Error('Access revoked')
        if (phase === 'identity') f.commands.execute.mockRejectedValue(error)
        else f.service.processEmbeddingRebuildJob.mockRejectedValue(error)
        await expect(f.run()).rejects.toBe(error)
        expect(f.service.markEmbeddingRebuildFailed).toHaveBeenCalledWith(data, error.message)
        if (phase === 'identity') expect(f.service.processEmbeddingRebuildJob).not.toHaveBeenCalled()
    })
})

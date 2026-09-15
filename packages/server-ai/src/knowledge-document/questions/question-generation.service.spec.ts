jest.mock('../document.service', () => ({ KnowledgeDocumentService: class {} }))
jest.mock('../../knowledgebase/knowledgebase.service', () => ({ KnowledgebaseService: class {} }))
jest.mock('../../shared/agent/middleware-runtime', () => ({ AgentMiddlewareRuntimeService: class {} }))
import { AiModelTypeEnum, KBDocumentStatusEnum, KnowledgeQuestionGenerationConfig } from '@xpert-ai/contracts'
import { FindOperator, Repository } from 'typeorm'
import { KnowledgeQuestionGenerationService } from './question-generation.service'
import { KnowledgeDocumentChunk } from '../chunk/chunk.entity'
import { KnowledgeDocumentService } from '../document.service'
import { KnowledgebaseService } from '../../knowledgebase/knowledgebase.service'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { questionInputHash } from './question-generation'

function fixture() {
    const config: KnowledgeQuestionGenerationConfig = {
        enabled: true,
        questionCount: 3,
        model: { copilotId: 'd349f858-50c2-4b41-a422-e74e265b4569', model: 'chat', modelType: AiModelTypeEnum.LLM }
    }
    const kb = { id: 'kb', parserConfig: { questionGeneration: config } }
    const document = {
        id: 'doc',
        name: 'Policy',
        type: 'txt',
        tenantId: 'tenant',
        knowledgebaseId: 'kb',
        disabled: false,
        status: KBDocumentStatusEnum.FINISH,
        knowledgebase: kb
    }
    let rows: KnowledgeDocumentChunk[] = [
        Object.assign(new KnowledgeDocumentChunk(), {
            id: 'chunk',
            documentId: 'doc',
            tenantId: 'tenant',
            knowledgebaseId: 'kb',
            version: 1,
            pageContent: 'Apply with an invoice.',
            metadata: { chunkId: 'logical-chunk' }
        })
    ]
    const repository = {
        find: jest.fn(async () => structuredClone(rows)),
        findOneBy: jest.fn(async ({ id }: { id: string }) =>
            structuredClone(rows.find((row) => row.id === id) ?? null)
        ),
        update: jest.fn(
            async (
                where: { id: string; version: number; metadata: FindOperator<string> },
                patch: Partial<KnowledgeDocumentChunk>
            ) => {
                const row = rows.find((row) => row.id === where.id && row.version === where.version)
                if (
                    !row ||
                    (row.metadata.questionGeneration ? JSON.stringify(row.metadata.questionGeneration) : null) !==
                        where.metadata.objectLiteralParameters.questionState
                )
                    return { affected: 0 }
                Object.assign(row, structuredClone(patch))
                return { affected: 1 }
            }
        )
    }
    const store = {
        deleteChunks: jest.fn(async () => undefined),
        addKnowledgeDocument: jest.fn(async () => undefined),
        embeddingModelContextSize: 8192
    }
    const documents = {
        assertDocumentReadAccess: jest.fn(),
        assertDocumentWriteAccess: jest.fn(),
        findOne: jest.fn(async () => structuredClone(document)),
        findOneByOptions: jest.fn(async () => structuredClone(document)),
        getDocumentVectorStore: jest.fn(async () => ({ document, vectorStore: store }))
    }
    const knowledgebases = {
        assertNotRebuilding: jest.fn(),
        findOne: jest.fn(async () => structuredClone(kb)),
        getActiveVectorStore: jest.fn(async () => store)
    }
    const invoke = jest.fn(async () => ({ content: '{"questions":["How to apply?","Which documents are needed?"]}' }))
    const models = {
        createModelClient: jest.fn(async (_model?: KnowledgeQuestionGenerationConfig['model']) => ({ invoke }))
    }
    const service = new KnowledgeQuestionGenerationService(
        repository as unknown as Repository<KnowledgeDocumentChunk>,
        documents as unknown as KnowledgeDocumentService,
        knowledgebases as unknown as KnowledgebaseService,
        models as unknown as AgentMiddlewareRuntimeService
    )
    return {
        service,
        config,
        store,
        invoke,
        documents,
        repository,
        models,
        document,
        rows,
        removeSource: () => {
            rows = []
        }
    }
}

describe('KnowledgeQuestionGenerationService', () => {
    it('records an intentional no-content result without indexing or automatically calling the model again', async () => {
        const f = fixture()
        f.invoke.mockResolvedValue({ content: '{"questions":[]}' })
        await f.service.process('doc')
        expect(f.rows[0].metadata.questionGeneration).toMatchObject({
            status: 'ready',
            emptyReason: 'insufficient_content',
            questions: [],
            vectorIds: []
        })
        expect(f.store.addKnowledgeDocument).not.toHaveBeenCalled()
        await f.service.process('doc')
        expect(f.invoke).toHaveBeenCalledTimes(1)
    })
    it('uses only searchable fields as the source of generated questions', async () => {
        const f = fixture()
        f.document.type = 'csv'
        f.rows[0].pageContent = JSON.stringify({ policy: 'Apply with an invoice.', internalNote: 'Private forecast' })
        f.rows[0].metadata.searchContent = JSON.stringify({ policy: 'Apply with an invoice.' })
        await f.service.process('doc')
        expect(f.invoke).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ content: expect.stringContaining('Apply with an invoice.') })
            ]),
            expect.any(Object)
        )
        expect(JSON.stringify(f.invoke.mock.calls)).not.toContain('Private forecast')
        expect(f.rows[0].metadata.questionGeneration?.status).toBe('ready')
    })

    it('keeps batch config immutable when the model runtime normalizes its options', async () => {
        const f = fixture()
        const savedConfig = structuredClone(f.config)
        for (const id of ['second', 'third']) {
            f.rows.push(
                Object.assign(new KnowledgeDocumentChunk(), {
                    ...f.rows[0],
                    id,
                    metadata: { chunkId: id }
                })
            )
        }
        f.models.createModelClient.mockImplementation(async (model) => {
            model.options = { ...model.options, context_size: 32000 }
            return { invoke: f.invoke }
        })

        await f.service.process('doc')

        expect(f.invoke).toHaveBeenCalledTimes(3)
        expect(f.rows.map((chunk) => chunk.metadata.questionGeneration?.status)).toEqual(['ready', 'ready', 'ready'])
        expect(f.config).toEqual(savedConfig)
        await f.service.process('doc')
        expect(f.invoke).toHaveBeenCalledTimes(3)
    })

    it('publishes extra vectors mapped to the source and skips repeated publication', async () => {
        const f = fixture()
        await f.service.process('doc')
        expect(f.rows[0].metadata.questionGeneration?.status).toBe('ready')
        expect(f.rows[0].metadata.questionGeneration?.questions).toHaveLength(2)
        expect(f.store.addKnowledgeDocument).toHaveBeenCalledWith(
            f.document,
            expect.arrayContaining([
                expect.objectContaining({
                    pageContent: 'Apply with an invoice.',
                    metadata: expect.objectContaining({ chunkId: 'logical-chunk', searchContent: 'How to apply?' })
                })
            ]),
            expect.objectContaining({ ids: expect.any(Array) })
        )
        await f.service.process('doc')
        expect(f.invoke).toHaveBeenCalledTimes(1)
    })

    it.each([1, 2] as const)('reuses paid questions from prompt version %s on an indexing retry', async (version) => {
        const f = fixture()
        f.store.addKnowledgeDocument.mockRejectedValueOnce(new Error('embedding unavailable'))
        await f.service.process('doc')
        expect(f.rows[0].metadata.questionGeneration?.status).toBe('failed')
        f.rows[0].metadata.questionGeneration.inputHash = questionInputHash(f.rows[0], '', f.config, version)
        await f.service.process('doc')
        expect(f.rows[0].metadata.questionGeneration?.status).toBe('failed')
        await f.service.process('doc', 'chunk', true)
        expect(f.rows[0].metadata.questionGeneration?.status).toBe('ready')
        expect(f.invoke).toHaveBeenCalledTimes(1)
    })

    it('records model failure without failing the source document or silently retrying charges', async () => {
        const f = fixture()
        f.invoke.mockRejectedValueOnce(new Error('provider failed'))
        await f.service.process('doc')
        await f.service.process('doc')
        expect(f.rows[0].metadata.questionGeneration?.status).toBe('failed')
        expect(f.document.status).toBe(KBDocumentStatusEnum.FINISH)
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.store.addKnowledgeDocument).not.toHaveBeenCalled()
    })

    it('does not publish a model response after the source changes', async () => {
        const f = fixture()
        f.invoke.mockImplementationOnce(async () => {
            f.rows[0].pageContent = 'New policy.'
            f.rows[0].version++
            return { content: '{"questions":["How to apply?"]}' }
        })
        await f.service.process('doc')
        expect(f.store.addKnowledgeDocument).not.toHaveBeenCalled()
    })

    it('cleans up a late vector write after deletion', async () => {
        const f = fixture()
        f.store.addKnowledgeDocument.mockImplementationOnce(async () => f.removeSource())
        await f.service.process('doc')
        expect(f.store.deleteChunks).toHaveBeenLastCalledWith(expect.arrayContaining([expect.any(String)]))
    })

    it('generates for child chunks only, providing their parent as context', async () => {
        const f = fixture()
        f.rows.unshift(
            Object.assign(new KnowledgeDocumentChunk(), {
                id: 'parent',
                version: 1,
                documentId: 'doc',
                tenantId: 'tenant',
                pageContent: 'Travel policy',
                metadata: { chunkId: 'logical-parent', type: 'parent' }
            })
        )
        f.rows[1].metadata.parentId = 'logical-parent'
        await f.service.process('doc')
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.invoke).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('Travel policy') })]),
            expect.any(Object)
        )
        expect(f.rows[0].metadata.questionGeneration).toBeUndefined()
    })

    it('clears question vectors on opt-out and does not invoke a model', async () => {
        const f = fixture()
        await f.service.process('doc')
        f.config.enabled = false
        await f.service.process('doc')
        expect(f.rows[0].metadata.questionGeneration).toBeUndefined()
        expect(f.invoke).toHaveBeenCalledTimes(1)
    })

    it('stops making model calls when the document is disabled during the batch', async () => {
        const f = fixture()
        f.rows.push(
            Object.assign(new KnowledgeDocumentChunk(), { ...f.rows[0], id: 'second', metadata: { chunkId: 'second' } })
        )
        f.invoke.mockImplementationOnce(async () => {
            f.document.disabled = true
            return { content: '{"questions":["How to apply?"]}' }
        })
        await f.service.process('doc')
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.store.addKnowledgeDocument).not.toHaveBeenCalled()
    })

    it('fences duplicate jobs without invalidating the source edit version', async () => {
        const f = fixture()
        await Promise.all([f.service.process('doc'), f.service.process('doc')])
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.rows[0].version).toBe(1)
        expect(f.rows[0].metadata.questionGeneration.status).toBe('ready')
    })

    it('deletes only the selected question and does not restore it on an unchanged publication', async () => {
        const f = fixture()
        await f.service.process('doc')
        const removed = f.rows[0].metadata.questionGeneration.questions[0]
        const state = await f.service.remove('doc', 'chunk', removed.id)
        expect(state.questions).toHaveLength(1)
        expect(f.store.deleteChunks).toHaveBeenLastCalledWith(removed.vectorIds)
        await f.service.process('doc')
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.rows[0].metadata.questionGeneration.questions).toHaveLength(1)
    })

    it('never deletes a replacement question when a stale page sends an old question id', async () => {
        const f = fixture()
        await f.service.process('doc')
        const oldId = f.rows[0].metadata.questionGeneration.questions[0].id
        await f.service.process('doc', 'chunk', true)
        const current = f.rows[0].metadata.questionGeneration.questions
        expect(current[0].id).not.toBe(oldId)
        await f.service.remove('doc', 'chunk', oldId)
        expect(f.rows[0].metadata.questionGeneration.questions).toEqual(current)
    })

    it('retains failed deletion receipts and cleans them on an idempotent retry', async () => {
        const f = fixture()
        await f.service.process('doc')
        const removed = f.rows[0].metadata.questionGeneration.questions[0]
        f.store.deleteChunks.mockRejectedValueOnce(new Error('vector backend unavailable'))
        await expect(f.service.remove('doc', 'chunk', removed.id)).rejects.toThrow('vector backend unavailable')
        expect(f.rows[0].metadata.questionGeneration.questions.some((question) => question.id === removed.id)).toBe(
            false
        )
        expect(f.rows[0].metadata.questionGeneration.vectorIds).toEqual(expect.arrayContaining(removed.vectorIds))
        await f.service.remove('doc', 'chunk', removed.id)
        expect(f.rows[0].metadata.questionGeneration.vectorIds).not.toEqual(expect.arrayContaining(removed.vectorIds))
    })

    it('generates a new revision when the source changes and removes the old vectors', async () => {
        const f = fixture()
        await f.service.process('doc')
        const old = f.rows[0].metadata.questionGeneration
        f.rows[0].pageContent = 'Use the new travel portal.'
        f.rows[0].version++
        await f.service.process('doc')
        expect(f.invoke).toHaveBeenCalledTimes(2)
        expect(f.store.deleteChunks).toHaveBeenCalledWith(old.vectorIds)
        expect(f.rows[0].metadata.questionGeneration.generationId).not.toBe(old.generationId)
        expect(f.rows[0].metadata.questionGeneration.status).toBe('ready')
    })

    it('rejects unavailable and missing chunks before queueing a paid operation', async () => {
        const f = fixture()
        await expect(f.service.assertCanRegenerate('doc', 'missing')).rejects.toThrow()
        f.config.enabled = false
        await expect(f.service.assertCanRegenerate('doc', 'chunk')).rejects.toThrow()
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('requires source write access before generating', async () => {
        const f = fixture()
        f.documents.assertDocumentWriteAccess.mockRejectedValueOnce(new Error('forbidden'))
        await expect(f.service.process('doc')).rejects.toThrow('forbidden')
        expect(f.models.createModelClient).not.toHaveBeenCalled()
    })
})

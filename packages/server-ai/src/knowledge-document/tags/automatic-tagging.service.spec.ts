import { AiModelTypeEnum, KBDocumentStatusEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { CopilotModelService } from '../../copilot-model/copilot-model.service'
import { KnowledgeTagService, TaggingContext } from '../../knowledgebase/tags/knowledge-tag.service'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { KnowledgeDocumentChunk } from '../chunk/chunk.entity'
import { KnowledgeAutomaticTaggingService } from './automatic-tagging.service'

describe('KnowledgeAutomaticTaggingService', () => {
    const general = { modelType: AiModelTypeEnum.LLM, model: 'general', copilotId: 'provider' }
    const context = (): TaggingContext =>
        ({
            knowledgebase: {
                id: 'kb',
                type: KnowledgebaseTypeEnum.Standard,
                automaticTagging: { enabled: true },
                chatModel: general
            },
            document: {
                id: 'doc',
                name: 'guide.pdf',
                tenantId: 'tenant',
                knowledgebaseId: 'kb',
                status: KBDocumentStatusEnum.FINISH,
                publicationEpoch: 1,
                tagRevision: 0
            }
        }) as TaggingContext

    function fixture() {
        const snapshot = context()
        const tags = {
            context: jest.fn().mockResolvedValue(snapshot),
            existing: jest.fn().mockResolvedValue([]),
            candidates: jest.fn().mockResolvedValue([{ id: 'tag-uuid', name: 'Finance' }]),
            appendAutomatic: jest.fn().mockResolvedValue([])
        }
        const query = {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            clone: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getCount: jest.fn().mockResolvedValue(1),
            select: jest.fn().mockReturnThis(),
            offset: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ pageContent: 'Source text and OCR' })
        }
        const chunks = { createQueryBuilder: jest.fn().mockReturnValue(query) }
        const client = { invoke: jest.fn().mockResolvedValue({ content: '{"tags":[{"number":1,"confidence":0.9}]}' }) }
        const models = { createModelClient: jest.fn().mockResolvedValue(client) }
        const copilotModels = { findOne: jest.fn().mockResolvedValue({ ...general, model: 'referenced' }) }
        const service = new KnowledgeAutomaticTaggingService(
            tags as unknown as KnowledgeTagService,
            chunks as unknown as Repository<KnowledgeDocumentChunk>,
            models as unknown as AgentMiddlewareRuntimeService,
            copilotModels as unknown as CopilotModelService
        )
        return { service, tags, snapshot, models, client, chunks, copilotModels, query }
    }

    it.each(['disabled', 'manual', 'no-candidates', 'no-model', 'processing', 'limit'] as const)(
        'skips %s without an LLM call',
        async (reason) => {
            const f = fixture()
            if (reason === 'disabled') f.snapshot.knowledgebase.automaticTagging.enabled = false
            if (reason === 'manual') f.tags.existing.mockResolvedValue([{ source: 'manual' }])
            if (reason === 'no-candidates') f.tags.candidates.mockResolvedValue([])
            if (reason === 'no-model') f.snapshot.knowledgebase.chatModel = null
            if (reason === 'processing') f.snapshot.document.status = KBDocumentStatusEnum.EMBEDDING
            if (reason === 'limit')
                f.tags.existing.mockResolvedValue(Array.from({ length: 3 }, () => ({ source: 'automatic' })))
            await f.service.process('kb', 'doc')
            expect(f.models.createModelClient).not.toHaveBeenCalled()
            expect(f.tags.appendAutomatic).not.toHaveBeenCalled()
        }
    )

    it('uses the general model, samples current text and maps the validated number on the server', async () => {
        const f = fixture()
        f.snapshot.document.metadata = { summary: 'Existing summary', originalFileName: 'original.pdf' }
        await f.service.process('kb', 'doc')
        expect(f.models.createModelClient).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'general',
                options: expect.objectContaining({ temperature: 0, max_tokens: 1024 })
            }),
            {},
            expect.objectContaining({ tenantId: 'tenant' })
        )
        const prompt = JSON.stringify(f.client.invoke.mock.calls[0][0])
        expect(prompt).not.toContain('tag-uuid')
        expect(prompt).toContain('Existing summary')
        expect(prompt).toContain('original.pdf')
        expect(prompt).toContain('Source text and OCR')
        expect(f.tags.appendAutomatic).toHaveBeenCalledWith(
            f.snapshot,
            expect.any(Array),
            [{ tagId: 'tag-uuid', confidence: 0.9 }],
            expect.any(String)
        )
    })

    it('does not repeat the model call for an already processed input, including empty results', async () => {
        const f = fixture()
        f.client.invoke.mockResolvedValue({ content: '{"tags":[]}' })
        await f.service.process('kb', 'doc')
        f.snapshot.document.autoTaggingInputHash = f.tags.appendAutomatic.mock.calls[0][3]
        await f.service.process('kb', 'doc')
        expect(f.client.invoke).toHaveBeenCalledTimes(1)
        expect(f.tags.appendAutomatic).toHaveBeenCalledTimes(1)
    })

    it('skips unresolved references instead of asking the runtime to choose an unrelated default model', async () => {
        const f = fixture()
        f.snapshot.knowledgebase.automaticTagging.model = { referencedId: 'missing-config' }
        f.copilotModels.findOne.mockResolvedValue({ referencedId: 'another-reference' })
        await f.service.process('kb', 'doc')
        expect(f.models.createModelClient).not.toHaveBeenCalled()
    })

    it('allows mixed labels only with opt-in and resolves dedicated referenced models', async () => {
        const f = fixture()
        f.snapshot.knowledgebase.automaticTagging = {
            enabled: true,
            allowWithManualTags: true,
            model: { referencedId: 'selected-model' }
        }
        f.tags.existing.mockResolvedValue([{ source: 'manual' }])
        await f.service.process('kb', 'doc')
        expect(f.copilotModels.findOne).toHaveBeenCalledWith('selected-model')
        expect(f.models.createModelClient.mock.calls[0][0]).toMatchObject({
            model: 'referenced',
            options: { temperature: 0 }
        })
        expect(f.tags.appendAutomatic).toHaveBeenCalled()
    })

    it.each(['invalid-json', 'model-failure'] as const)(
        'never writes associations or processing status on %s',
        async (reason) => {
            const f = fixture()
            if (reason === 'invalid-json') f.client.invoke.mockResolvedValue({ content: 'not JSON' })
            else f.client.invoke.mockRejectedValue(new Error('provider timeout'))
            await expect(f.service.process('kb', 'doc')).rejects.toThrow()
            expect(f.tags.appendAutomatic).not.toHaveBeenCalled()
            expect(f.snapshot.document.status).toBe(KBDocumentStatusEnum.FINISH)
        }
    )

    it('bounds database sampling to fixed positions even for a very large document', async () => {
        const f = fixture()
        f.query.getCount.mockResolvedValue(100000)
        await f.service.process('kb', 'doc')
        expect(f.query.getRawOne).toHaveBeenCalledTimes(16)
        expect(f.query.offset).toHaveBeenCalledWith(99999)
    })
})

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { AiModelTypeEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { Knowledgebase } from '../../persistence/knowledgebase.entity'
import { ResolveAssistantKnowledgeModelQuery } from '../resolve-assistant-knowledge-model.query'
import { ResolveAssistantKnowledgeModelHandler } from './resolve-assistant-knowledge-model.handler'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'assistant-user' }
const embedding = { copilotId: 'provider', model: 'embedding', modelType: AiModelTypeEnum.TEXT_EMBEDDING }
const rerank = { ...embedding, model: 'rerank', modelType: AiModelTypeEnum.RERANK }

describe('Assistant knowledge model authorization', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
    })
    afterEach(() => jest.restoreAllMocks())

    function fixture(patch: Partial<Knowledgebase> = {}) {
        const library = Object.assign(new Knowledgebase(), {
            id: 'bound-library',
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            type: KnowledgebaseTypeEnum.Standard,
            copilotModel: embedding,
            rerankModel: rerank,
            ...patch
        })
        const find = jest.fn().mockResolvedValue([{ id: library.id }])
        const database = { getRepository: () => ({ find }) } as unknown as DataSource
        const libraries = { findOneForSearch: jest.fn().mockResolvedValue(library) }
        const handler = new ResolveAssistantKnowledgeModelHandler(database, libraries)
        return {
            find,
            libraries,
            run: (model = embedding, scope = actor) =>
                handler.execute(new ResolveAssistantKnowledgeModelQuery(scope, 'assistant', model))
        }
    }

    it.each([KnowledgebaseTypeEnum.Standard, KnowledgebaseTypeEnum.FAQ])(
        'permits current embedding and rerank dependencies of an accessible %s library',
        async (type) => {
            const f = fixture({ type })
            await expect(f.run()).resolves.toBe(true)
            await expect(f.run(rerank)).resolves.toBe(true)
            expect(f.libraries.findOneForSearch).toHaveBeenCalledWith(
                'bound-library',
                { relations: ['copilotModel', 'rerankModel'] },
                { xpertId: 'assistant' }
            )
        }
    )

    it.each(['tenantId', 'organizationId', 'userId'] as const)('rejects a mismatched %s context', async (field) => {
        const f = fixture()
        await expect(f.run(embedding, { ...actor, [field]: 'other' })).resolves.toBe(false)
        expect(f.find).not.toHaveBeenCalled()
    })

    it('rejects an unbound library without reading its model configuration', async () => {
        const f = fixture()
        f.find.mockResolvedValue([])
        await expect(f.run()).resolves.toBe(false)
        expect(f.libraries.findOneForSearch).not.toHaveBeenCalled()
    })

    it.each([new ForbiddenException(), new NotFoundException()])(
        'rechecks revoked or deleted libraries',
        async (error) => {
            const f = fixture()
            await expect(f.run()).resolves.toBe(true)
            f.libraries.findOneForSearch.mockRejectedValue(error)
            await expect(f.run()).resolves.toBe(false)
        }
    )

    it('does not let an inaccessible unrelated binding block a permitted dependency', async () => {
        const f = fixture()
        f.find.mockResolvedValue([{ id: 'revoked' }, { id: 'bound-library' }])
        f.libraries.findOneForSearch.mockRejectedValueOnce(new ForbiddenException())
        await expect(f.run()).resolves.toBe(true)
    })

    it('propagates infrastructure failures instead of reporting a permission denial', async () => {
        const f = fixture()
        f.libraries.findOneForSearch.mockRejectedValue(new Error('database unavailable'))
        await expect(f.run()).rejects.toThrow('database unavailable')
    })

    it.each([
        { tenantId: 'other' },
        { organizationId: 'other' },
        { type: KnowledgebaseTypeEnum.External },
        { copilotModel: null, pendingCopilotModel: embedding },
        { copilotModel: { ...embedding, copilotId: 'other' } },
        { copilotModel: { ...embedding, model: 'other' } },
        { copilotModel: { ...embedding, modelType: AiModelTypeEnum.LLM } }
    ])('does not grant access through an ineligible model or scope: %p', async (patch) => {
        await expect(fixture(patch).run()).resolves.toBe(false)
    })

    it('does not grant ingestion, Wiki, or arbitrary chat models from a library', async () => {
        const chat = { ...embedding, modelType: AiModelTypeEnum.LLM }
        const f = fixture({ chatModel: chat, wikiModel: chat, visionModel: chat })
        await expect(f.run(chat)).resolves.toBe(false)
        expect(f.find).not.toHaveBeenCalled()
    })
})

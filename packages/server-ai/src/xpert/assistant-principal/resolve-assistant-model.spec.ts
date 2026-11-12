import { ForbiddenException, NotFoundException } from '@nestjs/common'
import {
    AiModelTypeEnum,
    IWFNClassifier,
    KnowledgebaseTypeEnum,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { Xpert } from '../xpert.entity'
import { ResolveAssistantModelCommand, ResolveAssistantModelHandler } from './resolve-assistant-model.command'
import { KnowledgebaseGetOneQuery } from '../../knowledgebase/queries/get-one.query'
import { Knowledgebase } from '../../knowledgebase/persistence/knowledgebase.entity'

const queries = () => ({ execute: jest.fn() })

it('restricts organization model credentials to the live executor Assistant published configuration', async () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'assistant-user' }
    const model = { copilotId: 'provider', model: 'published-model', modelType: AiModelTypeEnum.LLM }
    const access = { isPrincipal: jest.fn().mockResolvedValue(true), find: jest.fn().mockResolvedValue({}) }
    const database = {
        getRepository: () => ({ findOne: async () => ({ active: true, publishAt: new Date(), copilotModel: model }) })
    } as unknown as DataSource
    const queryBus = queries()
    const handler = new ResolveAssistantModelHandler(access, database, queryBus)
    await expect(handler.execute(new ResolveAssistantModelCommand(actor, 'assistant', model))).resolves.toBe(true)
    expect(queryBus.execute).not.toHaveBeenCalled()
    await expect(
        handler.execute(new ResolveAssistantModelCommand(actor, 'assistant', { ...model, model: 'unrelated-model' }))
    ).rejects.toThrow()
    access.find.mockResolvedValueOnce(null)
    await expect(handler.execute(new ResolveAssistantModelCommand(actor, 'other-assistant', model))).rejects.toThrow()
    access.isPrincipal.mockResolvedValueOnce(false)
    await expect(
        handler.execute(new ResolveAssistantModelCommand({ ...actor, userId: 'human' }, 'assistant', model))
    ).resolves.toBe(false)
})

describe('published workflow and fallback model bindings', () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'assistant-user' }
    const primary = { copilotId: 'provider', model: 'primary', modelType: AiModelTypeEnum.LLM }
    const additional = { ...primary, model: 'additional' }

    function classifierNode(): TXpertTeamNode<'workflow'> {
        const entity: IWFNClassifier = {
            id: 'classifier',
            key: 'classifier',
            type: WorkflowNodeTypeEnum.CLASSIFIER,
            copilotModel: additional,
            inputVariables: ['input'],
            classes: [{ description: 'question' }]
        }
        return { key: 'classifier', type: 'workflow', position: { x: 0, y: 0 }, entity }
    }

    function fixture(config: Partial<Xpert>) {
        const assistant: Partial<Xpert> = { active: true, publishAt: new Date(), copilotModel: primary, ...config }
        const database = {
            getRepository: () => ({ findOne: jest.fn(async () => assistant) })
        } as unknown as DataSource
        const handler = new ResolveAssistantModelHandler(
            {
                isPrincipal: jest.fn().mockResolvedValue(true),
                find: jest.fn().mockResolvedValue({})
            },
            database,
            queries()
        )
        return (model = additional) => handler.execute(new ResolveAssistantModelCommand(actor, 'assistant', model))
    }

    it('permits the classifier model from the published graph', async () => {
        const execute = fixture({ graph: { nodes: [classifierNode()], connections: [] } })
        await expect(execute()).resolves.toBe(true)
    })

    it.each(['primary', 'sub-agent'])('permits an enabled %s Agent fallback', async (location) => {
        const agent = {
            key: location,
            copilotModel: primary,
            options: { fallback: { enabled: true, copilotModel: additional } }
        }
        const execute = fixture(location === 'primary' ? { agent } : { agents: [agent] })
        await expect(execute()).resolves.toBe(true)
    })

    it('preserves the team model used by classifiers when the primary Agent has an override', async () => {
        const execute = fixture({ copilotModel: additional, agent: { key: 'primary', copilotModel: primary } })
        await expect(execute()).resolves.toBe(true)
    })

    it('rejects a disabled fallback', async () => {
        const execute = fixture({
            agent: {
                key: 'primary',
                options: { fallback: { enabled: false, copilotModel: additional } }
            }
        })
        await expect(execute()).rejects.toThrow()
    })

    it('rejects a model that exists only in an unpublished draft', async () => {
        const execute = fixture({ draft: { team: {}, nodes: [classifierNode()], connections: [] } })
        await expect(execute()).rejects.toThrow()
    })

    it('keeps the provider and model type bound to the published classifier', async () => {
        const execute = fixture({ graph: { nodes: [classifierNode()], connections: [] } })
        await expect(execute({ ...additional, copilotId: 'another-provider' })).rejects.toThrow()
        await expect(execute({ ...additional, modelType: AiModelTypeEnum.TEXT_EMBEDDING })).rejects.toThrow()
    })

    it('does not infer a model binding from an unrelated workflow node', async () => {
        const node = classifierNode()
        const execute = fixture({
            graph: {
                nodes: [{ ...node, entity: { ...node.entity, type: WorkflowNodeTypeEnum.CODE } }],
                connections: []
            }
        })
        await expect(execute()).rejects.toThrow()
    })
})

describe('published knowledge retrieval model bindings', () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'assistant-user' }
    const embedding = { copilotId: 'provider', model: 'embedding', modelType: AiModelTypeEnum.TEXT_EMBEDDING }
    const rerank = { ...embedding, model: 'rerank', modelType: AiModelTypeEnum.RERANK }

    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
    })
    afterEach(() => jest.restoreAllMocks())

    function fixture(patch: Partial<Knowledgebase> = {}, assistantPatch: Partial<Xpert> = {}) {
        const library = Object.assign(new Knowledgebase(), {
            id: 'bound-library',
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            type: KnowledgebaseTypeEnum.Standard,
            copilotModel: embedding,
            rerankModel: rerank,
            ...patch
        })
        const assistant = Object.assign(new Xpert(), {
            ...actor,
            id: 'assistant',
            active: true,
            publishAt: new Date(),
            knowledgebases: [library],
            ...assistantPatch
        })
        const findOne = jest.fn().mockResolvedValue(assistant)
        const database = { getRepository: () => ({ findOne }) } as unknown as DataSource
        const queryBus = { execute: jest.fn().mockResolvedValue(library) }
        const handler = new ResolveAssistantModelHandler(
            { isPrincipal: jest.fn().mockResolvedValue(true), find: jest.fn().mockResolvedValue({}) },
            database,
            queryBus
        )
        return {
            assistant,
            queryBus,
            run: (model = embedding, scope = actor) =>
                handler.execute(new ResolveAssistantModelCommand(scope, 'assistant', model))
        }
    }

    it.each([KnowledgebaseTypeEnum.Standard, KnowledgebaseTypeEnum.FAQ])(
        'permits current embedding and rerank dependencies through the existing %s retrieval query',
        async (type) => {
            const f = fixture({ type })
            await expect(f.run()).resolves.toBe(true)
            await expect(f.run(rerank)).resolves.toBe(true)
            expect(f.queryBus.execute).toHaveBeenCalledWith(
                new KnowledgebaseGetOneQuery({
                    id: 'bound-library',
                    purpose: 'retrieval',
                    options: { relations: ['copilotModel', 'rerankModel'] }
                })
            )
        }
    )

    it.each(['tenantId', 'organizationId', 'userId'] as const)('rejects a mismatched %s context', async (field) => {
        const f = fixture()
        await expect(f.run(embedding, { ...actor, [field]: 'other' })).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.queryBus.execute).not.toHaveBeenCalled()
    })

    it('rejects unbound and draft-only libraries without reading model configuration', async () => {
        const f = fixture(
            {},
            {
                knowledgebases: [],
                draft: {
                    team: {},
                    nodes: [
                        {
                            type: 'knowledge',
                            key: 'bound-library',
                            position: { x: 0, y: 0 },
                            entity: { id: 'bound-library', name: 'Draft library', type: KnowledgebaseTypeEnum.Standard }
                        }
                    ],
                    connections: [{ key: 'draft-binding', type: 'knowledge', from: 'agent', to: 'bound-library' }]
                }
            }
        )
        await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.queryBus.execute).not.toHaveBeenCalled()
    })

    it.each([{ active: false }, { publishAt: null }])('rejects an ineligible Assistant: %p', async (patch) => {
        const f = fixture({}, patch)
        await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.queryBus.execute).not.toHaveBeenCalled()
    })

    it.each([new ForbiddenException(), new NotFoundException()])(
        'rechecks revoked or deleted libraries',
        async (error) => {
            const f = fixture()
            await expect(f.run()).resolves.toBe(true)
            f.queryBus.execute.mockRejectedValue(error)
            await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException)
        }
    )

    it('does not let an inaccessible unrelated binding block a permitted dependency', async () => {
        const f = fixture()
        f.assistant.knowledgebases.unshift(
            Object.assign(new Knowledgebase(), {
                id: 'revoked',
                tenantId: actor.tenantId,
                organizationId: actor.organizationId
            })
        )
        f.queryBus.execute.mockRejectedValueOnce(new ForbiddenException())
        await expect(f.run()).resolves.toBe(true)
    })

    it('propagates infrastructure failures instead of reporting a permission denial', async () => {
        const f = fixture()
        f.queryBus.execute.mockRejectedValue(new Error('database unavailable'))
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
    ])('rejects an ineligible model or scope: %p', async (patch) => {
        await expect(fixture(patch).run()).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rechecks the scope and current model returned by the retrieval query', async () => {
        const f = fixture()
        f.queryBus.execute.mockResolvedValueOnce(Object.assign(new Knowledgebase(), { tenantId: 'other' }))
        await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException)
        f.queryBus.execute.mockResolvedValueOnce(
            Object.assign(new Knowledgebase(), {
                tenantId: actor.tenantId,
                organizationId: actor.organizationId,
                copilotModel: null
            })
        )
        await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('does not grant ingestion, Wiki, or arbitrary chat models from a library', async () => {
        const chat = { ...embedding, modelType: AiModelTypeEnum.LLM }
        const f = fixture({ chatModel: chat, wikiModel: chat, visionModel: chat })
        await expect(f.run(chat)).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.queryBus.execute).not.toHaveBeenCalled()
    })
})

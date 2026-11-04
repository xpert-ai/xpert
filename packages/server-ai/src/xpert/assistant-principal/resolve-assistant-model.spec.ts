import { AiModelTypeEnum, IWFNClassifier, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { Xpert } from '../xpert.entity'
import { ResolveAssistantModelCommand, ResolveAssistantModelHandler } from './resolve-assistant-model.command'

it('restricts organization model credentials to the live executor Assistant published configuration', async () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'assistant-user' }
    const model = { copilotId: 'provider', model: 'published-model', modelType: AiModelTypeEnum.LLM }
    const access = { isPrincipal: jest.fn().mockResolvedValue(true), find: jest.fn().mockResolvedValue({}) }
    const database = {
        getRepository: () => ({ findOne: async () => ({ active: true, publishAt: new Date(), copilotModel: model }) })
    } as unknown as DataSource
    const handler = new ResolveAssistantModelHandler(access, database)
    await expect(handler.execute(new ResolveAssistantModelCommand(actor, 'assistant', model))).resolves.toBe(true)
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
            database
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

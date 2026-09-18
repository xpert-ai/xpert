import { AiModelTypeEnum, type IKnowledgebase } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../../../copilot/queries/copilot-model-find.query'
import { EnsureKnowledgebasesCommand } from '../ensure-knowledgebases.command'
import { EnsureKnowledgebasesHandler } from './ensure-knowledgebases.handler'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

const embedding = {
    copilotId: 'workspace-copilot',
    modelType: AiModelTypeEnum.TEXT_EMBEDDING,
    model: 'automotive-embedding',
    options: { dimensions: 1024 }
}
const marker = '[xpert-managed:automotive_knowledge;workspace:workspace-1;key:domain]'

function command(inheritEmbeddingModel = true) {
    return new EnsureKnowledgebasesCommand({
        workspaceId: 'workspace-1',
        namespace: 'automotive_knowledge',
        inheritEmbeddingModel,
        knowledgebases: [
            {
                key: 'domain',
                name: 'Automotive domain knowledge',
                description: 'Automotive motor selection',
                permission: 'organization',
                graphRag: { enabled: true }
            }
        ]
    })
}

function catalog(modelType = AiModelTypeEnum.TEXT_EMBEDDING) {
    return [
        {
            id: 'available-copilot',
            providerWithModels: { models: [{ model: 'provider-embedding', model_type: modelType }] }
        }
    ]
}

describe('EnsureKnowledgebasesHandler', () => {
    let service: {
        getAllByWorkspace: jest.Mock
        create: jest.Mock
        updateKnowledgebase: jest.Mock
    }
    let queryBus: { execute: jest.Mock }
    let handler: EnsureKnowledgebasesHandler

    beforeEach(() => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
        service = {
            getAllByWorkspace: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            create: jest.fn(async (patch: Partial<IKnowledgebase>) => ({ id: 'kb-created', ...patch })),
            updateKnowledgebase: jest.fn(async (id: string, patch: Partial<IKnowledgebase>) => ({ id, ...patch }))
        }
        queryBus = { execute: jest.fn().mockResolvedValue(catalog()) }
        handler = new EnsureKnowledgebasesHandler(service as never, queryBus as never)
    })

    afterEach(() => jest.restoreAllMocks())

    it('initializes an empty workspace from the authorized provider catalog with graph enabled', async () => {
        const result = await handler.execute(command())

        expect(queryBus.execute).toHaveBeenCalledWith(
            new FindCopilotModelsQuery(AiModelTypeEnum.TEXT_EMBEDDING, CopilotModelCatalogMode.Available)
        )
        expect(service.create).toHaveBeenCalledWith(
            expect.objectContaining({
                copilotModel: expect.objectContaining({
                    copilotId: 'available-copilot',
                    model: 'provider-embedding',
                    modelType: AiModelTypeEnum.TEXT_EMBEDDING
                }),
                graphRag: { enabled: true }
            })
        )
        expect(result.knowledgebases[0]).toEqual(
            expect.objectContaining({ operation: 'created', graphRag: { enabled: true } })
        )
    })

    it('prefers the available provider model over an existing workspace knowledgebase model', async () => {
        service.getAllByWorkspace.mockResolvedValue({
            items: [{ workspaceId: 'workspace-1', copilotModel: embedding }]
        })
        await handler.execute(command())
        expect(service.create.mock.calls[0][0].copilotModel).toMatchObject({
            copilotId: 'available-copilot',
            model: 'provider-embedding'
        })
    })

    it('falls back to a same-workspace embedding configuration when the provider catalog is empty', async () => {
        queryBus.execute.mockResolvedValue([])
        service.getAllByWorkspace.mockResolvedValue({
            items: [
                { workspaceId: 'other-workspace', copilotModel: { ...embedding, model: 'shared-model' } },
                { workspaceId: 'workspace-1', copilotModel: { ...embedding, modelType: AiModelTypeEnum.LLM } },
                { workspaceId: 'workspace-1', copilotModel: embedding }
            ]
        })
        await handler.execute(command())
        expect(service.create.mock.calls[0][0].copilotModel).toEqual(embedding)
        expect(service.create.mock.calls[0][0].copilotModel.options).not.toBe(embedding.options)
    })

    it.each([
        ['empty workspace', []],
        ['another workspace', [{ workspaceId: 'other-workspace', copilotModel: embedding }]],
        [
            'non-embedding model',
            [{ workspaceId: 'workspace-1', copilotModel: { ...embedding, modelType: AiModelTypeEnum.LLM } }]
        ],
        [
            'missing model configuration',
            [{ workspaceId: 'workspace-1', copilotModel: { modelType: AiModelTypeEnum.TEXT_EMBEDDING } }]
        ],
        [
            'another managed set',
            [{ workspaceId: 'workspace-1', description: '[xpert-managed:other]', copilotModel: embedding }]
        ]
    ])('fails before any writes when no eligible model exists: %s', async (_name, items) => {
        queryBus.execute.mockResolvedValue([])
        service.getAllByWorkspace.mockResolvedValue({ items })
        await expect(handler.execute(command())).rejects.toThrow(
            'Configure an embedding model and its access permissions'
        )
        expect(service.create).not.toHaveBeenCalled()
        expect(service.updateKnowledgebase).not.toHaveBeenCalled()
    })

    it('ignores non-embedding catalog entries and uses the workspace fallback', async () => {
        queryBus.execute.mockResolvedValue(catalog(AiModelTypeEnum.LLM))
        service.getAllByWorkspace.mockResolvedValue({
            items: [{ workspaceId: 'workspace-1', copilotModel: embedding }]
        })
        await handler.execute(command())
        expect(service.create.mock.calls[0][0].copilotModel).toEqual(embedding)
    })

    it('does not mask catalog authorization or service failures with a workspace fallback', async () => {
        queryBus.execute.mockRejectedValue(new Error('Model catalog unavailable'))
        service.getAllByWorkspace.mockResolvedValue({
            items: [{ workspaceId: 'workspace-1', copilotModel: embedding }]
        })
        await expect(handler.execute(command())).rejects.toThrow('Model catalog unavailable')
        expect(service.create).not.toHaveBeenCalled()
    })

    it('repairs an existing graph switch without changing its model or graph parameters', async () => {
        const existing = {
            id: 'kb-domain',
            workspaceId: 'workspace-1',
            description: marker,
            copilotModelId: 'existing-model',
            copilotModel: embedding,
            graphRag: { enabled: false, neighborHops: 2, entityTopK: 15 }
        }
        service.getAllByWorkspace.mockResolvedValue({ items: [existing] })
        await handler.execute(command())
        await handler.execute(command())
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(service.create).not.toHaveBeenCalled()
        for (const [id, patch] of service.updateKnowledgebase.mock.calls) {
            expect(id).toBe('kb-domain')
            expect(patch).not.toHaveProperty('copilotModel')
            expect(patch.graphRag).toEqual({ enabled: true, neighborHops: 2, entityTopK: 15 })
            expect(patch).not.toHaveProperty('graphStatus')
        }
    })

    it('fills only missing bindings in a partially initialized managed set', async () => {
        service.getAllByWorkspace.mockResolvedValue({
            items: [
                {
                    id: 'kb-domain',
                    workspaceId: 'workspace-1',
                    description: marker,
                    copilotModelId: 'existing-model'
                }
            ]
        })
        const input = command()
        input.input.knowledgebases.push({
            key: 'source',
            name: 'Automotive documents',
            description: 'Source',
            permission: 'private'
        })
        await handler.execute(input)
        expect(service.updateKnowledgebase.mock.calls[0][1]).not.toHaveProperty('copilotModel')
        expect(service.create.mock.calls[0][0].copilotModel.model).toBe('provider-embedding')
        expect(service.create.mock.calls[0][0]).not.toHaveProperty('graphRag')
    })

    it('supports provisioning without embedding auto-selection', async () => {
        await handler.execute(command(false))
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(service.create.mock.calls[0][0]).not.toHaveProperty('copilotModel')
    })

    it('still checks knowledgebase edit permission before reading models or writing data', async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        await expect(handler.execute(command())).rejects.toThrow('Knowledgebase edit permission is required')
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(service.getAllByWorkspace).not.toHaveBeenCalled()
        expect(service.create).not.toHaveBeenCalled()
    })
})

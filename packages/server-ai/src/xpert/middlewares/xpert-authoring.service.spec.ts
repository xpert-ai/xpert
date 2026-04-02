jest.mock('../xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('@metad/server-core', () => ({
    RequestContext: {
        currentUser: jest.fn()
    }
}))

jest.mock('../../knowledgebase/knowledgebase.service', () => ({
    KnowledgebaseService: class KnowledgebaseService {}
}))

jest.mock('../../xpert-agent/xpert-agent.service', () => ({
    XpertAgentService: class XpertAgentService {}
}))

jest.mock('../../xpert-toolset/xpert-toolset.service', () => ({
    XpertToolsetService: class XpertToolsetService {}
}))

import { RequestContext } from '@metad/server-core'
import { AiModelTypeEnum, WorkflowNodeTypeEnum } from '@metad/contracts'
import { FindCopilotModelsQuery } from '../../copilot/queries'
import { XpertExportCommand, XpertImportCommand } from '../commands'
import { ListWorkspaceSkillsQuery } from '../../xpert-agent/queries/list-workspace-skills.query'
import { XpertAuthoringService } from './xpert-authoring.service'

describe('XpertAuthoringService', () => {
    const buildPersistedXpert = (overrides: Record<string, any> = {}) => ({
        id: 'xpert-1',
        name: 'Support Expert',
        title: 'Support Expert',
        slug: 'support-expert',
        type: 'agent',
        workspaceId: 'workspace-1',
        graph: {
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_full',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_full',
                        name: 'Support Expert',
                        title: 'Support Expert',
                        prompt: 'Help users'
                    }
                }
            ],
            connections: []
        },
        agent: {
            id: 'agent-1',
            key: 'Agent_full',
            name: 'Support Expert',
            title: 'Support Expert',
            prompt: 'Help users'
        },
        ...overrides
    })

    const createService = (
        overrides: {
            xpertService?: Record<string, any>
            commandBus?: Record<string, any>
            queryBus?: Record<string, any>
            xpertAgentService?: Record<string, any>
            xpertToolsetService?: Record<string, any>
            knowledgebaseService?: Record<string, any>
        } = {}
    ) => {
        const persistedXpert = buildPersistedXpert()
        const xpertService = {
            create: jest.fn().mockResolvedValue({ id: persistedXpert.id }),
            validateName: jest.fn().mockResolvedValue(true),
            validate: jest.fn().mockResolvedValue([]),
            saveDraft: jest.fn().mockImplementation(async (_id, draft) => draft),
            repository: {
                findOne: jest.fn().mockResolvedValue(persistedXpert)
            },
            ...overrides.xpertService
        }
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof XpertExportCommand) {
                    return Promise.resolve({
                        team: {
                            id: persistedXpert.id,
                            name: persistedXpert.name,
                            title: persistedXpert.title,
                            agent: {
                                key: persistedXpert.agent.key
                            }
                        },
                        nodes: persistedXpert.graph.nodes,
                        connections: persistedXpert.graph.connections
                    })
                }

                return Promise.resolve(persistedXpert)
            }),
            ...overrides.commandBus
        }
        const queryBus = {
            execute: jest.fn().mockResolvedValue([]),
            ...overrides.queryBus
        }
        const xpertAgentService = {
            getMiddlewareStrategies: jest.fn().mockReturnValue([]),
            ...overrides.xpertAgentService
        }
        const xpertToolsetService = {
            getAllByWorkspace: jest.fn().mockResolvedValue({ items: [] }),
            afterLoad: jest.fn().mockImplementation(async (items) => items),
            ...overrides.xpertToolsetService
        }
        const knowledgebaseService = {
            getAllByWorkspace: jest.fn().mockResolvedValue({ items: [] }),
            ...overrides.knowledgebaseService
        }

        return {
            xpertService,
            commandBus,
            queryBus,
            xpertAgentService,
            xpertToolsetService,
            knowledgebaseService,
            service: new XpertAuthoringService(
                xpertService as any,
                commandBus as any,
                queryBus as any,
                xpertAgentService as any,
                xpertToolsetService as any,
                knowledgebaseService as any
            )
        }
    }

    beforeEach(() => {
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue({ id: 'user-1' })
    })

    it('reloads the persisted xpert before building the workspace draft and returns yaml', async () => {
        const createdXpert = {
            id: 'xpert-1',
            name: 'Support Expert',
            title: 'Support Expert',
            workspaceId: null
        }
        const persistedXpert = buildPersistedXpert()
        const { service, xpertService } = createService({
            xpertService: {
                create: jest.fn().mockResolvedValue(createdXpert),
                repository: {
                    findOne: jest.fn().mockResolvedValue(persistedXpert)
                }
            }
        })

        const result = await service.newXpertFromContext(
            {
                workspaceId: 'assistant-workspace',
                env: {
                    workspaceId: 'workspace-1',
                    region: 'cn'
                }
            },
            {
                userIntent: 'Create a support expert'
            }
        )

        expect(xpertService.repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'xpert-1' }
            })
        )
        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'xpert-1',
            expect.objectContaining({
                team: expect.objectContaining({
                    agent: expect.objectContaining({
                        key: 'Agent_full'
                    }),
                    workspaceId: 'workspace-1'
                }),
                nodes: [
                    expect.objectContaining({
                        key: 'Agent_full'
                    })
                ]
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'newXpert',
                dslYaml: expect.stringContaining('Support Expert'),
                updatedDraftFragment: expect.objectContaining({
                    team: expect.objectContaining({
                        id: 'xpert-1',
                        workspaceId: 'workspace-1'
                    })
                })
            })
        )
    })

    it('uses context.env.workspaceId when creating a new draft', async () => {
        const { service, xpertService } = createService()

        await service.newXpertFromContext(
            {
                workspaceId: 'assistant-workspace',
                env: {
                    workspaceId: 'workspace-from-env',
                    region: 'cn'
                }
            },
            {
                userIntent: 'Create a support expert'
            }
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: 'workspace-from-env'
            })
        )
    })

    it('rejects workspace draft creation when workspaceId is missing from both env and top-level context', async () => {
        const { service, xpertService } = createService()

        const result = await service.newXpertFromContext(
            {},
            {
                userIntent: 'Create a support expert'
            }
        )

        expect(result).toEqual(
            expect.objectContaining({
                status: 'rejected',
                toolName: 'newXpert',
                summary: 'Missing workspaceId for workspace creation.'
            })
        )
        expect(xpertService.create).not.toHaveBeenCalled()
    })

    it('falls back to top-level workspaceId when env.workspaceId is absent', async () => {
        const { service, xpertService } = createService()

        await service.newXpertFromContext(
            {
                workspaceId: 'workspace-top-level'
            },
            {
                userIntent: 'Create a support expert'
            }
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: 'workspace-top-level'
            })
        )
    })

    it('returns the current xpert as yaml dsl', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-1',
                name: 'Support Expert',
                agent: {
                    key: 'Agent_full'
                }
            },
            nodes: [],
            connections: []
        }
        const { service, commandBus } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-1',
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.getCurrentXpertFromContext({
            targetXpertId: 'xpert-1'
        })

        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(XpertExportCommand))
        expect(result).toEqual(
            expect.objectContaining({
                xpertId: 'xpert-1',
                dslYaml: expect.stringContaining('Support Expert'),
                committedDraftHash: (service as any).calculateDraftHash(currentDraft)
            })
        )
    })

    it('returns a rejected current xpert result when targetXpertId is missing', async () => {
        const { service } = createService()

        const result = await service.getCurrentXpertFromContext({})

        expect(result).toEqual({
            xpertId: null,
            dslYaml: null,
            summary: 'Missing xpertId for current Xpert DSL export.'
        })
    })

    it('returns available agent middlewares as a compact catalog', async () => {
        const { service, xpertAgentService } = createService({
            xpertAgentService: {
                getMiddlewareStrategies: jest.fn().mockReturnValue([
                    {
                        meta: {
                            name: 'XpertAuthoringMiddleware',
                            label: {
                                en_US: 'Xpert Authoring Middleware'
                            },
                            description: {
                                en_US: 'Provides authoring tools.'
                            },
                            icon: {
                                type: 'svg',
                                value: '<svg />'
                            },
                            configSchema: {
                                type: 'object',
                                properties: {}
                            }
                        }
                    }
                ])
            }
        })

        const result = await service.getAvailableAgentMiddlewaresFromContext({
            env: {
                workspaceId: 'workspace-1'
            }
        })

        expect(xpertAgentService.getMiddlewareStrategies).toHaveBeenCalled()
        expect(result).toEqual({
            status: 'available',
            summary: 'Found 1 agent middlewares available to the assistant.',
            total: 1,
            workspaceId: 'workspace-1',
            items: [
                expect.objectContaining({
                    name: 'XpertAuthoringMiddleware'
                })
            ]
        })
    })

    it('rejects toolset catalog lookup when workspaceId is missing', async () => {
        const { service, xpertToolsetService } = createService()

        const result = await service.getAvailableToolsetsFromContext({})

        expect(result).toEqual({
            status: 'rejected',
            summary: 'Missing workspaceId in request context.',
            total: 0,
            workspaceId: null,
            items: []
        })
        expect(xpertToolsetService.getAllByWorkspace).not.toHaveBeenCalled()
    })

    it('returns toolsets as a compact workspace catalog', async () => {
        const { service, xpertToolsetService } = createService({
            xpertToolsetService: {
                getAllByWorkspace: jest.fn().mockResolvedValue({
                    items: [
                        {
                            id: 'toolset-1',
                            name: 'Support Tools',
                            category: 'builtin',
                            type: 'search',
                            description: 'Search tools',
                            avatar: { type: 'icon', value: 'wrench' },
                            tags: [{ name: 'search' }, { name: 'support' }]
                        }
                    ]
                }),
                afterLoad: jest.fn().mockImplementation(async (items) => items)
            }
        })

        const result = await service.getAvailableToolsetsFromContext({
            env: {
                workspaceId: 'workspace-1'
            }
        })

        expect(xpertToolsetService.getAllByWorkspace).toHaveBeenCalledWith(
            'workspace-1',
            {},
            false,
            expect.objectContaining({ id: 'user-1' })
        )
        expect(xpertToolsetService.afterLoad).toHaveBeenCalled()
        expect(result).toEqual({
            status: 'available',
            summary: "Found 1 toolsets available in workspace 'workspace-1'.",
            total: 1,
            workspaceId: 'workspace-1',
            items: [
                {
                    id: 'toolset-1',
                    name: 'Support Tools',
                    category: 'builtin',
                    type: 'search',
                    description: 'Search tools',
                    tags: ['search', 'support'],
                    avatar: { type: 'icon', value: 'wrench' }
                }
            ]
        })
    })

    it('returns knowledgebases as a compact workspace catalog', async () => {
        const { service, knowledgebaseService } = createService({
            knowledgebaseService: {
                getAllByWorkspace: jest.fn().mockResolvedValue({
                    items: [
                        {
                            id: 'kb-1',
                            name: 'Support KB',
                            description: 'FAQ and runbooks',
                            status: 'indexed',
                            permission: 'Organization',
                            language: 'English',
                            avatar: { type: 'icon', value: 'book' }
                        }
                    ]
                })
            }
        })

        const result = await service.getAvailableKnowledgebasesFromContext({
            env: {
                workspaceId: 'workspace-1'
            }
        })

        expect(knowledgebaseService.getAllByWorkspace).toHaveBeenCalledWith(
            'workspace-1',
            {},
            false,
            expect.objectContaining({ id: 'user-1' })
        )
        expect(result).toEqual({
            status: 'available',
            summary: "Found 1 knowledgebases available in workspace 'workspace-1'.",
            total: 1,
            workspaceId: 'workspace-1',
            items: [
                {
                    id: 'kb-1',
                    name: 'Support KB',
                    description: 'FAQ and runbooks',
                    status: 'indexed',
                    permission: 'Organization',
                    language: 'English',
                    avatar: { type: 'icon', value: 'book' }
                }
            ]
        })
    })

    it('returns the current placeholder skill catalog as an empty available result', async () => {
        const { service, queryBus } = createService({
            queryBus: {
                execute: jest.fn().mockResolvedValue([])
            }
        })

        const result = await service.getAvailableSkillsFromContext({
            env: {
                workspaceId: 'workspace-1'
            }
        })

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListWorkspaceSkillsQuery))
        expect(result).toEqual({
            status: 'available',
            summary: "No skills are currently available in workspace 'workspace-1'.",
            total: 0,
            workspaceId: 'workspace-1',
            items: []
        })
    })

    it('returns available copilot models for the current xpert provider and marks the active model', async () => {
        const persistedXpert = buildPersistedXpert({
            copilotModel: {
                copilotId: 'copilot-openai',
                model: 'gpt-4o',
                copilot: {
                    modelProvider: {
                        providerName: 'openai'
                    }
                }
            }
        })
        const { service, queryBus } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(persistedXpert)
                }
            },
            queryBus: {
                execute: jest.fn().mockImplementation((query) => {
                    if (query instanceof FindCopilotModelsQuery) {
                        if (query.type !== AiModelTypeEnum.LLM) {
                            return Promise.resolve([])
                        }
                        return Promise.resolve([
                            {
                                id: 'copilot-openai',
                                modelProvider: {
                                    providerName: 'openai'
                                },
                                providerWithModels: {
                                    provider: 'openai',
                                    models: [
                                        {
                                            model: 'gpt-4o',
                                            label: {
                                                en_US: 'GPT-4o'
                                            }
                                        },
                                        {
                                            model: 'gpt-4.1',
                                            label: {
                                                en_US: 'GPT-4.1'
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                id: 'copilot-anthropic',
                                modelProvider: {
                                    providerName: 'anthropic'
                                },
                                providerWithModels: {
                                    provider: 'anthropic',
                                    models: [
                                        {
                                            model: 'claude-sonnet-4'
                                        }
                                    ]
                                }
                            }
                        ])
                    }

                    return Promise.resolve([])
                })
            }
        })

        const result = await service.getAvailableCopilotModelsFromContext({
            targetXpertId: 'xpert-1',
            env: {
                workspaceId: 'workspace-1'
            }
        })

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(FindCopilotModelsQuery))
        expect(result).toEqual({
            status: 'available',
            summary: "Found 2 available AI models. Current LLM provider is 'openai' and current model is 'gpt-4o'.",
            total: 2,
            workspaceId: 'workspace-1',
            currentCopilotId: 'copilot-openai',
            currentProvider: 'openai',
            currentModelId: 'gpt-4o',
            items: [
                {
                    copilotId: 'copilot-openai',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4o',
                    label: 'GPT-4o',
                    features: null,
                    isCurrentProvider: true,
                    isCurrentModel: true
                },
                {
                    copilotId: 'copilot-openai',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4.1',
                    label: 'GPT-4.1',
                    features: null,
                    isCurrentProvider: true,
                    isCurrentModel: false
                }
            ]
        })
    })

    it('falls back to listing all accessible copilot models when target xpert is missing', async () => {
        const { service } = createService({
            queryBus: {
                execute: jest.fn().mockImplementation((query) => {
                    if (query instanceof FindCopilotModelsQuery && query.type === AiModelTypeEnum.LLM) {
                        return Promise.resolve([
                            {
                                id: 'copilot-openai',
                                modelProvider: {
                                    providerName: 'openai'
                                },
                                providerWithModels: {
                                    provider: 'openai',
                                    models: [
                                        {
                                            model: 'gpt-4o'
                                        }
                                    ]
                                }
                            }
                        ])
                    }

                    return Promise.resolve([])
                })
            }
        })

        const result = await service.getAvailableCopilotModelsFromContext({
            env: {
                workspaceId: 'workspace-1'
            }
        })

        expect(result).toEqual({
            status: 'available',
            summary: 'Found 1 available AI models across accessible providers.',
            total: 1,
            workspaceId: 'workspace-1',
            currentCopilotId: null,
            currentProvider: null,
            currentModelId: null,
            items: [
                {
                    copilotId: 'copilot-openai',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4o',
                    label: 'gpt-4o',
                    features: null,
                    isCurrentProvider: false,
                    isCurrentModel: false
                }
            ]
        })
    })

    it('does not expose stale current model fields when the current draft model is no longer available', async () => {
        const { service, queryBus } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-stale-model',
                            agent: {
                                key: 'Agent_1',
                                copilotModel: {
                                    copilotId: 'copilot-openai',
                                    model: 'gpt-4o',
                                    copilot: {
                                        modelProvider: {
                                            providerName: 'openai'
                                        },
                                        copilotModel: {
                                            model: 'gpt-4o'
                                        }
                                    }
                                }
                            }
                        })
                    )
                }
            },
            queryBus: {
                execute: jest.fn().mockImplementation((query) => {
                    if (query instanceof FindCopilotModelsQuery && query.type === AiModelTypeEnum.LLM) {
                        return Promise.resolve([
                            {
                                id: 'copilot-openai',
                                modelProvider: {
                                    providerName: 'openai'
                                },
                                providerWithModels: {
                                    provider: 'openai',
                                    models: [
                                        {
                                            model: 'gpt-4.1'
                                        }
                                    ]
                                }
                            },
                            {
                                id: 'copilot-anthropic',
                                modelProvider: {
                                    providerName: 'anthropic'
                                },
                                providerWithModels: {
                                    provider: 'anthropic',
                                    models: [
                                        {
                                            model: 'claude-sonnet-4'
                                        }
                                    ]
                                }
                            }
                        ])
                    }

                    return Promise.resolve([])
                })
            }
        })

        const result = await service.getAvailableCopilotModelsFromContext({
            targetXpertId: 'xpert-stale-model',
            env: {
                workspaceId: 'workspace-1'
            }
        })

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(FindCopilotModelsQuery))
        expect(result).toEqual({
            status: 'available',
            summary: 'Found 2 available AI models across accessible providers.',
            total: 2,
            workspaceId: 'workspace-1',
            currentCopilotId: null,
            currentProvider: null,
            currentModelId: null,
            items: [
                {
                    copilotId: 'copilot-openai',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4.1',
                    label: 'gpt-4.1',
                    features: null,
                    isCurrentProvider: false,
                    isCurrentModel: false
                },
                {
                    copilotId: 'copilot-anthropic',
                    provider: 'anthropic',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'claude-sonnet-4',
                    label: 'claude-sonnet-4',
                    features: null,
                    isCurrentProvider: false,
                    isCurrentModel: false
                }
            ]
        })
    })

    it('loads the copilot model catalog internally when model configuration changes without a snapshot', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-model-1',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                },
                copilotModel: {
                    modelType: 'llm',
                    model: 'gpt-4o'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert'
                    }
                }
            ],
            connections: []
        }
        const updatedDraft = {
            ...currentDraft,
            team: {
                ...currentDraft.team,
                copilotModel: {
                    copilotId: 'copilot-openai',
                    modelType: 'llm',
                    model: 'gpt-4.1'
                }
            }
        }
        const persistedXpert = buildPersistedXpert({
            id: 'xpert-model-1',
            draft: currentDraft
        })
        const updatedXpert = {
            ...persistedXpert,
            draft: updatedDraft
        }
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof XpertImportCommand) {
                    return Promise.resolve(updatedXpert)
                }

                if (command instanceof XpertExportCommand) {
                    return Promise.resolve(updatedDraft)
                }

                return Promise.resolve(updatedXpert)
            })
        }
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof FindCopilotModelsQuery && query.type === AiModelTypeEnum.LLM) {
                    return Promise.resolve([
                        {
                            id: 'copilot-openai',
                            modelProvider: {
                                providerName: 'openai'
                            },
                            providerWithModels: {
                                provider: 'openai',
                                models: [
                                    {
                                        model: 'gpt-4o'
                                    },
                                    {
                                        model: 'gpt-4.1'
                                    }
                                ]
                            }
                        }
                    ])
                }

                return Promise.resolve([])
            })
        }
        const { service, xpertService } = createService({
            xpertService: {
                validate: jest.fn().mockResolvedValue([]),
                repository: {
                    findOne: jest
                        .fn()
                        .mockResolvedValueOnce(persistedXpert)
                        .mockResolvedValueOnce(persistedXpert)
                        .mockResolvedValueOnce(updatedXpert)
                }
            },
            commandBus,
            queryBus
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-model-1',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
  copilotModel:
    modelType: llm
    model: gpt-4.1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
            }
        )

        const importCommand = commandBus.execute.mock.calls.find(([command]) => command instanceof XpertImportCommand)?.[0]

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(FindCopilotModelsQuery))
        expect(importCommand.draft.team.copilotModel).toEqual(
            expect.objectContaining({
                copilotId: 'copilot-openai',
                modelType: 'llm',
                model: 'gpt-4.1'
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'editXpert'
            })
        )
        expect(xpertService.validate).toHaveBeenCalled()
    })

    it('rejects editXpert when a changed model id is not in the available copilot model catalog snapshot', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-model-2',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                },
                copilotModel: {
                    modelType: 'llm',
                    model: 'gpt-4o'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert'
                    }
                }
            ],
            connections: []
        }
        const { service, commandBus, xpertService } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-model-2',
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-model-2',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
  copilotModel:
    modelType: llm
    model: gpt-5x
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
            },
            {
                targetXpertId: 'xpert-model-2',
                currentCopilotId: null,
                currentProvider: 'openai',
                currentModelId: 'gpt-4o',
                availableModelIds: ['gpt-4o', 'gpt-4.1'],
                items: [
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4o',
                        label: 'GPT-4o',
                        isCurrentProvider: true,
                        isCurrentModel: true
                    },
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4.1',
                        label: 'GPT-4.1',
                        isCurrentProvider: true,
                        isCurrentModel: false
                    }
                ]
            }
        )

        expect(result).toEqual(
            expect.objectContaining({
                status: 'rejected',
                toolName: 'editXpert',
                summary:
                    'Draft validation failed with 1 issues: team.copilotModel uses unavailable llm model id "gpt-5x" for provider \'openai\'. Call getAvailableCopilotModels and use one of: gpt-4o, gpt-4.1.',
                diagnostics: [
                    {
                        kind: 'model',
                        source: 'catalog',
                        message:
                            'team.copilotModel uses unavailable llm model id "gpt-5x" for provider \'openai\'. Call getAvailableCopilotModels and use one of: gpt-4o, gpt-4.1.'
                    }
                ]
            })
        )
        expect(xpertService.validate).toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(XpertImportCommand))
    })

    it('returns model and structural diagnostics together when both are present before import', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-model-2b',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                },
                copilotModel: {
                    modelType: 'llm',
                    model: 'gpt-4o'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert'
                    }
                }
            ],
            connections: []
        }
        const { service, commandBus } = createService({
            xpertService: {
                validate: jest.fn().mockResolvedValue([]),
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-model-2b',
                            agent: {
                                id: 'agent-1',
                                key: 'Agent_1',
                                name: 'Support Expert'
                            },
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-model-2b',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
  copilotModel:
    modelType: llm
    model: gpt-5x
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
  - type: workflow
    key: Middleware_Summarization
    position:
      x: 240
      y: 0
    entity:
      key: Middleware_Summarization
      type: middleware
      provider: SummarizationMiddleware
      options: {}
connections:
  - key: ""
    from: Agent_1
    to: Middleware_Summarization
    type: workflow`
            },
            {
                targetXpertId: 'xpert-model-2b',
                currentCopilotId: null,
                currentProvider: 'openai',
                currentModelId: 'gpt-4o',
                availableModelIds: ['gpt-4o', 'gpt-4.1'],
                items: [
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4o',
                        label: 'GPT-4o',
                        isCurrentProvider: true,
                        isCurrentModel: true
                    },
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4.1',
                        label: 'GPT-4.1',
                        isCurrentProvider: true,
                        isCurrentModel: false
                    }
                ]
            }
        )

        expect(result).toEqual(
            expect.objectContaining({
                status: 'rejected',
                toolName: 'editXpert',
                summary: expect.stringContaining('Draft validation failed with 3 issues:')
            })
        )
        expect(result.diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'model',
                    source: 'catalog',
                    message:
                        'team.copilotModel uses unavailable llm model id "gpt-5x" for provider \'openai\'. Call getAvailableCopilotModels and use one of: gpt-4o, gpt-4.1.'
                }),
                expect.objectContaining({
                    kind: 'validation',
                    source: 'structure',
                    message: 'Connection key cannot be empty.'
                }),
                expect.objectContaining({
                    kind: 'model',
                    source: 'structure',
                    message: 'middleware node "Middleware_Summarization" uses SummarizationMiddleware and must specify options.model.'
                })
            ])
        )
        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(XpertImportCommand))
    })

    it('fills copilotId before import when the changed model exists in the copilot model catalog snapshot', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-model-3',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                },
                copilotModel: {
                    modelType: 'llm',
                    model: 'gpt-4o'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert'
                    }
                }
            ],
            connections: []
        }
        const persistedXpert = buildPersistedXpert({
            id: 'xpert-model-3',
            draft: currentDraft
        })
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof XpertImportCommand) {
                    return Promise.resolve(persistedXpert)
                }

                if (command instanceof XpertExportCommand) {
                    return Promise.resolve({
                        team: {
                            id: 'xpert-model-3',
                            name: 'Support Expert',
                            type: 'agent',
                            agent: {
                                key: 'Agent_1'
                            },
                            copilotModel: {
                                copilotId: 'copilot-openai',
                                modelType: 'llm',
                                model: 'gpt-4.1'
                            }
                        },
                        nodes: currentDraft.nodes,
                        connections: []
                    })
                }

                return Promise.resolve(persistedXpert)
            })
        }
        const { service } = createService({
            xpertService: {
                repository: {
                    findOne: jest
                        .fn()
                        .mockResolvedValueOnce(persistedXpert)
                        .mockResolvedValueOnce({
                            ...persistedXpert,
                            draft: {
                                ...currentDraft,
                                team: {
                                    ...currentDraft.team,
                                    copilotModel: {
                                        copilotId: 'copilot-openai',
                                        modelType: 'llm',
                                        model: 'gpt-4.1'
                                    }
                                }
                            }
                        })
                }
            },
            commandBus
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-model-3',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
  copilotModel:
    modelType: llm
    model: gpt-4.1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
            },
            {
                targetXpertId: 'xpert-model-3',
                currentCopilotId: 'copilot-openai',
                currentProvider: 'openai',
                currentModelId: 'gpt-4o',
                availableModelIds: ['gpt-4o', 'gpt-4.1'],
                items: [
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4o',
                        label: 'GPT-4o',
                        isCurrentProvider: true,
                        isCurrentModel: true
                    },
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4.1',
                        label: 'GPT-4.1',
                        isCurrentProvider: true,
                        isCurrentModel: false
                    }
                ]
            }
        )

        const importCommand = commandBus.execute.mock.calls.find(
            ([command]) => command instanceof XpertImportCommand
        )?.[0]
        expect(importCommand).toEqual(
            expect.objectContaining({
                options: {
                    targetXpertId: 'xpert-model-3'
                },
                draft: expect.objectContaining({
                    team: expect.objectContaining({
                        copilotModel: expect.objectContaining({
                            copilotId: 'copilot-openai',
                            modelType: 'llm',
                            model: 'gpt-4.1'
                        })
                    })
                })
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'editXpert'
            })
        )
    })

    it('fills copilotId for knowledge-base embedding and rerank models before import', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-model-kb',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert'
                    }
                },
                {
                    type: 'workflow',
                    key: 'KnowledgeBase_1',
                    position: { x: 240, y: 0 },
                    entity: {
                        key: 'KnowledgeBase_1',
                        type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
                        inputs: ['content']
                    }
                }
            ],
            connections: []
        }
        const persistedXpert = buildPersistedXpert({
            id: 'xpert-model-kb',
            draft: currentDraft
        })
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof XpertImportCommand) {
                    return Promise.resolve(persistedXpert)
                }

                if (command instanceof XpertExportCommand) {
                    return Promise.resolve({
                        team: currentDraft.team,
                        nodes: [
                            currentDraft.nodes[0],
                            {
                                ...currentDraft.nodes[1],
                                entity: {
                                    ...(currentDraft.nodes[1] as any).entity,
                                    copilotModel: {
                                        copilotId: 'copilot-embedding',
                                        modelType: 'text-embedding',
                                        model: 'text-embedding-3-large'
                                    },
                                    rerankModel: {
                                        copilotId: 'copilot-rerank',
                                        modelType: 'rerank',
                                        model: 'rerank-v1'
                                    }
                                }
                            }
                        ],
                        connections: []
                    })
                }

                return Promise.resolve(persistedXpert)
            })
        }
        const { service } = createService({
            xpertService: {
                validate: jest.fn().mockResolvedValue([]),
                repository: {
                    findOne: jest
                        .fn()
                        .mockResolvedValueOnce(persistedXpert)
                        .mockResolvedValueOnce({
                            ...persistedXpert,
                            draft: {
                                ...currentDraft,
                                nodes: [
                                    currentDraft.nodes[0],
                                    {
                                        ...currentDraft.nodes[1],
                                        entity: {
                                            ...(currentDraft.nodes[1] as any).entity,
                                            copilotModel: {
                                                copilotId: 'copilot-embedding',
                                                modelType: 'text-embedding',
                                                model: 'text-embedding-3-large'
                                            },
                                            rerankModel: {
                                                copilotId: 'copilot-rerank',
                                                modelType: 'rerank',
                                                model: 'rerank-v1'
                                            }
                                        }
                                    }
                                ]
                            }
                        })
                }
            },
            commandBus
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-model-kb',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
  - type: workflow
    key: KnowledgeBase_1
    position:
      x: 240
      y: 0
    entity:
      key: KnowledgeBase_1
      type: knowledgebase
      inputs:
        - content
      copilotModel:
        model: text-embedding-3-large
      rerankModel:
        model: rerank-v1
connections: []`
            },
            {
                targetXpertId: 'xpert-model-kb',
                currentCopilotId: 'copilot-openai',
                currentProvider: 'openai',
                currentModelId: 'gpt-4o',
                availableModelIds: ['gpt-4o', 'text-embedding-3-large', 'rerank-v1'],
                items: [
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4o',
                        label: 'GPT-4o',
                        isCurrentProvider: true,
                        isCurrentModel: true
                    },
                    {
                        copilotId: 'copilot-embedding',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.TEXT_EMBEDDING,
                        model: 'text-embedding-3-large',
                        label: 'Text Embedding 3 Large',
                        isCurrentProvider: true,
                        isCurrentModel: false
                    },
                    {
                        copilotId: 'copilot-rerank',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.RERANK,
                        model: 'rerank-v1',
                        label: 'Rerank V1',
                        isCurrentProvider: true,
                        isCurrentModel: false
                    }
                ]
            }
        )

        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'editXpert'
            })
        )
        const importCommand = commandBus.execute.mock.calls.find(([command]) => command instanceof XpertImportCommand)?.[0]
        const kbNode = importCommand.draft.nodes.find((node) => node.key === 'KnowledgeBase_1')
        expect(kbNode.entity.copilotModel).toEqual(
            expect.objectContaining({
                copilotId: 'copilot-embedding',
                modelType: 'text-embedding',
                model: 'text-embedding-3-large'
            })
        )
        expect(kbNode.entity.rerankModel).toEqual(
            expect.objectContaining({
                copilotId: 'copilot-rerank',
                modelType: 'rerank',
                model: 'rerank-v1'
            })
        )
    })

    it('fills copilotId for middleware options.model before import', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-model-middleware',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert'
                    }
                },
                {
                    type: 'workflow',
                    key: 'Middleware_Summarization',
                    position: { x: 240, y: 0 },
                    entity: {
                        key: 'Middleware_Summarization',
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'SummarizationMiddleware',
                        options: {
                            model: {
                                modelType: 'llm',
                                model: 'gpt-4.1'
                            }
                        }
                    }
                }
            ],
            connections: []
        }
        const persistedXpert = buildPersistedXpert({
            id: 'xpert-model-middleware',
            draft: currentDraft
        })
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof XpertImportCommand) {
                    return Promise.resolve(persistedXpert)
                }

                if (command instanceof XpertExportCommand) {
                    return Promise.resolve(currentDraft)
                }

                return Promise.resolve(persistedXpert)
            })
        }
        const { service } = createService({
            xpertService: {
                validate: jest.fn().mockResolvedValue([]),
                repository: {
                    findOne: jest.fn().mockResolvedValue(persistedXpert)
                }
            },
            commandBus
        })

        await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-model-middleware',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
  - type: workflow
    key: Middleware_Summarization
    position:
      x: 240
      y: 0
    entity:
      key: Middleware_Summarization
      type: middleware
      provider: SummarizationMiddleware
      options:
        model:
          modelType: llm
          model: gpt-4.1
connections: []`
            },
            {
                targetXpertId: 'xpert-model-middleware',
                currentCopilotId: 'copilot-openai',
                currentProvider: 'openai',
                currentModelId: 'gpt-4o',
                availableModelIds: ['gpt-4o', 'gpt-4.1'],
                items: [
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4o',
                        label: 'GPT-4o',
                        isCurrentProvider: true,
                        isCurrentModel: true
                    },
                    {
                        copilotId: 'copilot-openai',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4.1',
                        label: 'GPT-4.1',
                        isCurrentProvider: true,
                        isCurrentModel: false
                    }
                ]
            }
        )

        const importCommand = commandBus.execute.mock.calls.find(([command]) => command instanceof XpertImportCommand)?.[0]
        const middlewareNode = importCommand.draft.nodes.find((node) => node.key === 'Middleware_Summarization')
        expect(middlewareNode.entity.options.model).toEqual(
            expect.objectContaining({
                copilotId: 'copilot-openai',
                modelType: 'llm',
                model: 'gpt-4.1'
            })
        )
    })

    it('rejects editXpert when speech-to-text is enabled without a speech model', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-model-stt',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                }
            },
            nodes: [],
            connections: []
        }
        const { service, commandBus } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-model-stt',
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-model-stt',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
  features:
    speechToText:
      enabled: true
nodes: []
connections: []`
            }
        )

        expect(result).toEqual(
            expect.objectContaining({
                status: 'rejected',
                toolName: 'editXpert',
                summary:
                    'Draft validation failed with 1 issues: team.features.speechToText is enabled and must specify a speech-to-text model.'
            })
        )
        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(XpertImportCommand))
    })

    it('rejects editXpert when a model name matches multiple available copilotIds and the DSL omits copilotId', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-model-4',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                },
                copilotModel: {
                    modelType: 'llm',
                    model: 'gpt-4o'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert'
                    }
                }
            ],
            connections: []
        }
        const { service, commandBus, xpertService } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-model-4',
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-model-4',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
  copilotModel:
    modelType: llm
    model: gpt-4.1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
            },
            {
                targetXpertId: 'xpert-model-4',
                currentCopilotId: null,
                currentProvider: 'openai',
                currentModelId: 'gpt-4o',
                availableModelIds: ['gpt-4o', 'gpt-4.1', 'gpt-4.1'],
                items: [
                    {
                        copilotId: 'copilot-openai-1',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4.1',
                        label: 'GPT-4.1',
                        isCurrentProvider: true,
                        isCurrentModel: false
                    },
                    {
                        copilotId: 'copilot-openai-2',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4.1',
                        label: 'GPT-4.1 Alt',
                        isCurrentProvider: true,
                        isCurrentModel: false
                    }
                ]
            }
        )

        expect(result).toEqual(
            expect.objectContaining({
                status: 'rejected',
                toolName: 'editXpert',
                summary:
                    'Draft validation failed with 1 issues: team.copilotModel uses model "gpt-4.1" but does not specify a copilotId, and multiple copilotIds are available: copilot-openai-1, copilot-openai-2. Call getAvailableCopilotModels and write the matching copilotId explicitly.',
                diagnostics: [
                    {
                        kind: 'model',
                        source: 'catalog',
                        message:
                            'team.copilotModel uses model "gpt-4.1" but does not specify a copilotId, and multiple copilotIds are available: copilot-openai-1, copilot-openai-2. Call getAvailableCopilotModels and write the matching copilotId explicitly.'
                    }
                ]
            })
        )
        expect(xpertService.validate).toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(XpertImportCommand))
    })

    it('rejects editXpert when the yaml is invalid', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-3',
                name: 'Support Expert',
                agent: {
                    key: 'Agent_1'
                }
            },
            nodes: [],
            connections: []
        }
        const { service, commandBus } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-3',
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-3',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: 'team: ['
            }
        )

        expect(result).toEqual(
            expect.objectContaining({
                status: 'rejected',
                toolName: 'editXpert',
                summary: 'Invalid YAML DSL provided for editXpert.'
            })
        )
        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(XpertImportCommand))
    })

    it('rejects editXpert when the candidate draft contains broken graph connections', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-graph',
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_current'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_current',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_current',
                        name: 'Support Expert'
                    }
                }
            ],
            connections: []
        }
        const { service, commandBus } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-graph',
                            agent: {
                                id: 'agent-current',
                                key: 'Agent_current',
                                name: 'Support Expert'
                            },
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-graph',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_imported
nodes:
  - type: agent
    key: Agent_imported
    position:
      x: 0
      y: 0
    entity:
      key: Agent_imported
      name: Support Expert
  - type: workflow
    key: Workflow_Code
    position:
      x: 200
      y: 0
    entity:
      key: Workflow_Code
      type: code
      title: Broken Target
connections:
  - key: Agent_imported/Workflow_Code
    from: Agent_imported
    to: Workflow_Code
    type: workflow`
            }
        )

        expect(result).toEqual(
            expect.objectContaining({
                status: 'rejected',
                toolName: 'editXpert',
                summary: expect.stringContaining('Draft validation failed with'),
                diagnostics: expect.arrayContaining([
                    expect.objectContaining({
                        kind: 'validation',
                        source: 'structure'
                    })
                ])
            })
        )
        expect(result.diagnostics).toEqual([
            expect.objectContaining({
                kind: 'validation',
                source: 'structure',
                message: 'Connection "Agent_current/Workflow_Code" targets "Workflow_Code" with unsupported type "workflow".'
            })
        ])
        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(XpertImportCommand))
    })

    it('restores the current xpert name when the updated name is unavailable', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-name-1',
                name: 'Support Expert',
                title: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert'
                    }
                }
            ],
            connections: []
        }
        const persistedXpert = buildPersistedXpert({
            id: 'xpert-name-1',
            draft: currentDraft
        })
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof XpertImportCommand) {
                    return Promise.resolve(persistedXpert)
                }

                if (command instanceof XpertExportCommand) {
                    return Promise.resolve(currentDraft)
                }

                return Promise.resolve(persistedXpert)
            })
        }
        const { service, xpertService } = createService({
            xpertService: {
                validateName: jest.fn().mockResolvedValue(false),
                validate: jest.fn().mockResolvedValue([]),
                repository: {
                    findOne: jest
                        .fn()
                        .mockResolvedValueOnce(persistedXpert)
                        .mockResolvedValueOnce(persistedXpert)
                }
            },
            commandBus
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-name-1',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Conflicting Expert
  type: agent
  agent:
    key: Agent_1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
            }
        )

        const importCommand = commandBus.execute.mock.calls.find(([command]) => command instanceof XpertImportCommand)?.[0]

        expect(importCommand.draft.team).toEqual(
            expect.objectContaining({
                name: 'Support Expert',
                title: 'Support Expert'
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'editXpert'
            })
        )
        expect(xpertService.validateName).toHaveBeenCalledWith('Conflicting Expert')
    })

    it('allows editXpert to proceed when studio has unsaved local changes', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-5',
                name: 'Support Expert',
                agent: {
                    key: 'Agent_1'
                }
            },
            nodes: [],
            connections: []
        }
        const { service, commandBus, xpertService } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-5',
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-5',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft),
                unsaved: true
            },
            {
                dslYaml: `team:
  name: Updated Expert
  type: agent
  agent:
    key: Agent_1
nodes: []
connections: []`
            }
        )

        expect(xpertService.repository.findOne).toHaveBeenCalled()
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                options: {
                    targetXpertId: 'xpert-5'
                }
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'editXpert'
            })
        )
    })

    it('allows editXpert to proceed when baseDraftHash is stale', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-6',
                agent: {
                    key: 'Agent_1'
                }
            },
            nodes: [],
            connections: []
        }
        const { service, commandBus } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-6',
                            draft: currentDraft
                        })
                    )
                }
            }
        })
        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-6',
                baseDraftHash: 'stale-hash'
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
            }
        )

        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                options: {
                    targetXpertId: 'xpert-6'
                }
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'editXpert'
            })
        )
    })

    it('allows editXpert to proceed when baseDraftHash is missing', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-6b',
                agent: {
                    key: 'Agent_1'
                }
            },
            nodes: [],
            connections: []
        }
        const { service, commandBus } = createService({
            xpertService: {
                repository: {
                    findOne: jest.fn().mockResolvedValue(
                        buildPersistedXpert({
                            id: 'xpert-6b',
                            draft: currentDraft
                        })
                    )
                }
            }
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-6b'
            },
            {
                dslYaml: `team:
  name: Support Expert
  type: agent
  agent:
    key: Agent_1
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Support Expert
connections: []`
            }
        )

        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                options: {
                    targetXpertId: 'xpert-6b'
                }
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'editXpert'
            })
        )
    })

    it('imports yaml dsl into the current xpert and returns normalized yaml', async () => {
        const currentDraft = {
            team: {
                id: 'xpert-7',
                name: 'Support Expert',
                title: 'Support Expert',
                agent: {
                    key: 'Agent_full'
                }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_full',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_full',
                        name: 'Support Expert'
                    }
                }
            ],
            connections: []
        }
        const persistedXpert = buildPersistedXpert({
            id: 'xpert-7',
            draft: currentDraft
        })
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof XpertImportCommand) {
                    return Promise.resolve(persistedXpert)
                }

                if (command instanceof XpertExportCommand) {
                    return Promise.resolve({
                        team: {
                            id: 'xpert-7',
                            name: 'Updated Expert',
                            title: 'Updated Expert',
                            agent: {
                                key: 'Agent_full'
                            }
                        },
                        nodes: [
                            {
                                type: 'agent',
                                key: 'Agent_full',
                                entity: {
                                    key: 'Agent_full',
                                    name: 'Updated Expert',
                                    prompt: 'Updated prompt'
                                }
                            }
                        ],
                        connections: []
                    })
                }

                return Promise.resolve(persistedXpert)
            })
        }
        const { service } = createService({
            xpertService: {
                repository: {
                    findOne: jest
                        .fn()
                        .mockResolvedValueOnce(persistedXpert)
                        .mockResolvedValueOnce({
                            ...persistedXpert,
                            draft: {
                                ...currentDraft,
                                team: {
                                    ...currentDraft.team,
                                    name: 'Updated Expert',
                                    title: 'Updated Expert',
                                    description: 'Updated description',
                                    agent: {
                                        key: 'Agent_full',
                                        name: 'Updated Expert',
                                        prompt: 'Updated prompt'
                                    }
                                }
                            }
                        })
                }
            },
            commandBus
        })

        const result = await service.editXpertFromContext(
            {
                targetXpertId: 'xpert-7',
                baseDraftHash: (service as any).calculateDraftHash(currentDraft)
            },
            {
                dslYaml: `team:
  name: Updated Expert
  type: agent
  agent:
    key: Agent_imported
nodes:
  - type: agent
    key: Agent_imported
    entity:
      key: Agent_imported
      name: Updated Expert
      prompt: Updated prompt
connections: []`
            }
        )

        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                options: {
                    targetXpertId: 'xpert-7'
                }
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                status: 'applied',
                toolName: 'editXpert',
                dslYaml: expect.stringContaining('Updated Expert')
            })
        )
    })
})

import { BadRequestException } from '@nestjs/common'

jest.mock('@xpert-ai/contracts', () => ({
    AiModelTypeEnum: {
        LLM: 'llm',
        TEXT_EMBEDDING: 'text-embedding',
        RERANK: 'rerank',
        SPEECH2TEXT: 'speech2text',
        TTS: 'tts'
    },
    AiProviderRole: {
        Primary: 'primary'
    },
    FetchFrom: {
        CUSTOMIZABLE_MODEL: 'customizable-model'
    },
    ModelFeature: {
        VISION: 'vision'
    },
    LongTermMemoryTypeEnum: {
        QA: 'qa'
    },
    WorkflowNodeTypeEnum: {
        MIDDLEWARE: 'middleware',
        KNOWLEDGE_BASE: 'knowledge-base'
    },
    XpertTypeEnum: {
        Agent: 'agent'
    },
    convertToUrlPath: (value: string) => value?.trim().toLowerCase().replace(/\s+/g, '-'),
    mapTranslationLanguage: (value: string) => value,
    omitXpertRelations: (xpert: Record<string, any>) => {
        const { agent, agents, toolsets, knowledgebases, ...rest } = xpert
        return rest
    },
    replaceAgentInDraft: (draft: Record<string, any>, sourceKey: string, agent: Record<string, any>) => ({
        ...draft,
        team: {
            ...(draft.team ?? {}),
            agent: {
                ...(draft.team?.agent ?? {}),
                ...agent,
                key: agent.key
            }
        },
        nodes: (draft.nodes ?? []).map((node: Record<string, any>) =>
            node.type === 'agent' && node.key === sourceKey
                ? {
                      ...node,
                      key: agent.key,
                      entity: {
                          ...(node.entity ?? {}),
                          ...agent,
                          key: agent.key
                      }
                  }
                : node
        ),
        connections: (draft.connections ?? []).map((connection: Record<string, any>) => {
            const from = connection.from === sourceKey ? agent.key : connection.from
            const to = connection.to === sourceKey ? agent.key : connection.to

            return from === connection.from && to === connection.to
                ? connection
                : {
                      ...connection,
                      from,
                      to,
                      key: `${from}/${to}`
                  }
        })
    })
}))

jest.mock('../../types', () => ({
    XpertNameInvalidException: class XpertNameInvalidException extends Error {}
}))

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../../xpert-agent/xpert-agent.service', () => ({
    XpertAgentService: class XpertAgentService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        getLanguageCode: jest.fn().mockReturnValue('en'),
        currentTenantId: jest.fn().mockReturnValue('tenant-1'),
        getOrganizationId: jest.fn().mockReturnValue('org-1')
    }
}))

jest.mock('i18next', () => ({
    t: jest.fn((key: string, options?: { scope?: string }) => {
        if (key === 'server-ai:Error.ManagedImportRequiresPrimaryLlmModel') {
            return `Managed xpert import requires an enabled primary LLM copilot model for ${options?.scope}.`
        }
        if (key === 'server-ai:Error.CurrentOrganizationScope') {
            return 'the current organization'
        }
        if (key === 'server-ai:Error.TenantScope') {
            return 'tenant scope'
        }
        if (key === 'server-ai:Error.PrimaryAgentNotFound') {
            return 'Primary agent node not found'
        }

        return key
    })
}))

import { XpertImportHandler } from './import.handler'
import { XpertImportCommand } from '../import.command'
import { CopilotOneByRoleQuery, FindCopilotModelsQuery } from '../../../copilot/queries'
import { WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import type { IWFNMiddleware } from '@xpert-ai/contracts'

describe('XpertImportHandler', () => {
    const i18n = {
        t: jest.fn().mockResolvedValue('Name invalid')
    }

    const buildHandler = (overrides: Record<string, any> = {}) => {
        const xpertService = {
            create: jest.fn().mockResolvedValue({
                id: 'new-xpert',
                name: 'Imported Expert',
                slug: 'imported-expert',
                agent: {
                    id: 'agent-new',
                    key: 'Agent_new',
                    name: 'Imported Expert'
                }
            }),
            validateName: jest.fn().mockResolvedValue(true),
            saveDraft: jest.fn().mockImplementation(async (_id, draft) => draft),
            createBulkMemories: jest.fn().mockResolvedValue(undefined),
            repository: {
                findOne: jest.fn()
            },
            ...overrides
        }
        const queryBus = {
            execute: jest.fn().mockResolvedValue([])
        }
        const xpertAgentService = {
            getMiddlewareStrategies: jest.fn().mockReturnValue([])
        }

        return {
            xpertService,
            queryBus,
            xpertAgentService,
            handler: new XpertImportHandler(xpertService as any, i18n as any, queryBus as any, xpertAgentService as any)
        }
    }

    it('keeps the existing import behavior for creating a new xpert', async () => {
        const { handler, xpertService } = buildHandler()

        const result = await handler.execute(
            new XpertImportCommand({
                team: {
                    name: 'Imported Expert',
                    title: 'Imported Expert',
                    type: 'agent',
                    agent: {
                        key: 'Agent_imported'
                    }
                },
                nodes: [
                    {
                        type: 'agent',
                        key: 'Agent_imported',
                        entity: {
                            key: 'Agent_imported',
                            name: 'Imported Expert',
                            prompt: 'Help users'
                        }
                    }
                ],
                connections: [],
                memories: [
                    {
                        prefix: 'memory:qa',
                        value: {
                            question: 'Hello?',
                            answer: 'Hi!'
                        }
                    }
                ]
            } as any)
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Imported Expert'
            })
        )
        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'new-xpert',
            expect.objectContaining({
                team: expect.objectContaining({
                    id: 'new-xpert'
                })
            })
        )
        expect(xpertService.createBulkMemories).toHaveBeenCalledWith('new-xpert', {
            type: 'qa',
            memories: [
                {
                    question: 'Hello?',
                    answer: 'Hi!'
                }
            ]
        })
        expect(result.id).toBe('new-xpert')
    })

    it('overwrites the current xpert draft without creating a new xpert', async () => {
        const currentXpert = {
            id: 'xpert-1',
            name: 'Support Expert',
            title: 'Support Expert',
            slug: 'support-expert',
            type: 'agent',
            workspaceId: 'workspace-1',
            agent: {
                id: 'agent-1',
                key: 'Agent_current',
                name: 'Support Expert',
                title: 'Support Expert',
                prompt: 'Old prompt'
            },
            draft: {
                team: {
                    id: 'xpert-1',
                    name: 'Support Expert',
                    title: 'Support Expert',
                    workspaceId: 'workspace-1',
                    type: 'agent',
                    agent: {
                        key: 'Agent_current'
                    }
                },
                nodes: [],
                connections: []
            }
        }
        const { handler, xpertService } = buildHandler({
            repository: {
                findOne: jest.fn().mockResolvedValue(currentXpert)
            }
        })

        const result = await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'Support Expert',
                        title: 'Updated Expert',
                        description: 'New description',
                        type: 'agent',
                        workspaceId: 'workspace-2',
                        agent: {
                            key: 'Agent_imported'
                        }
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_imported',
                            entity: {
                                key: 'Agent_imported',
                                name: 'Updated Expert',
                                title: 'Updated Expert',
                                prompt: 'Updated prompt'
                            }
                        }
                    ],
                    connections: [],
                    memories: [
                        {
                            prefix: 'memory:qa',
                            value: {
                                question: 'Ignored?',
                                answer: 'Yes'
                            }
                        }
                    ]
                } as any,
                {
                    targetXpertId: 'xpert-1'
                }
            )
        )

        expect(xpertService.create).not.toHaveBeenCalled()
        expect(xpertService.validateName).not.toHaveBeenCalled()
        expect(xpertService.createBulkMemories).not.toHaveBeenCalled()
        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'xpert-1',
            expect.objectContaining({
                team: expect.objectContaining({
                    id: 'xpert-1',
                    workspaceId: 'workspace-1',
                    name: 'Support Expert',
                    title: 'Updated Expert',
                    description: 'New description',
                    agent: expect.objectContaining({
                        id: 'agent-1',
                        key: 'Agent_current',
                        prompt: 'Updated prompt'
                    })
                }),
                nodes: [
                    expect.objectContaining({
                        key: 'Agent_current',
                        entity: expect.objectContaining({
                            key: 'Agent_current',
                            name: 'Updated Expert',
                            prompt: 'Updated prompt'
                        })
                    })
                ]
            })
        )
        expect(result).toBe(currentXpert)
    })

    it('syncs the selected team model into imported llm nodes when their copilotId is missing or invalid', async () => {
        const availableCopilots = [
            {
                id: 'copilot-glm',
                providerWithModels: {
                    models: [
                        {
                            model: 'glm-5',
                            model_type: 'llm',
                            features: []
                        }
                    ]
                }
            },
            {
                id: 'copilot-openai',
                providerWithModels: {
                    models: [
                        {
                            model: 'gpt-4o',
                            model_type: 'llm',
                            features: []
                        }
                    ]
                }
            }
        ]
        const { handler, xpertService, queryBus, xpertAgentService } = buildHandler()
        queryBus.execute.mockResolvedValue(availableCopilots)
        xpertAgentService.getMiddlewareStrategies.mockReturnValue([
            {
                meta: {
                    name: 'SummarizationMiddleware',
                    configSchema: {
                        type: 'object',
                        properties: {
                            model: {
                                type: 'object',
                                'x-ui': {
                                    component: 'ai-model-select',
                                    inputs: {
                                        modelType: 'llm'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ])

        await handler.execute(
            new XpertImportCommand({
                team: {
                    name: 'Imported Expert',
                    title: 'Imported Expert',
                    type: 'agent',
                    copilotModel: {
                        copilotId: 'copilot-glm',
                        modelType: 'llm',
                        model: 'glm-5',
                        options: {
                            temperature: 0.2
                        }
                    },
                    agent: {
                        key: 'Agent_imported'
                    }
                },
                nodes: [
                    {
                        type: 'agent',
                        key: 'Agent_imported',
                        entity: {
                            key: 'Agent_imported',
                            name: 'Imported Expert',
                            prompt: 'Help users'
                        }
                    },
                    {
                        type: 'agent',
                        key: 'Agent_secondary',
                        entity: {
                            key: 'Agent_secondary',
                            name: 'Secondary Expert',
                            copilotModel: {
                                copilotId: 'copilot-openai',
                                modelType: 'llm',
                                model: 'gpt-4o'
                            }
                        }
                    },
                    {
                        type: 'workflow',
                        key: 'Middleware_summary',
                        entity: {
                            type: 'middleware',
                            provider: 'SummarizationMiddleware',
                            options: {
                                model: {
                                    copilotId: 'missing-copilot',
                                    modelType: 'llm',
                                    model: 'glm-5'
                                }
                            }
                        }
                    }
                ],
                connections: [],
                memories: []
            } as any)
        )

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(FindCopilotModelsQuery))
        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                agent: expect.objectContaining({
                    key: 'Agent_imported',
                    copilotModel: expect.objectContaining({
                        copilotId: 'copilot-glm',
                        modelType: 'llm',
                        model: 'glm-5',
                        options: {
                            temperature: 0.2
                        }
                    })
                })
            })
        )
        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'new-xpert',
            expect.objectContaining({
                nodes: expect.arrayContaining([
                    expect.objectContaining({
                        key: 'Agent_secondary',
                        entity: expect.objectContaining({
                            copilotModel: expect.objectContaining({
                                copilotId: 'copilot-openai',
                                model: 'gpt-4o'
                            })
                        })
                    }),
                    expect.objectContaining({
                        key: 'Middleware_summary',
                        entity: expect.objectContaining({
                            options: expect.objectContaining({
                                model: expect.objectContaining({
                                    copilotId: 'copilot-glm',
                                    model: 'glm-5',
                                    modelType: 'llm'
                                })
                            })
                        })
                    })
                ])
            })
        )
    })

    it('does not sync middleware options.model when the schema does not use ai-model-select', async () => {
        const availableCopilots = [
            {
                id: 'copilot-glm',
                providerWithModels: {
                    models: [
                        {
                            model: 'glm-5',
                            model_type: 'llm',
                            features: []
                        }
                    ]
                }
            }
        ]
        const { handler, xpertService, queryBus, xpertAgentService } = buildHandler()
        queryBus.execute.mockResolvedValue(availableCopilots)
        xpertAgentService.getMiddlewareStrategies.mockReturnValue([
            {
                meta: {
                    name: 'CustomMiddleware',
                    configSchema: {
                        type: 'object',
                        properties: {
                            model: {
                                type: 'object',
                                'x-ui': {
                                    component: 'json-editor'
                                }
                            }
                        }
                    }
                }
            }
        ])

        await handler.execute(
            new XpertImportCommand({
                team: {
                    name: 'Imported Expert',
                    title: 'Imported Expert',
                    type: 'agent',
                    copilotModel: {
                        copilotId: 'copilot-glm',
                        modelType: 'llm',
                        model: 'glm-5'
                    },
                    agent: {
                        key: 'Agent_imported'
                    }
                },
                nodes: [
                    {
                        type: 'agent',
                        key: 'Agent_imported',
                        entity: {
                            key: 'Agent_imported',
                            name: 'Imported Expert'
                        }
                    },
                    {
                        type: 'workflow',
                        key: 'Middleware_custom',
                        entity: {
                            type: 'middleware',
                            provider: 'CustomMiddleware',
                            options: {
                                model: {
                                    copilotId: 'missing-copilot',
                                    modelType: 'llm',
                                    model: 'glm-5'
                                }
                            }
                        }
                    }
                ],
                connections: [],
                memories: []
            } as any)
        )

        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'new-xpert',
            expect.objectContaining({
                nodes: expect.arrayContaining([
                    expect.objectContaining({
                        key: 'Middleware_custom',
                        entity: expect.objectContaining({
                            options: expect.objectContaining({
                                model: expect.objectContaining({
                                    copilotId: 'missing-copilot',
                                    modelType: 'llm',
                                    model: 'glm-5'
                                })
                            })
                        })
                    })
                ])
            })
        )
    })

    it('managed import injects the primary model into the team, primary agent, and ai-model middleware options', async () => {
        const availableCopilots = [
            {
                id: 'copilot-primary',
                providerWithModels: {
                    models: [
                        {
                            model: 'glm-5',
                            model_type: 'llm',
                            features: []
                        }
                    ]
                }
            }
        ]
        const { handler, xpertService, queryBus, xpertAgentService } = buildHandler()
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof CopilotOneByRoleQuery) {
                return {
                    id: 'copilot-primary',
                    copilotModel: {
                        model: 'glm-5',
                        modelType: 'llm',
                        options: {
                            temperature: 0.2
                        }
                    }
                }
            }

            if (query instanceof FindCopilotModelsQuery) {
                return availableCopilots
            }

            return null
        })
        xpertAgentService.getMiddlewareStrategies.mockReturnValue([
            {
                meta: {
                    name: 'SummarizationMiddleware',
                    configSchema: {
                        type: 'object',
                        properties: {
                            model: {
                                type: 'object',
                                'x-ui': {
                                    component: 'ai-model-select',
                                    inputs: {
                                        modelType: 'llm'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                meta: {
                    name: 'CustomMiddleware',
                    configSchema: {
                        type: 'object',
                        properties: {
                            model: {
                                type: 'object',
                                'x-ui': {
                                    component: 'json-editor'
                                }
                            }
                        }
                    }
                }
            }
        ])

        await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'Managed Expert',
                        title: 'Managed Expert',
                        type: XpertTypeEnum.Agent,
                        agent: {
                            key: 'Agent_imported'
                        }
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_imported',
                            position: { x: 0, y: 0 },
                            entity: {
                                key: 'Agent_imported',
                                name: 'Managed Expert'
                            }
                        },
                        {
                            type: 'workflow',
                            key: 'Middleware_summary',
                            position: { x: 0, y: 0 },
                            entity: {
                                id: 'Middleware_summary',
                                key: 'Middleware_summary',
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'SummarizationMiddleware',
                                options: {
                                    model: {
                                        copilotId: 'stale-copilot',
                                        modelType: 'llm',
                                        model: 'glm-5'
                                    }
                                }
                            } as IWFNMiddleware
                        },
                        {
                            type: 'workflow',
                            key: 'Middleware_custom',
                            position: { x: 0, y: 0 },
                            entity: {
                                id: 'Middleware_custom',
                                key: 'Middleware_custom',
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'CustomMiddleware',
                                options: {
                                    model: {
                                        copilotId: 'stale-copilot',
                                        modelType: 'llm',
                                        model: 'glm-5'
                                    }
                                }
                            } as IWFNMiddleware
                        }
                    ],
                    connections: [],
                    memories: []
                },
                {
                    normalizeCopilotModels: true
                }
            )
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                copilotModel: expect.objectContaining({
                    copilotId: 'copilot-primary',
                    model: 'glm-5',
                    modelType: 'llm'
                }),
                agent: expect.objectContaining({
                    copilotModel: expect.objectContaining({
                        copilotId: 'copilot-primary',
                        model: 'glm-5',
                        modelType: 'llm',
                        options: {
                            temperature: 0.2
                        }
                    })
                })
            })
        )
        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'new-xpert',
            expect.objectContaining({
                nodes: expect.arrayContaining([
                    expect.objectContaining({
                        key: 'Middleware_summary',
                        entity: expect.objectContaining({
                            options: expect.objectContaining({
                                model: expect.objectContaining({
                                    copilotId: 'copilot-primary',
                                    model: 'glm-5',
                                    modelType: 'llm'
                                })
                            })
                        })
                    }),
                    expect.objectContaining({
                        key: 'Middleware_custom',
                        entity: expect.objectContaining({
                            options: expect.objectContaining({
                                model: expect.objectContaining({
                                    copilotId: 'stale-copilot',
                                    model: 'glm-5',
                                    modelType: 'llm'
                                })
                            })
                        })
                    })
                ])
            })
        )
    })

    it('managed import accepts the primary selected model even when the model query does not list it', async () => {
        const { handler, xpertService, queryBus } = buildHandler()
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof CopilotOneByRoleQuery) {
                return {
                    id: 'copilot-primary',
                    copilotModel: {
                        model: 'qwen3.6-plus',
                        modelType: 'llm'
                    }
                }
            }

            if (query instanceof FindCopilotModelsQuery) {
                return []
            }

            return null
        })

        await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'Managed Expert',
                        title: 'Managed Expert',
                        type: XpertTypeEnum.Agent,
                        agent: {
                            key: 'Agent_imported'
                        }
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_imported',
                            position: { x: 0, y: 0 },
                            entity: {
                                key: 'Agent_imported',
                                name: 'Managed Expert'
                            }
                        }
                    ],
                    connections: [],
                    memories: []
                },
                {
                    normalizeCopilotModels: true
                }
            )
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                copilotModel: expect.objectContaining({
                    copilotId: 'copilot-primary',
                    model: 'qwen3.6-plus',
                    modelType: 'llm'
                }),
                agent: expect.objectContaining({
                    copilotModel: expect.objectContaining({
                        copilotId: 'copilot-primary',
                        model: 'qwen3.6-plus',
                        modelType: 'llm'
                    })
                })
            })
        )
    })

    it('managed overwrite injects the primary model before saving the existing draft', async () => {
        const currentXpert = {
            id: 'xpert-1',
            name: 'Support Expert',
            title: 'Support Expert',
            slug: 'support-expert',
            type: 'agent',
            workspaceId: 'workspace-1',
            agent: {
                id: 'agent-1',
                key: 'Agent_current',
                name: 'Support Expert'
            },
            draft: {
                team: {
                    id: 'xpert-1',
                    name: 'Support Expert',
                    title: 'Support Expert',
                    workspaceId: 'workspace-1',
                    type: 'agent',
                    agent: {
                        key: 'Agent_current'
                    }
                },
                nodes: [],
                connections: []
            }
        }
        const availableCopilots = [
            {
                id: 'copilot-primary',
                providerWithModels: {
                    models: [
                        {
                            model: 'glm-5',
                            model_type: 'llm',
                            features: []
                        }
                    ]
                }
            }
        ]
        const { handler, xpertService, queryBus, xpertAgentService } = buildHandler({
            repository: {
                findOne: jest.fn().mockResolvedValue(currentXpert)
            }
        })
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof CopilotOneByRoleQuery) {
                return {
                    id: 'copilot-primary',
                    copilotModel: {
                        model: 'glm-5',
                        modelType: 'llm'
                    }
                }
            }

            if (query instanceof FindCopilotModelsQuery) {
                return availableCopilots
            }

            return null
        })
        xpertAgentService.getMiddlewareStrategies.mockReturnValue([
            {
                meta: {
                    name: 'SummarizationMiddleware',
                    configSchema: {
                        type: 'object',
                        properties: {
                            model: {
                                type: 'object',
                                'x-ui': {
                                    component: 'ai-model-select',
                                    inputs: {
                                        modelType: 'llm'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ])

        await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'Support Expert',
                        title: 'Support Expert',
                        type: XpertTypeEnum.Agent,
                        agent: {
                            key: 'Agent_imported'
                        }
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_imported',
                            position: { x: 0, y: 0 },
                            entity: {
                                key: 'Agent_imported',
                                name: 'Support Expert'
                            }
                        },
                        {
                            type: 'workflow',
                            key: 'Middleware_summary',
                            position: { x: 0, y: 0 },
                            entity: {
                                id: 'Middleware_summary',
                                key: 'Middleware_summary',
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'SummarizationMiddleware',
                                options: {
                                    model: null
                                }
                            } as IWFNMiddleware
                        }
                    ],
                    connections: [],
                    memories: []
                },
                {
                    targetXpertId: 'xpert-1',
                    normalizeCopilotModels: true
                }
            )
        )

        expect(xpertService.create).not.toHaveBeenCalled()
        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'xpert-1',
            expect.objectContaining({
                team: expect.objectContaining({
                    id: 'xpert-1',
                    workspaceId: 'workspace-1',
                    copilotModel: expect.objectContaining({
                        copilotId: 'copilot-primary',
                        model: 'glm-5',
                        modelType: 'llm'
                    }),
                    agent: expect.objectContaining({
                        id: 'agent-1',
                        key: 'Agent_current',
                        copilotModel: expect.objectContaining({
                            copilotId: 'copilot-primary',
                            model: 'glm-5',
                            modelType: 'llm'
                        })
                    })
                }),
                nodes: expect.arrayContaining([
                    expect.objectContaining({
                        key: 'Agent_current',
                        entity: expect.objectContaining({
                            copilotModel: expect.objectContaining({
                                copilotId: 'copilot-primary',
                                model: 'glm-5',
                                modelType: 'llm'
                            })
                        })
                    }),
                    expect.objectContaining({
                        key: 'Middleware_summary',
                        entity: expect.objectContaining({
                            options: expect.objectContaining({
                                model: expect.objectContaining({
                                    copilotId: 'copilot-primary',
                                    model: 'glm-5',
                                    modelType: 'llm'
                                })
                            })
                        })
                    })
                ])
            })
        )
    })

    it('managed import fails when no primary LLM copilot model is configured', async () => {
        const { handler, queryBus } = buildHandler()
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof CopilotOneByRoleQuery) {
                return null
            }

            if (query instanceof FindCopilotModelsQuery) {
                return []
            }

            return null
        })

        await expect(
            handler.execute(
                new XpertImportCommand(
                    {
                        team: {
                            name: 'Managed Expert',
                            title: 'Managed Expert',
                            type: XpertTypeEnum.Agent,
                            agent: {
                                key: 'Agent_imported'
                            }
                        },
                        nodes: [],
                        connections: [],
                        memories: []
                    },
                    {
                        normalizeCopilotModels: true
                    }
                )
            )
        ).rejects.toThrow(
            'Managed xpert import requires an enabled primary LLM copilot model for the current organization.'
        )
    })

    it('rejects overwrite when the dsl type does not match the current xpert', async () => {
        const { handler } = buildHandler({
            repository: {
                findOne: jest.fn().mockResolvedValue({
                    id: 'xpert-2',
                    slug: 'support-expert',
                    type: 'agent',
                    workspaceId: 'workspace-1',
                    agent: {
                        key: 'Agent_current'
                    }
                })
            }
        })

        await expect(
            handler.execute(
                new XpertImportCommand(
                    {
                        team: {
                            name: 'Support Expert',
                            type: 'copilot',
                            agent: {
                                key: 'Agent_imported'
                            }
                        },
                        nodes: [],
                        connections: []
                    } as any,
                    {
                        targetXpertId: 'xpert-2'
                    }
                )
            )
        ).rejects.toThrow('DSL type does not match the current xpert.')
    })

    it('allows keeping the same name when overwriting the current xpert', async () => {
        const { handler, xpertService } = buildHandler({
            repository: {
                findOne: jest.fn().mockResolvedValue({
                    id: 'xpert-3',
                    name: 'Support Expert',
                    slug: 'support-expert',
                    type: 'agent',
                    workspaceId: 'workspace-1',
                    agent: {
                        key: 'Agent_current'
                    }
                })
            }
        })

        await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'Support Expert',
                        type: 'agent',
                        agent: {
                            key: 'Agent_imported'
                        }
                    },
                    nodes: [],
                    connections: []
                } as any,
                {
                    targetXpertId: 'xpert-3'
                }
            )
        )

        expect(xpertService.validateName).not.toHaveBeenCalled()
    })

    it('rejects overwrite when a renamed xpert collides with another name', async () => {
        const { handler, xpertService } = buildHandler({
            validateName: jest.fn().mockResolvedValue(false),
            repository: {
                findOne: jest.fn().mockResolvedValue({
                    id: 'xpert-4',
                    name: 'Support Expert',
                    slug: 'support-expert',
                    type: 'agent',
                    workspaceId: 'workspace-1',
                    agent: {
                        key: 'Agent_current'
                    }
                })
            }
        })

        await expect(
            handler.execute(
                new XpertImportCommand(
                    {
                        team: {
                            name: 'Conflicting Expert',
                            type: 'agent',
                            agent: {
                                key: 'Agent_imported'
                            }
                        },
                        nodes: [],
                        connections: []
                    } as any,
                    {
                        targetXpertId: 'xpert-4'
                    }
                )
            )
        ).rejects.toThrow('Name invalid')

        expect(xpertService.validateName).toHaveBeenCalledWith('Conflicting Expert')
    })

    it('rejects overwrite when the current xpert does not exist', async () => {
        const { handler } = buildHandler({
            repository: {
                findOne: jest.fn().mockResolvedValue(null)
            }
        })

        await expect(
            handler.execute(
                new XpertImportCommand(
                    {
                        team: {
                            name: 'Support Expert',
                            type: 'agent',
                            agent: {
                                key: 'Agent_imported'
                            }
                        },
                        nodes: [],
                        connections: []
                    } as any,
                    {
                        targetXpertId: 'missing'
                    }
                )
            )
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})

jest.mock('./xpert-authoring.service', () => ({
    XpertAuthoringService: class XpertAuthoringService {}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
    AgentMiddlewareStrategy: () => (target: unknown) => target
}))

jest.mock('@langchain/langgraph', () => {
    const actual = jest.requireActual('@langchain/langgraph')
    return {
        ...actual,
        getCurrentTaskInput: jest.fn()
    }
})

import { Command } from '@langchain/langgraph'
import { AiModelTypeEnum } from '@metad/contracts'
import { XpertAuthoringMiddleware } from './xpert-authoring.middleware'
import { AssistantDraftConflictError, AssistantDraftMutationResult, AuthoringToolName } from './xpert-authoring.types'

describe('XpertAuthoringMiddleware', () => {
    let service: {
        getCurrentXpertFromContext: jest.Mock
        getAvailableAgentMiddlewaresFromContext: jest.Mock
        getAvailableCopilotModelsFromContext: jest.Mock
        getAvailableToolsetsFromContext: jest.Mock
        getAvailableKnowledgebasesFromContext: jest.Mock
        getAvailableSkillsFromContext: jest.Mock
        newXpertFromContext: jest.Mock
        editXpertFromContext: jest.Mock
    }
    let strategy: XpertAuthoringMiddleware
    let middleware: Awaited<ReturnType<XpertAuthoringMiddleware['createMiddleware']>>

    beforeEach(async () => {
        service = {
            getCurrentXpertFromContext: jest.fn(),
            getAvailableAgentMiddlewaresFromContext: jest.fn(),
            getAvailableCopilotModelsFromContext: jest.fn(),
            getAvailableToolsetsFromContext: jest.fn(),
            getAvailableKnowledgebasesFromContext: jest.fn(),
            getAvailableSkillsFromContext: jest.fn(),
            newXpertFromContext: jest.fn(),
            editXpertFromContext: jest.fn()
        }
        strategy = new XpertAuthoringMiddleware(service as any)
        middleware = await Promise.resolve(strategy.createMiddleware({}, {} as any))
    })

    const getTool = (name: string) => middleware.tools.find((tool) => tool.name === name)!

    it('exposes authoring and context catalog tools with empty schemas', () => {
        expect(middleware.tools.map((tool) => tool.name)).toEqual([
            'getCurrentXpert',
            'getAvailableAgentMiddlewares',
            'getAvailableCopilotModels',
            'getAvailableToolsets',
            'getAvailableKnowledgebases',
            'getAvailableSkills',
            'newXpert',
            'editXpert'
        ])

        for (const toolName of [
            'getCurrentXpert',
            'getAvailableAgentMiddlewares',
            'getAvailableCopilotModels',
            'getAvailableToolsets',
            'getAvailableKnowledgebases',
            'getAvailableSkills'
        ]) {
            expect((getTool(toolName) as any).schema.safeParse({}).success).toBe(true)
        }

        expect(
            (middleware as any).stateSchema.safeParse({
                xpertId: 'xpert-1',
                baseDraftHash: 'hash-1',
                copilotModelCatalogTargetXpertId: 'xpert-1',
                copilotModelCatalogCurrentCopilotId: 'copilot-1',
                copilotModelCatalogCurrentProvider: 'openai',
                copilotModelCatalogCurrentModelId: 'gpt-4o',
                copilotModelCatalogAvailableModelIds: ['gpt-4o', 'gpt-4.1'],
                copilotModelCatalogItems: [
                    {
                        copilotId: 'copilot-1',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4o',
                        label: 'GPT-4o',
                        isCurrentProvider: true,
                        isCurrentModel: true
                    }
                ]
            }).success
        ).toBe(true)
    })

    it('returns a rejected current Xpert payload when targetXpertId is missing', async () => {
        service.getCurrentXpertFromContext.mockResolvedValue({
            xpertId: null,
            dslYaml: null,
            summary: 'Missing xpertId for current Xpert DSL export.'
        })

        const result = await middleware.tools[0].invoke({}, {
            configurable: {
                context: {}
            }
        } as any)

        expect(service.getCurrentXpertFromContext).toHaveBeenCalledWith({})
        expect(result).toEqual({
            xpertId: null,
            dslYaml: null,
            summary: 'Missing xpertId for current Xpert DSL export.'
        })
    })

    it('prefers explicit context xpertId over middleware state', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({
            xpertId: 'xpert-from-state'
        })
        service.getCurrentXpertFromContext.mockResolvedValue({
            xpertId: 'xpert-from-context',
            dslYaml: 'team:\n  name: State Expert',
            summary: 'Loaded current xpert.'
        })

        await getTool('getCurrentXpert').invoke({}, {
            configurable: {
                context: {
                    targetXpertId: 'xpert-from-context',
                    env: {
                        xpertId: 'xpert-from-env'
                    }
                }
            }
        } as any)

        expect(service.getCurrentXpertFromContext).toHaveBeenCalledWith({
            targetXpertId: 'xpert-from-context',
            env: {
                xpertId: 'xpert-from-env'
            }
        })
    })

    it('stores latest baseDraftHash into middleware state after getCurrentXpert succeeds inside graph execution', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({
            xpertId: 'xpert-from-state',
            baseDraftHash: 'hash-old'
        })
        service.getCurrentXpertFromContext.mockResolvedValue({
            xpertId: 'xpert-from-state',
            dslYaml: 'team:\n  name: Updated Expert',
            summary: 'Loaded current xpert.',
            committedDraftHash: 'hash-new'
        })

        const result = await getTool('getCurrentXpert').invoke({}, {
            metadata: {
                tool_call_id: 'tool-call-get-1'
            },
            configurable: {
                context: {
                    targetXpertId: 'xpert-from-state'
                }
            }
        } as any)

        expect(result).toBeInstanceOf(Command)
        expect((result as Command).update).toEqual({
            xpertId: 'xpert-from-state',
            baseDraftHash: 'hash-new',
            messages: [
                expect.objectContaining({
                    name: 'getCurrentXpert',
                    tool_call_id: 'tool-call-get-1'
                })
            ]
        })
    })

    it('prefers middleware state baseDraftHash over explicit context hash', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({
            baseDraftHash: 'hash-from-state'
        })
        service.editXpertFromContext.mockResolvedValue(buildAppliedResult('editXpert'))

        await getTool('editXpert').invoke(
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            {
                configurable: {
                    context: {
                        targetXpertId: 'xpert-2',
                        baseDraftHash: 'hash-from-context'
                    }
                }
            } as any
        )

        expect(service.editXpertFromContext).toHaveBeenCalledWith(
            expect.objectContaining({
                targetXpertId: 'xpert-2',
                baseDraftHash: 'hash-from-state'
            }),
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            null
        )
    })

    it('falls back to middleware state when context omits xpertId and baseDraftHash', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({
            xpertId: 'xpert-from-state',
            baseDraftHash: 'hash-from-state'
        })
        service.editXpertFromContext.mockResolvedValue(buildAppliedResult('editXpert'))

        await getTool('editXpert').invoke(
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            {
                configurable: {
                    context: {
                        env: {
                            xpertId: 'xpert-from-env'
                        }
                    }
                }
            } as any
        )

        expect(service.editXpertFromContext).toHaveBeenCalledWith(
            expect.objectContaining({
                targetXpertId: 'xpert-from-state',
                baseDraftHash: 'hash-from-state'
            }),
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            null
        )
    })

    it('returns available middleware catalog context', async () => {
        service.getAvailableAgentMiddlewaresFromContext.mockResolvedValue({
            status: 'available',
            summary: 'Found 1 agent middlewares available to the assistant.',
            total: 1,
            workspaceId: 'workspace-1',
            items: [
                {
                    name: 'XpertAuthoringMiddleware'
                }
            ]
        })

        const result = await getTool('getAvailableAgentMiddlewares').invoke({}, {
            configurable: {
                context: {
                    env: {
                        workspaceId: 'workspace-1'
                    }
                }
            }
        } as any)

        expect(service.getAvailableAgentMiddlewaresFromContext).toHaveBeenCalledWith({
            env: {
                workspaceId: 'workspace-1'
            }
        })
        expect(result).toEqual(
            expect.objectContaining({
                status: 'available',
                total: 1
            })
        )
    })

    it('passes missing workspace context through to workspace catalog tools', async () => {
        service.getAvailableToolsetsFromContext.mockResolvedValue({
            status: 'rejected',
            summary: 'Missing workspaceId in request context.',
            total: 0,
            workspaceId: null,
            items: []
        })

        const result = await getTool('getAvailableToolsets').invoke({}, {
            configurable: {
                context: {}
            }
        } as any)

        expect(service.getAvailableToolsetsFromContext).toHaveBeenCalledWith({})
        expect(result).toEqual({
            status: 'rejected',
            summary: 'Missing workspaceId in request context.',
            total: 0,
            workspaceId: null,
            items: []
        })
    })

    it('returns available copilot model catalog context', async () => {
        service.getAvailableCopilotModelsFromContext.mockResolvedValue({
            status: 'available',
            summary: "Found 2 available LLM models for provider 'openai'. Current model is 'gpt-4o'.",
            total: 2,
            workspaceId: 'workspace-1',
            currentCopilotId: 'copilot-1',
            currentProvider: 'openai',
            currentModelId: 'gpt-4o',
            items: [
                {
                    copilotId: 'copilot-1',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4o',
                    label: 'GPT-4o',
                    isCurrentProvider: true,
                    isCurrentModel: true
                }
            ]
        })

        const result = await getTool('getAvailableCopilotModels').invoke({}, {
            configurable: {
                context: {
                    targetXpertId: 'xpert-1',
                    env: {
                        workspaceId: 'workspace-1'
                    }
                }
            }
        } as any)

        expect(service.getAvailableCopilotModelsFromContext).toHaveBeenCalledWith({
            targetXpertId: 'xpert-1',
            env: {
                workspaceId: 'workspace-1'
            }
        })
        expect(result).toEqual(
            expect.objectContaining({
                status: 'available',
                total: 2,
                currentProvider: 'openai',
                currentModelId: 'gpt-4o'
            })
        )
    })

    it('stores copilot model catalog into middleware state after getAvailableCopilotModels succeeds inside graph execution', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({
            xpertId: 'xpert-1',
            baseDraftHash: 'hash-1'
        })
        service.getAvailableCopilotModelsFromContext.mockResolvedValue({
            status: 'available',
            summary: "Found 2 available LLM models for provider 'openai'. Current model is 'gpt-4o'.",
            total: 2,
            workspaceId: 'workspace-1',
            currentCopilotId: 'copilot-1',
            currentProvider: 'openai',
            currentModelId: 'gpt-4o',
            items: [
                {
                    copilotId: 'copilot-1',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4o',
                    label: 'GPT-4o',
                    isCurrentProvider: true,
                    isCurrentModel: true
                },
                {
                    copilotId: 'copilot-1',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4.1',
                    label: 'GPT-4.1',
                    isCurrentProvider: true,
                    isCurrentModel: false
                }
            ]
        })

        const result = await getTool('getAvailableCopilotModels').invoke({}, {
            metadata: {
                tool_call_id: 'tool-call-models-1'
            },
            configurable: {
                context: {
                    targetXpertId: 'xpert-1',
                    env: {
                        workspaceId: 'workspace-1'
                    }
                }
            }
        } as any)

        expect(result).toBeInstanceOf(Command)
        expect((result as Command).update).toEqual({
            copilotModelCatalogTargetXpertId: 'xpert-1',
            copilotModelCatalogCurrentCopilotId: 'copilot-1',
            copilotModelCatalogCurrentProvider: 'openai',
            copilotModelCatalogCurrentModelId: 'gpt-4o',
            copilotModelCatalogAvailableModelIds: ['gpt-4o', 'gpt-4.1'],
            copilotModelCatalogItems: [
                {
                    copilotId: 'copilot-1',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4o',
                    label: 'GPT-4o',
                    isCurrentProvider: true,
                    isCurrentModel: true
                },
                {
                    copilotId: 'copilot-1',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4.1',
                    label: 'GPT-4.1',
                    isCurrentProvider: true,
                    isCurrentModel: false
                }
            ],
            messages: [
                expect.objectContaining({
                    name: 'getAvailableCopilotModels',
                    tool_call_id: 'tool-call-models-1'
                })
            ]
        })
    })

    it('emits navigate_to_studio after newXpert succeeds', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({})
        service.newXpertFromContext.mockResolvedValue(
            buildAppliedResult('newXpert', {
                team: {
                    id: 'xpert-1'
                }
            })
        )

        const subscriber = {
            next: jest.fn()
        }

        await getTool('newXpert').invoke(
            {
                userIntent: 'Create a support expert'
            },
            {
                configurable: {
                    context: {
                        workspaceId: 'assistant-workspace',
                        env: {
                            workspaceId: 'workspace-1',
                            region: 'cn'
                        }
                    },
                    subscriber,
                    tool_call_id: 'tool-call-1',
                    executionId: 'execution-1',
                    agentKey: 'Agent_1'
                }
            } as any
        )

        expect(service.newXpertFromContext).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: 'assistant-workspace',
                env: {
                    workspaceId: 'workspace-1',
                    region: 'cn'
                }
            }),
            {
                userIntent: 'Create a support expert'
            }
        )
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        name: 'navigate_to_studio',
                        args: {
                            xpertId: 'xpert-1'
                        }
                    })
                })
            })
        )
    })

    it('stores xpertId into middleware state after newXpert succeeds inside graph execution', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({})
        service.newXpertFromContext.mockResolvedValue(
            buildAppliedResult('newXpert', {
                team: {
                    id: 'xpert-graph-1'
                }
            })
        )

        const result = await getTool('newXpert').invoke(
            {
                userIntent: 'Create a support expert'
            },
            {
                metadata: {
                    tool_call_id: 'tool-call-graph-1'
                },
                configurable: {
                    context: {
                        env: {
                            workspaceId: 'workspace-1'
                        }
                    }
                }
            } as any
        )

        expect(result).toBeInstanceOf(Command)
        expect((result as Command).update).toEqual({
            xpertId: 'xpert-graph-1',
            baseDraftHash: 'hash-1',
            messages: [
                expect.objectContaining({
                    name: 'newXpert',
                    tool_call_id: 'tool-call-graph-1'
                })
            ]
        })
    })

    it('stores latest baseDraftHash into middleware state after editXpert succeeds inside graph execution', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({
            xpertId: 'xpert-graph-2',
            baseDraftHash: 'hash-old',
            copilotModelCatalogTargetXpertId: 'xpert-graph-2',
            copilotModelCatalogCurrentCopilotId: 'copilot-1',
            copilotModelCatalogCurrentProvider: 'openai',
            copilotModelCatalogCurrentModelId: 'gpt-4o',
            copilotModelCatalogAvailableModelIds: ['gpt-4o'],
            copilotModelCatalogItems: [
                {
                    copilotId: 'copilot-1',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4o',
                    label: 'GPT-4o',
                    isCurrentProvider: true,
                    isCurrentModel: true
                }
            ]
        })
        service.editXpertFromContext.mockResolvedValue(buildAppliedResult('editXpert'))

        const result = await getTool('editXpert').invoke(
            {
                dslYaml: 'team:\n  name: Updated Expert'
            },
            {
                metadata: {
                    tool_call_id: 'tool-call-edit-1'
                },
                configurable: {
                    context: {
                        targetXpertId: 'xpert-graph-2'
                    }
                }
            } as any
        )

        expect(result).toBeInstanceOf(Command)
        expect((result as Command).update).toEqual({
            baseDraftHash: 'hash-1',
            copilotModelCatalogTargetXpertId: null,
            copilotModelCatalogCurrentCopilotId: null,
            copilotModelCatalogCurrentProvider: null,
            copilotModelCatalogCurrentModelId: null,
            copilotModelCatalogAvailableModelIds: null,
            copilotModelCatalogItems: null,
            messages: [
                expect.objectContaining({
                    name: 'editXpert',
                    tool_call_id: 'tool-call-edit-1'
                })
            ]
        })
    })

    it('emits refresh_studio after editXpert succeeds', async () => {
        service.editXpertFromContext.mockResolvedValue(buildAppliedResult('editXpert'))

        const subscriber = {
            next: jest.fn()
        }

        await getTool('editXpert').invoke(
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            {
                configurable: {
                    context: {
                        targetXpertId: 'xpert-2',
                        baseDraftHash: 'hash-1'
                    },
                    subscriber,
                    tool_call_id: 'tool-call-2',
                    executionId: 'execution-2',
                    agentKey: 'Agent_2'
                }
            } as any
        )

        expect(service.editXpertFromContext).toHaveBeenCalledWith(
            expect.objectContaining({
                targetXpertId: 'xpert-2',
                baseDraftHash: 'hash-1'
            }),
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            null
        )
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        name: 'refresh_studio',
                        args: {
                            xpertId: 'xpert-2'
                        }
                    })
                })
            })
        )
    })

    it('rethrows editXpert conflict errors without emitting refresh_studio', async () => {
        service.editXpertFromContext.mockRejectedValue(
            new AssistantDraftConflictError(
                'editXpert',
                'stale-server',
                'Studio draft changed on the server. Refresh before trying again.',
                true,
                'hash-server'
            )
        )

        const subscriber = {
            next: jest.fn()
        }

        await expect(
            getTool('editXpert').invoke(
                {
                    dslYaml: 'team:\n  name: Support Expert'
                },
                {
                    configurable: {
                        context: {
                            targetXpertId: 'xpert-2',
                            baseDraftHash: 'hash-1'
                        },
                        subscriber
                    }
                } as any
            )
        ).rejects.toMatchObject({
            name: 'AssistantDraftConflictError',
            toolName: 'editXpert',
            conflictType: 'stale-server'
        } satisfies Partial<AssistantDraftConflictError>)

        expect(subscriber.next).not.toHaveBeenCalled()
    })

    it('does not emit refresh_studio when editXpert is rejected', async () => {
        service.editXpertFromContext.mockResolvedValue({
            ...buildAppliedResult('editXpert'),
            status: 'rejected',
            requiresRefresh: false,
            syncMode: 'none',
            updatedDraftFragment: null
        })

        const subscriber = {
            next: jest.fn()
        }

        const result = await getTool('editXpert').invoke(
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            {
                configurable: {
                    context: {
                        targetXpertId: 'xpert-2',
                        baseDraftHash: 'hash-1'
                    },
                    subscriber
                }
            } as any
        )

        expect(result).toMatchObject({
            status: 'rejected',
            toolName: 'editXpert'
        })
        expect(subscriber.next).not.toHaveBeenCalled()
    })

    it('passes copilot model catalog snapshot to editXpert when it exists for the current xpert', async () => {
        jest.spyOn(strategy as any, 'readState').mockReturnValue({
            xpertId: 'xpert-2',
            baseDraftHash: 'hash-1',
            copilotModelCatalogTargetXpertId: 'xpert-2',
            copilotModelCatalogCurrentCopilotId: 'copilot-1',
            copilotModelCatalogCurrentProvider: 'openai',
            copilotModelCatalogCurrentModelId: 'gpt-4o',
            copilotModelCatalogAvailableModelIds: ['gpt-4o', 'gpt-4.1'],
            copilotModelCatalogItems: [
                {
                    copilotId: 'copilot-1',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4o',
                    label: 'GPT-4o',
                    isCurrentProvider: true,
                    isCurrentModel: true
                },
                {
                    copilotId: 'copilot-1',
                    provider: 'openai',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'gpt-4.1',
                    label: 'GPT-4.1',
                    isCurrentProvider: true,
                    isCurrentModel: false
                }
            ]
        })
        service.editXpertFromContext.mockResolvedValue(buildAppliedResult('editXpert'))

        await getTool('editXpert').invoke(
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            {
                configurable: {
                    context: {
                        targetXpertId: 'xpert-2'
                    }
                }
            } as any
        )

        expect(service.editXpertFromContext).toHaveBeenCalledWith(
            expect.objectContaining({
                targetXpertId: 'xpert-2',
                baseDraftHash: 'hash-1'
            }),
            {
                dslYaml: 'team:\n  name: Support Expert'
            },
            {
                targetXpertId: 'xpert-2',
                currentCopilotId: 'copilot-1',
                currentProvider: 'openai',
                currentModelId: 'gpt-4o',
                availableModelIds: ['gpt-4o', 'gpt-4.1'],
                items: [
                    {
                        copilotId: 'copilot-1',
                        provider: 'openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4o',
                        label: 'GPT-4o',
                        isCurrentProvider: true,
                        isCurrentModel: true
                    },
                    {
                        copilotId: 'copilot-1',
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
    })
})

function buildAppliedResult(
    toolName: AuthoringToolName,
    updatedDraftFragment: Record<string, unknown> | null = null
): AssistantDraftMutationResult {
    return {
        status: 'applied',
        toolName,
        summary: 'Updated draft',
        syncMode: toolName === 'newXpert' ? 'none' : 'refresh',
        conflictType: null,
        requiresRefresh: toolName === 'editXpert',
        committedDraftHash: 'hash-1',
        updatedDraftFragment,
        warnings: []
    }
}

import {
    buildHandler,
    BadRequestException,
    XpertImportCommand,
    CopilotOneByRoleQuery,
    FindCopilotModelsQuery,
    AiModelTypeEnum,
    AiProviderRole,
    WorkflowNodeTypeEnum,
    XpertTypeEnum,
    type XpertDraftDslDTO,
    type IWFNMiddleware
} from './import-handler.test-fixture'

describe('XpertImportHandler model selection', () => {
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
            } as never)
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
            } as never)
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
                role: AiProviderRole.Primary,
                copilotModel: { model: 'glm-5', modelType: AiModelTypeEnum.LLM, options: { temperature: 0.2 } },
                defaultModels: {
                    primary: {
                        copilotId: 'copilot-primary',
                        model: 'glm-5',
                        modelType: AiModelTypeEnum.LLM,
                        options: { temperature: 0.2 }
                    }
                },
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

    it('preserves an authorized existing model when no Primary default exists', async () => {
        const { handler, xpertService, queryBus } = buildHandler()
        const selection = {
            copilotId: 'tenant-secondary',
            model: 'eligible',
            modelType: AiModelTypeEnum.LLM,
            options: { temperature: 0.4 }
        }
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof FindCopilotModelsQuery)
                return [
                    {
                        id: selection.copilotId,
                        providerWithModels: { models: [{ model: selection.model, model_type: 'llm' }] }
                    }
                ]
            throw new Error('A role lookup must not be necessary for an authorized binding')
        })
        await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'Managed Expert',
                        type: XpertTypeEnum.Agent,
                        agent: { key: 'Agent_imported' },
                        copilotModel: selection
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_imported',
                            position: { x: 0, y: 0 },
                            entity: { key: 'Agent_imported' }
                        }
                    ],
                    connections: []
                },
                { normalizeCopilotModels: true }
            )
        )
        expect(xpertService.create).toHaveBeenCalledWith(expect.objectContaining({ copilotModel: selection }))
    })

    it('does not promote a configured Primary model excluded from the governed catalog', async () => {
        const { handler, xpertService, queryBus } = buildHandler()
        queryBus.execute.mockResolvedValue([
            {
                id: 'primary',
                role: AiProviderRole.Primary,
                copilotModel: { model: 'denied', modelType: AiModelTypeEnum.LLM },
                providerWithModels: { models: [{ model: 'eligible', model_type: 'llm' }] }
            }
        ])
        await expect(
            handler.execute(
                new XpertImportCommand(
                    {
                        team: { name: 'Managed Expert', type: XpertTypeEnum.Agent, agent: { key: 'Agent_imported' } },
                        nodes: [],
                        connections: []
                    },
                    { normalizeCopilotModels: true }
                )
            )
        ).rejects.toThrow('Choose an authorized language model')
        expect(xpertService.create).not.toHaveBeenCalled()
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
                role: AiProviderRole.Primary,
                copilotModel: { model: 'glm-5', modelType: AiModelTypeEnum.LLM, options: { temperature: 0.2 } },
                defaultModels: {
                    primary: {
                        copilotId: 'copilot-primary',
                        model: 'glm-5',
                        modelType: AiModelTypeEnum.LLM,
                        options: { temperature: 0.2 }
                    }
                },
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

    it('managed import requests model selection when neither an eligible binding nor default exists', async () => {
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
        ).rejects.toThrow('Choose an authorized language model for this import, or configure an authorized default.')
    })
})

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

describe('XpertImportHandler', () => {
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
            } as never)
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Imported Expert',
                workspaceDataScope: 'shared'
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

    it('recovers a reserved import after a seed write failure without creating a second Assistant', async () => {
        const { handler, xpertService } = buildHandler()
        const reserved = 'reserved-assistant'
        const source = { templateId: 'template', templateKey: 'template' }
        const created = {
            id: reserved,
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'user-1',
            workspaceId: 'workspace-1',
            name: 'Imported Expert',
            slug: 'imported-expert',
            agent: { id: 'agent-new', key: 'Agent_new', name: 'Imported Expert' },
            options: { templateSource: source }
        }
        xpertService.repository.findOne.mockResolvedValueOnce(null).mockResolvedValue(created)
        xpertService.create.mockResolvedValue(created)
        xpertService.createBulkMemories.mockRejectedValueOnce(new Error('seed interrupted'))
        const draft: Partial<XpertDraftDslDTO> = {
            team: {
                name: 'Imported Expert',
                type: XpertTypeEnum.Agent,
                workspaceId: 'workspace-1',
                agent: { key: 'primary' }
            },
            nodes: [
                {
                    key: 'primary',
                    type: 'agent',
                    position: { x: 0, y: 0 },
                    entity: { key: 'primary', name: 'Imported Expert' }
                }
            ],
            connections: [],
            memories: [{ prefix: 'memory:qa', value: { question: 'q', answer: 'a' } }]
        }
        const command = () =>
            new XpertImportCommand(structuredClone(draft), { newXpertId: reserved, templateSource: source })
        await expect(handler.execute(command())).rejects.toThrow('seed interrupted')
        expect((await handler.execute(command())).id).toBe(reserved)
        expect(xpertService.create).toHaveBeenCalledTimes(1)
        expect(xpertService.create).toHaveBeenCalledWith(expect.objectContaining({ id: reserved }))
        expect(xpertService.createBulkMemories).toHaveBeenNthCalledWith(
            1,
            reserved,
            { type: 'qa', memories: [{ question: 'q', answer: 'a' }] },
            [`template-seed-${reserved}-0`]
        )
        expect(xpertService.createBulkMemories).toHaveBeenNthCalledWith(
            2,
            reserved,
            { type: 'qa', memories: [{ question: 'q', answer: 'a' }] },
            [`template-seed-${reserved}-0`]
        )
    })

    it('uses only the local creation option to select user-isolated workspace data', async () => {
        const { handler, xpertService } = buildHandler()
        const draft: Partial<XpertDraftDslDTO> = {
            team: {
                name: 'Imported Expert',
                type: XpertTypeEnum.Agent,
                workspaceDataScope: 'shared',
                agent: { key: 'Agent_imported' }
            },
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_imported',
                    position: { x: 0, y: 0 },
                    entity: { key: 'Agent_imported', name: 'Imported Expert' }
                }
            ],
            connections: []
        }

        await handler.execute(new XpertImportCommand(draft, { workspaceDataScope: 'user' }))

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceDataScope: 'user'
            })
        )
    })

    it('records template lineage when creating a xpert from a template', async () => {
        const { handler, xpertService } = buildHandler()

        await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'Imported Expert',
                        title: 'Imported Expert',
                        type: 'agent',
                        agent: { key: 'Agent_imported' },
                        options: {
                            templateSource: {
                                templateId: '@xpert-ai/plugin-example:assistant',
                                templateKey: 'assistant',
                                locale: 'zh-Hans',
                                pluginVersion: '0.1.0',
                                contentHash: 'role-body-1'
                            }
                        }
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_imported',
                            entity: { key: 'Agent_imported', name: 'Imported Expert' }
                        }
                    ],
                    connections: []
                } as never,
                {
                    templateId: '@xpert-ai/plugin-example:assistant',
                    sourceTemplateId: '@xpert-ai/plugin-example:assistant'
                }
            )
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                options: expect.objectContaining({
                    templateSource: expect.objectContaining({
                        templateId: '@xpert-ai/plugin-example:assistant',
                        templateKey: 'assistant',
                        pluginName: '@xpert-ai/plugin-example',
                        locale: 'zh-Hans',
                        pluginVersion: '0.1.0',
                        contentHash: 'role-body-1'
                    })
                })
            })
        )
    })

    it('resolves localized team and agent metadata before persistence', async () => {
        const { handler, xpertService } = buildHandler()

        await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'story-studio-assistant',
                        title: {
                            en_US: 'Story Studio',
                            zh_Hans: '故事工作室'
                        },
                        description: {
                            en_US: 'Review-first story production assistant',
                            zh_Hans: '审核优先的故事制作助手'
                        },
                        type: 'agent',
                        agent: {
                            key: 'Agent_story'
                        }
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_story',
                            entity: {
                                key: 'Agent_story',
                                name: 'story-studio-assistant',
                                title: {
                                    en_US: 'Story Studio Agent',
                                    zh_Hans: '故事工作室智能体'
                                },
                                description: {
                                    en_US: 'Plans story production',
                                    zh_Hans: '规划故事制作'
                                }
                            }
                        },
                        {
                            type: 'xpert',
                            key: 'Xpert_reviewer',
                            entity: {
                                name: 'reviewer',
                                title: {
                                    en_US: 'Reviewer',
                                    zh_Hans: '审核员'
                                },
                                description: {
                                    en_US: 'Reviews production plans',
                                    zh_Hans: '审核制作计划'
                                }
                            }
                        }
                    ],
                    connections: []
                } as unknown as XpertDraftDslDTO,
                {
                    language: 'zh-Hans'
                }
            )
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                title: '故事工作室',
                description: '审核优先的故事制作助手',
                agent: expect.objectContaining({
                    title: '故事工作室智能体',
                    description: '规划故事制作'
                })
            })
        )
        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'new-xpert',
            expect.objectContaining({
                nodes: expect.arrayContaining([
                    expect.objectContaining({
                        type: 'xpert',
                        entity: expect.objectContaining({
                            title: '审核员',
                            description: '审核制作计划'
                        })
                    })
                ])
            })
        )
    })

    it('replaces an unavailable imported sandbox provider with the first available provider', async () => {
        const { handler, xpertService } = buildHandler({
            getSandboxProviders: jest.fn().mockResolvedValue([{ type: 'local-shell-sandbox' }])
        })

        await handler.execute(
            new XpertImportCommand({
                team: {
                    name: 'Imported Expert',
                    title: 'Imported Expert',
                    type: 'agent',
                    features: {
                        sandbox: {
                            enabled: true,
                            provider: 'docker-sandbox'
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
                            name: 'Imported Expert'
                        }
                    }
                ],
                connections: []
            } as unknown as XpertDraftDslDTO)
        )

        expect(xpertService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                features: {
                    sandbox: {
                        enabled: true,
                        provider: 'local-shell-sandbox'
                    }
                }
            })
        )
    })

    it('overwrites the current xpert draft without creating a new xpert', async () => {
        const currentXpert = {
            id: 'xpert-1',
            name: 'Support Expert',
            title: 'Support Expert',
            slug: 'support-expert',
            type: 'agent',
            workspaceId: 'workspace-1',
            workspaceDataScope: 'user',
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
                    workspaceDataScope: 'user',
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
                        workspaceDataScope: 'shared',
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
                } as never,
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
                    workspaceDataScope: 'user',
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

    it('updates the draft and instance template lineage during a template sync import', async () => {
        const currentXpert = {
            id: 'xpert-1',
            name: 'Support Expert',
            slug: 'support-expert',
            type: 'agent',
            workspaceId: 'workspace-1',
            options: {},
            agent: { id: 'agent-1', key: 'Agent_current', name: 'Support Expert' },
            draft: {
                team: {
                    id: 'xpert-1',
                    name: 'Support Expert',
                    workspaceId: 'workspace-1',
                    type: 'agent',
                    agent: { key: 'Agent_current' }
                },
                nodes: [],
                connections: []
            }
        }
        const repository = {
            findOne: jest.fn().mockResolvedValue(currentXpert),
            update: jest.fn().mockResolvedValue(undefined)
        }
        const { handler, xpertService } = buildHandler({ repository })
        const templateSource = {
            templateId: '@xpert-ai/plugin-example:assistant',
            templateKey: 'assistant',
            pluginName: '@xpert-ai/plugin-example',
            source: 'plugin' as const,
            installedAt: '2026-08-01T00:00:00.000Z',
            lastSyncedAt: '2026-08-16T00:00:00.000Z'
        }

        await handler.execute(
            new XpertImportCommand(
                {
                    team: {
                        name: 'Support Expert',
                        title: 'Updated Expert',
                        type: 'agent',
                        agent: { key: 'Agent_imported' }
                    },
                    nodes: [
                        {
                            type: 'agent',
                            key: 'Agent_imported',
                            entity: { key: 'Agent_imported', name: 'Support Expert' }
                        }
                    ],
                    connections: []
                } as never,
                { targetXpertId: 'xpert-1', templateSource }
            )
        )

        expect(xpertService.saveDraft).toHaveBeenCalledWith(
            'xpert-1',
            expect.objectContaining({
                team: expect.objectContaining({
                    options: expect.objectContaining({ templateSource })
                })
            })
        )
        expect(currentXpert.options).toEqual({ templateSource })
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
                    } as never,
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
                } as never,
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
                    } as never,
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
                    } as never,
                    {
                        targetXpertId: 'missing'
                    }
                )
            )
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})

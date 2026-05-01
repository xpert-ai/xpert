import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'

jest.mock('../assistant-binding', () => ({
    AssistantBindingService: class {}
}))
jest.mock('../xpert', () => ({
    PublishedXpertAccessService: class {}
}))
jest.mock('../skill-package', () => ({
    SkillPackageService: class {}
}))

import { AssistantsController } from './assistant.controller'

describe('AssistantsController', () => {
    it('hides required middleware nodes from runtime plugin capabilities', async () => {
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn(async () => ({
                id: 'assistant-1',
                workspaceId: 'workspace-1',
                agent: {
                    key: 'agent-1'
                },
                graph: {
                    nodes: [
                        {
                            key: 'skills-middleware',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'skillsMiddleware',
                                options: {
                                    skills: ['skill-default'],
                                    repositoryDefault: {
                                        repositoryId: 'repo-default',
                                        disabledSkillIds: ['skill-repo-disabled']
                                    }
                                }
                            }
                        },
                        {
                            key: 'required-middleware',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'provider-a',
                                required: true
                            }
                        },
                        {
                            key: 'optional-middleware',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'provider-b',
                                tools: {
                                    visible: true,
                                    hidden: false
                                }
                            }
                        },
                        {
                            key: 'required-sub-agent',
                            type: 'agent',
                            entity: {
                                key: 'required-sub-agent',
                                name: 'required-sub-agent',
                                title: 'Required Sub Agent',
                                description: 'Always available'
                            }
                        },
                        {
                            key: 'optional-sub-agent',
                            type: 'agent',
                            entity: {
                                key: 'optional-sub-agent',
                                name: 'optional-sub-agent',
                                title: 'Optional Sub Agent',
                                description: 'Enabled on demand',
                                avatar: {
                                    emoji: {
                                        id: 'sparkles',
                                        unified: '2728'
                                    }
                                },
                                parameters: [
                                    {
                                        name: 'topic',
                                        type: 'text'
                                    }
                                ]
                            }
                        },
                        {
                            key: 'sub-agent-toolset',
                            type: 'toolset',
                            entity: {
                                id: 'sub-agent-toolset',
                                name: 'Search Tools',
                                tools: [
                                    {
                                        name: 'search',
                                        enabled: true
                                    },
                                    {
                                        name: 'disabled_search',
                                        enabled: false
                                    }
                                ]
                            }
                        },
                        {
                            key: 'optional-xpert',
                            type: 'xpert',
                            entity: {
                                id: 'optional-xpert',
                                slug: 'optional-collaborator',
                                name: 'Optional Collaborator',
                                title: 'Optional Collaborator',
                                description: 'External collaborator',
                                avatar: {
                                    url: 'https://example.com/avatar.png'
                                },
                                agent: {
                                    key: 'collaborator-agent',
                                    parameters: [
                                        {
                                            name: 'brief',
                                            type: 'text'
                                        }
                                    ]
                                },
                                toolsets: [
                                    {
                                        id: 'collaborator-toolset',
                                        name: 'Collaborator Tools',
                                        tools: [
                                            {
                                                name: 'delegate',
                                                enabled: true
                                            }
                                        ]
                                    }
                                ],
                                knowledgebases: [
                                    {
                                        id: 'collaborator-kb',
                                        name: 'Collaborator Knowledge'
                                    }
                                ]
                            }
                        }
                    ],
                    connections: [
                        { type: 'workflow', from: 'agent-1', to: 'skills-middleware' },
                        { type: 'workflow', from: 'agent-1', to: 'required-middleware' },
                        { type: 'workflow', from: 'agent-1', to: 'optional-middleware' },
                        { key: 'agent-1/required-sub-agent', type: 'agent', from: 'agent-1', to: 'required-sub-agent' },
                        {
                            key: 'agent-1/optional-sub-agent',
                            type: 'agent',
                            from: 'agent-1',
                            to: 'optional-sub-agent',
                            required: false
                        },
                        {
                            key: 'optional-sub-agent/sub-agent-toolset',
                            type: 'toolset',
                            from: 'optional-sub-agent',
                            to: 'sub-agent-toolset'
                        },
                        {
                            key: 'agent-1/optional-xpert',
                            type: 'xpert',
                            from: 'agent-1',
                            to: 'optional-xpert',
                            required: false
                        }
                    ]
                }
            }))
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn(async () => false)
        }
        const agentMiddlewareRegistry = {
            get: jest.fn((provider: string) => ({
                meta: {
                    label: {
                        en_US: provider === 'provider-b' ? 'Provider B' : 'Provider A'
                    },
                    description: {
                        en_US: `${provider} description`
                    },
                    icon: {
                        type: 'svg',
                        value: `<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z" /></svg>`,
                        color: '#00d2e6'
                    }
                }
            }))
        }
        const skillPackageService = {
            getAllByWorkspace: jest.fn(async () => ({
                items: [
                    {
                        id: 'skill-default',
                        workspaceId: 'workspace-1',
                        name: 'Default Skill',
                        metadata: {
                            icon: {
                                type: 'svg',
                                value: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg>`,
                                alt: 'Default Skill'
                            }
                        },
                        skillIndex: {
                            name: 'Default Skill',
                            description: 'Loaded by default',
                            repositoryId: 'repo-explicit',
                            repository: {
                                id: 'repo-explicit',
                                name: 'Explicit repo',
                                provider: 'github'
                            }
                        }
                    },
                    {
                        id: 'skill-repo-default',
                        workspaceId: 'workspace-1',
                        name: 'Repository Default Skill',
                        skillIndex: {
                            name: 'Repository Default Skill',
                            description: 'Loaded by repository default',
                            repositoryId: 'repo-default',
                            repository: {
                                id: 'repo-default',
                                name: 'Default repo',
                                provider: 'github'
                            }
                        }
                    },
                    {
                        id: 'skill-repo-disabled',
                        workspaceId: 'workspace-1',
                        name: 'Disabled Repository Skill',
                        skillIndex: {
                            name: 'Disabled Repository Skill',
                            repositoryId: 'repo-default',
                            repository: {
                                id: 'repo-default',
                                name: 'Default repo',
                                provider: 'github'
                            }
                        }
                    }
                ]
            }))
        }

        const controller = new AssistantsController(
            publishedXpertAccessService as any,
            assistantBindingService as any,
            agentMiddlewareRegistry as any,
            skillPackageService as any
        )

        await expect(controller.getRuntimeCapabilities('assistant-1')).resolves.toEqual({
            skills: [
                {
                    id: 'skill-default',
                    workspaceId: 'workspace-1',
                    label: 'Default Skill',
                    description: 'Loaded by default',
                    repositoryName: 'Explicit repo',
                    provider: 'github',
                    meta: {
                        icon: {
                            type: 'svg',
                            value: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg>`,
                            alt: 'Default Skill'
                        }
                    },
                    default: true
                },
                {
                    id: 'skill-repo-default',
                    workspaceId: 'workspace-1',
                    label: 'Repository Default Skill',
                    description: 'Loaded by repository default',
                    repositoryName: 'Default repo',
                    provider: 'github',
                    default: true
                },
                {
                    id: 'skill-repo-disabled',
                    workspaceId: 'workspace-1',
                    label: 'Disabled Repository Skill',
                    description: undefined,
                    repositoryName: 'Default repo',
                    provider: 'github'
                }
            ],
            plugins: [
                {
                    nodeKey: 'optional-middleware',
                    provider: 'provider-b',
                    label: 'Provider B',
                    description: 'provider-b description',
                    meta: {
                        icon: {
                            type: 'svg',
                            value: `<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z" /></svg>`,
                            color: '#00d2e6'
                        }
                    },
                    toolNames: ['visible']
                }
            ],
            subAgents: [
                {
                    nodeKey: 'optional-sub-agent',
                    type: 'agent',
                    label: 'Optional Sub Agent',
                    name: 'optional-sub-agent',
                    description: 'Enabled on demand',
                    avatar: {
                        emoji: {
                            id: 'sparkles',
                            unified: '2728'
                        }
                    },
                    agentKey: 'optional-sub-agent',
                    parameters: [
                        {
                            name: 'topic',
                            type: 'text'
                        }
                    ],
                    toolNames: ['search'],
                    toolsetNames: ['Search Tools'],
                    knowledgebaseNames: []
                },
                {
                    nodeKey: 'optional-xpert',
                    type: 'xpert',
                    label: 'Optional Collaborator',
                    name: 'optional-collaborator',
                    description: 'External collaborator',
                    avatar: {
                        url: 'https://example.com/avatar.png'
                    },
                    agentKey: 'collaborator-agent',
                    xpertId: 'optional-xpert',
                    parameters: [
                        {
                            name: 'brief',
                            type: 'text'
                        }
                    ],
                    toolNames: ['delegate'],
                    toolsetNames: ['Collaborator Tools'],
                    knowledgebaseNames: ['Collaborator Knowledge']
                }
            ]
        })
        expect(agentMiddlewareRegistry.get).toHaveBeenCalledTimes(1)
        expect(agentMiddlewareRegistry.get).toHaveBeenCalledWith('provider-b')
    })
})

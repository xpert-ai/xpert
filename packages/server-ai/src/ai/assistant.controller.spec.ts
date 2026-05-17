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
jest.mock('../prompt-workflow', () => ({
    PromptWorkflowService: class {}
}))

import { AssistantsController } from './assistant.controller'
import { RuntimeCapabilitiesService } from './runtime-capabilities.service'
import { RuntimeCommandService } from './runtime-command.service'

function createController(
    publishedXpertAccessService: unknown,
    assistantBindingService: unknown,
    agentMiddlewareRegistry: unknown,
    skillPackageService: unknown,
    runtimeCommandService: RuntimeCommandService,
    promptWorkflowService: unknown
) {
    const runtimeCapabilitiesService = new RuntimeCapabilitiesService(
        agentMiddlewareRegistry as ConstructorParameters<typeof RuntimeCapabilitiesService>[0],
        skillPackageService as ConstructorParameters<typeof RuntimeCapabilitiesService>[1],
        runtimeCommandService,
        promptWorkflowService as ConstructorParameters<typeof RuntimeCapabilitiesService>[3],
        assistantBindingService as ConstructorParameters<typeof RuntimeCapabilitiesService>[4]
    )

    return new AssistantsController(
        publishedXpertAccessService as ConstructorParameters<typeof AssistantsController>[0],
        assistantBindingService as ConstructorParameters<typeof AssistantsController>[1],
        runtimeCapabilitiesService
    )
}

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
                        {
                            key: 'agent-1/required-sub-agent',
                            type: 'agent',
                            from: 'agent-1',
                            to: 'required-sub-agent',
                            required: true
                        },
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
            isEffectiveSystemAssistantId: jest.fn(async () => false),
            getUserPreferenceByAssistantId: jest.fn(async () => null)
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
                            },
                            commands: [
                                {
                                    name: 'review',
                                    label: 'Review',
                                    description: 'Review the selected context',
                                    action: {
                                        type: 'submit_prompt',
                                        template: 'Review this: {{args}}'
                                    }
                                },
                                {
                                    name: 'Invalid Name',
                                    action: {
                                        type: 'submit_prompt',
                                        template: 'Ignore me'
                                    }
                                },
                                {
                                    name: 'empty',
                                    action: {
                                        type: 'submit_prompt',
                                        template: ''
                                    }
                                }
                            ]
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
        const promptWorkflowService = {
            resolveRuntimeCommandProfile: jest.fn(async () => ({
                hasProfile: false,
                xpertCommands: [],
                workspaceCommands: [],
                preferredSkillEntries: [],
                skillEntries: []
            }))
        }

        const controller = createController(
            publishedXpertAccessService,
            assistantBindingService,
            agentMiddlewareRegistry,
            skillPackageService,
            new RuntimeCommandService(),
            promptWorkflowService
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
            ],
            commands: [
                {
                    name: 'review',
                    label: 'Review',
                    description: 'Review the selected context',
                    icon: {
                        type: 'svg',
                        value: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg>`,
                        alt: 'Default Skill'
                    },
                    category: 'prompt_workflow',
                    argsHint: '<args>',
                    kind: 'prompt_workflow',
                    workflow: {
                        type: 'prompt_workflow',
                        name: 'review',
                        label: 'Review',
                        description: 'Review the selected context'
                    },
                    meta: {
                        icon: {
                            type: 'svg',
                            value: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg>`,
                            alt: 'Default Skill'
                        }
                    },
                    action: {
                        type: 'submit_prompt',
                        template: 'Review this: {{args}}',
                        runtimeCapabilities: {
                            mode: 'allowlist',
                            skills: {
                                workspaceId: 'workspace-1',
                                ids: ['skill-default']
                            },
                            plugins: {
                                nodeKeys: []
                            },
                            subAgents: {
                                nodeKeys: []
                            }
                        }
                    },
                    source: {
                        type: 'skill',
                        skillId: 'skill-default',
                        workspaceId: 'workspace-1',
                        label: 'Default Skill'
                    }
                }
            ]
        })
        expect(agentMiddlewareRegistry.get).toHaveBeenCalledTimes(2)
        expect(agentMiddlewareRegistry.get).toHaveBeenCalledWith('provider-a')
        expect(agentMiddlewareRegistry.get).toHaveBeenCalledWith('provider-b')
    })

    it('loads runtime capabilities from the xpert draft when requested', async () => {
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn(async () => ({
                id: 'assistant-1',
                workspaceId: 'workspace-1',
                name: 'Published Assistant',
                title: 'Published Assistant',
                agent: {
                    key: 'published-agent'
                },
                graph: {
                    nodes: [],
                    connections: []
                },
                draft: {
                    team: {
                        name: 'Draft Assistant',
                        title: 'Draft Assistant',
                        agent: {
                            key: 'draft-agent'
                        }
                    },
                    nodes: [
                        {
                            key: 'draft-skills-middleware',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'skillsMiddleware',
                                options: {
                                    skills: ['draft-skill']
                                }
                            }
                        },
                        {
                            key: 'draft-sub-agent-a',
                            type: 'agent',
                            entity: {
                                key: 'draft-sub-agent-a',
                                name: 'draft-sub-agent-a',
                                title: 'Draft Sub Agent A',
                                description: 'Handles draft sub-agent A.'
                            }
                        },
                        {
                            key: 'draft-sub-agent-b',
                            type: 'agent',
                            entity: {
                                key: 'draft-sub-agent-b',
                                name: 'draft-sub-agent-b',
                                title: 'Draft Sub Agent B',
                                description: 'Handles draft sub-agent B.'
                            }
                        }
                    ],
                    connections: [
                        { type: 'workflow', from: 'draft-agent', to: 'draft-skills-middleware' },
                        { type: 'agent', from: 'draft-agent', to: 'draft-sub-agent-a' },
                        { type: 'agent', from: 'draft-agent', to: 'draft-sub-agent-b' }
                    ]
                }
            }))
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn(async () => false),
            getUserPreferenceByAssistantId: jest.fn(async () => null)
        }
        const skillPackageService = {
            getAllByWorkspace: jest.fn(async () => ({
                items: [
                    {
                        id: 'draft-skill',
                        workspaceId: 'workspace-1',
                        name: 'Draft Skill',
                        skillIndex: {
                            name: 'Draft Skill'
                        }
                    }
                ]
            }))
        }
        const promptWorkflowService = {
            resolveRuntimeCommandProfile: jest.fn(async () => ({
                hasProfile: false,
                xpertCommands: [],
                workspaceCommands: [],
                preferredSkillEntries: [],
                skillEntries: []
            }))
        }
        const controller = createController(
            publishedXpertAccessService,
            assistantBindingService,
            {
                get: jest.fn()
            },
            skillPackageService,
            new RuntimeCommandService(),
            promptWorkflowService
        )

        const result = await controller.getRuntimeCapabilities('assistant-1', 'true')

        expect(result.skills).toEqual([
            {
                id: 'draft-skill',
                workspaceId: 'workspace-1',
                label: 'Draft Skill',
                description: undefined,
                repositoryName: undefined,
                provider: undefined,
                default: true
            }
        ])
        expect(result.subAgents).toEqual([
            {
                nodeKey: 'draft-sub-agent-a',
                type: 'agent',
                label: 'Draft Sub Agent A',
                name: 'draft-sub-agent-a',
                description: 'Handles draft sub-agent A.',
                agentKey: 'draft-sub-agent-a',
                toolNames: [],
                toolsetNames: [],
                knowledgebaseNames: []
            },
            {
                nodeKey: 'draft-sub-agent-b',
                type: 'agent',
                label: 'Draft Sub Agent B',
                name: 'draft-sub-agent-b',
                description: 'Handles draft sub-agent B.',
                agentKey: 'draft-sub-agent-b',
                toolNames: [],
                toolsetNames: [],
                knowledgebaseNames: []
            }
        ])
        expect(skillPackageService.getAllByWorkspace).toHaveBeenCalled()
        expect(skillPackageService.getAllByWorkspace.mock.calls[0].slice(0, 3)).toEqual([
            'workspace-1',
            expect.objectContaining({
                relations: ['skillIndex', 'skillIndex.repository']
            }),
            false
        ])
        expect(promptWorkflowService.resolveRuntimeCommandProfile).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'assistant-1',
                title: 'Draft Assistant',
                agent: expect.objectContaining({
                    key: 'draft-agent'
                })
            })
        )
    })

    it('filters user-disabled skills from runtime capabilities', async () => {
        const runtimeCapabilities = {
            mode: 'allowlist',
            skills: {
                workspaceId: 'workspace-1',
                ids: ['skill-enabled', 'skill-disabled']
            },
            plugins: {
                nodeKeys: []
            },
            subAgents: {
                nodeKeys: []
            }
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn(async () => ({
                id: 'assistant-1',
                workspaceId: 'workspace-1',
                title: 'Assistant 1',
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
                                    skills: ['skill-enabled', 'skill-disabled']
                                }
                            }
                        }
                    ],
                    connections: [{ type: 'workflow', from: 'agent-1', to: 'skills-middleware' }]
                }
            }))
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn(async () => false),
            getUserPreferenceByAssistantId: jest.fn(async () => ({
                toolPreferences: {
                    version: 1,
                    skills: {
                        'workspace-1': {
                            workspaceId: 'workspace-1',
                            disabledSkillIds: ['skill-disabled']
                        }
                    }
                }
            }))
        }
        const skillPackageService = {
            getAllByWorkspace: jest.fn(async () => ({
                items: [
                    {
                        id: 'skill-enabled',
                        workspaceId: 'workspace-1',
                        name: 'Enabled Skill',
                        metadata: {
                            commands: [
                                {
                                    name: 'enabled-command',
                                    action: {
                                        type: 'submit_prompt',
                                        template: 'Use enabled skill'
                                    }
                                }
                            ]
                        },
                        skillIndex: {
                            name: 'Enabled Skill'
                        }
                    },
                    {
                        id: 'skill-disabled',
                        workspaceId: 'workspace-1',
                        name: 'Disabled Skill',
                        metadata: {
                            commands: [
                                {
                                    name: 'disabled-command',
                                    action: {
                                        type: 'submit_prompt',
                                        template: 'Use disabled skill'
                                    }
                                }
                            ]
                        },
                        skillIndex: {
                            name: 'Disabled Skill'
                        }
                    }
                ]
            }))
        }
        const promptWorkflowService = {
            resolveRuntimeCommandProfile: jest.fn(async () => ({
                hasProfile: false,
                xpertCommands: [
                    {
                        name: 'workflow-command',
                        template: 'Workflow command',
                        runtimeCapabilities
                    }
                ],
                workspaceCommands: [],
                preferredSkillEntries: [],
                skillEntries: []
            }))
        }
        const controller = createController(
            publishedXpertAccessService,
            assistantBindingService,
            {
                get: jest.fn()
            },
            skillPackageService,
            new RuntimeCommandService(),
            promptWorkflowService
        )

        const result = await controller.getRuntimeCapabilities('assistant-1')

        expect(result.skills).toEqual([
            {
                id: 'skill-enabled',
                workspaceId: 'workspace-1',
                label: 'Enabled Skill',
                description: undefined,
                repositoryName: undefined,
                provider: undefined,
                default: true
            }
        ])
        expect(result.commands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'workflow-command',
                    action: expect.objectContaining({
                        runtimeCapabilities: expect.objectContaining({
                            skills: {
                                workspaceId: 'workspace-1',
                                ids: ['skill-enabled']
                            }
                        })
                    })
                }),
                expect.objectContaining({
                    name: 'enabled-command'
                })
            ])
        )
        expect(result.commands).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'disabled-command'
                })
            ])
        )
    })

    it('includes slash commands from middleware connected to the current agent', async () => {
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn(async () => ({
                id: 'assistant-1',
                workspaceId: 'workspace-1',
                title: 'Assistant 1',
                agent: {
                    key: 'agent-1'
                },
                graph: {
                    nodes: [
                        {
                            key: 'middleware-ralph',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'ralph-loop'
                            }
                        }
                    ],
                    connections: [{ type: 'workflow', from: 'agent-1', to: 'middleware-ralph' }]
                }
            }))
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn(async () => false),
            getUserPreferenceByAssistantId: jest.fn(async () => null)
        }
        const agentMiddlewareRegistry = {
            get: jest.fn(() => ({
                meta: {
                    label: {
                        en_US: 'Ralph Loop'
                    },
                    slashCommands: [
                        {
                            name: 'goal',
                            label: 'Goal',
                            action: {
                                type: 'insert_invocation',
                                template: 'Goal: {{args}}'
                            }
                        }
                    ]
                }
            }))
        }
        const promptWorkflowService = {
            resolveRuntimeCommandProfile: jest.fn(async () => ({
                hasProfile: false,
                xpertCommands: [],
                workspaceCommands: [],
                preferredSkillEntries: [],
                skillEntries: []
            }))
        }
        const controller = createController(
            publishedXpertAccessService,
            assistantBindingService,
            agentMiddlewareRegistry,
            {
                getAllByWorkspace: jest.fn()
            },
            new RuntimeCommandService(),
            promptWorkflowService
        )

        const result = await controller.getRuntimeCapabilities('assistant-1')

        expect(result.commands).toEqual([
            expect.objectContaining({
                name: 'goal',
                action: {
                    type: 'insert_invocation',
                    template: '/goal ',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: {
                            ids: []
                        },
                        plugins: {
                            nodeKeys: ['middleware-ralph']
                        },
                        subAgents: {
                            nodeKeys: []
                        }
                    }
                },
                source: {
                    type: 'middleware',
                    provider: 'ralph-loop',
                    nodeKey: 'middleware-ralph',
                    label: 'Ralph Loop'
                }
            })
        ])
    })

    it('does not include Ralph goal command when the middleware is not connected', async () => {
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn(async () => ({
                id: 'assistant-1',
                workspaceId: 'workspace-1',
                title: 'Assistant 1',
                agent: {
                    key: 'agent-1'
                },
                graph: {
                    nodes: [],
                    connections: []
                }
            }))
        }
        const assistantBindingService = {
            isEffectiveSystemAssistantId: jest.fn(async () => false),
            getUserPreferenceByAssistantId: jest.fn(async () => null)
        }
        const promptWorkflowService = {
            resolveRuntimeCommandProfile: jest.fn(async () => ({
                hasProfile: false,
                xpertCommands: [],
                workspaceCommands: [],
                preferredSkillEntries: [],
                skillEntries: []
            }))
        }
        const controller = createController(
            publishedXpertAccessService,
            assistantBindingService,
            {
                get: jest.fn()
            },
            {
                getAllByWorkspace: jest.fn()
            },
            new RuntimeCommandService(),
            promptWorkflowService
        )

        const result = await controller.getRuntimeCapabilities('assistant-1')

        expect(result.commands).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'goal'
                })
            ])
        )
    })
})

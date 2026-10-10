import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'

jest.mock('../assistant-binding/assistant-binding.service', () => ({
    AssistantBindingService: class {}
}))
jest.mock('../xpert', () => ({
    PublishedXpertAccessService: class {},
    AssistantModelSelectionService: class {}
}))
jest.mock('../skill-package/skill-package.service', () => ({
    SkillPackageService: class {}
}))
jest.mock('../prompt-workflow/prompt-workflow.service', () => ({
    PromptWorkflowService: class {}
}))

import { GetRuntimeCapabilitiesCommand } from '../xpert/runtime-capabilities/get-runtime-capabilities.command'
import { GetRuntimeCapabilitiesHandler } from '../xpert/runtime-capabilities/get-runtime-capabilities.handler'

import { AssistantsController } from './assistant.controller'
import { RuntimeCapabilitiesService } from '../xpert/runtime-capabilities/runtime-capabilities.service'
import { RuntimeCommandService } from '../xpert/runtime-capabilities/runtime-command.service'

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
        assistantBindingService as ConstructorParameters<typeof RuntimeCapabilitiesService>[4],
        { assertCanUseXpert: jest.fn() } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[5],
        { listSkills: jest.fn() } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[6]
    )

    const handler = new GetRuntimeCapabilitiesHandler(runtimeCapabilitiesService)
    return new AssistantsController(
        publishedXpertAccessService as unknown as ConstructorParameters<typeof AssistantsController>[0],
        {
            execute: (command: GetRuntimeCapabilitiesCommand) => handler.execute(command)
        } as unknown as ConstructorParameters<typeof AssistantsController>[1],
        {
            getModels: jest.fn(),
            setPreference: jest.fn()
        } as unknown as ConstructorParameters<typeof AssistantsController>[2]
    )
}

describe('AssistantsController runtime commands', () => {
    it('includes slash commands from required middleware connected to the current agent', async () => {
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
                                provider: 'ralph-loop',
                                required: true
                            }
                        }
                    ],
                    connections: [{ type: 'workflow', from: 'agent-1', to: 'middleware-ralph' }]
                }
            }))
        }
        const assistantBindingService = {
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
                                type: 'client_action',
                                action: {
                                    type: 'chatkit.conversation_goal.command'
                                }
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
                getAllByWorkspaceForRuntime: jest.fn()
            },
            new RuntimeCommandService(),
            promptWorkflowService
        )

        const result = await controller.getRuntimeCapabilities('assistant-1')

        expect(result.commands).toEqual([
            expect.objectContaining({
                name: 'goal',
                action: {
                    type: 'client_action',
                    action: {
                        type: 'chatkit.conversation_goal.command'
                    },
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

    it('includes optional middleware goal commands for selection-gated ChatKit UI', async () => {
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
                                type: 'client_action',
                                action: {
                                    type: 'chatkit.conversation_goal.command'
                                }
                            }
                        },
                        {
                            name: 'compact',
                            label: 'Compact',
                            action: {
                                type: 'submit_prompt',
                                template: '/compact'
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
                getAllByWorkspaceForRuntime: jest.fn()
            },
            new RuntimeCommandService(),
            promptWorkflowService
        )

        const result = await controller.getRuntimeCapabilities('assistant-1')

        expect(result.plugins).toEqual([
            expect.objectContaining({
                provider: 'ralph-loop',
                nodeKey: 'middleware-ralph'
            })
        ])
        expect(result.commands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'goal',
                    action: expect.objectContaining({
                        type: 'client_action',
                        runtimeCapabilities: expect.objectContaining({
                            plugins: {
                                nodeKeys: ['middleware-ralph']
                            }
                        })
                    })
                }),
                expect.objectContaining({
                    name: 'compact'
                })
            ])
        )
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
                getAllByWorkspaceForRuntime: jest.fn()
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

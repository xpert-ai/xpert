import { WorkflowNodeTypeEnum, type SkillSlashCommand } from '@xpert-ai/contracts'
import { ResolvePromptWorkflowInvocationQuery } from '../../../shared/agent/queries/resolve-prompt-workflow-invocation.query'
import type { RuntimeCommandProfileResolution } from '../../prompt-workflow.service'
import { ResolvePromptWorkflowInvocationHandler } from './resolve-prompt-workflow-invocation.handler'

jest.mock('../../prompt-workflow.service', () => ({
    PromptWorkflowService: class PromptWorkflowService {}
}))

type QueryXpert = ConstructorParameters<typeof ResolvePromptWorkflowInvocationQuery>[0]
type PromptWorkflowServiceDependency = ConstructorParameters<typeof ResolvePromptWorkflowInvocationHandler>[0]
type AgentMiddlewareRegistryDependency = ConstructorParameters<typeof ResolvePromptWorkflowInvocationHandler>[1]
type AgentMiddlewareStrategy = ReturnType<AgentMiddlewareRegistryDependency['get']>

type MiddlewareFixture = {
    key: string
    provider: string
    required?: boolean
}

function createCommandProfile(
    overrides: Partial<RuntimeCommandProfileResolution> = {}
): RuntimeCommandProfileResolution {
    return {
        hasProfile: false,
        xpertCommands: [],
        workspaceCommands: [],
        preferredSkillEntries: [],
        skillEntries: [],
        ...overrides
    }
}

function createPromptWorkflowService(profile: RuntimeCommandProfileResolution = createCommandProfile()) {
    return {
        resolveRuntimeCommandProfile: jest.fn(async () => profile)
    } satisfies Pick<PromptWorkflowServiceDependency, 'resolveRuntimeCommandProfile'>
}

function createAgentMiddlewareRegistry(commands: SkillSlashCommand[], label = 'Ralph Loop') {
    const strategy: AgentMiddlewareStrategy = {
        meta: {
            name: 'ralph-loop',
            label: {
                en_US: label
            },
            slashCommands: commands
        },
        createMiddleware: () => ({
            name: 'ralph-loop'
        })
    }

    return {
        get: jest.fn(() => strategy)
    } satisfies Pick<AgentMiddlewareRegistryDependency, 'get'>
}

function createMissingAgentMiddlewareRegistry() {
    return {
        get: jest.fn(() => {
            throw new Error('not found')
        })
    } satisfies Pick<AgentMiddlewareRegistryDependency, 'get'>
}

function createHandler(
    promptWorkflowService: Pick<PromptWorkflowServiceDependency, 'resolveRuntimeCommandProfile'>,
    agentMiddlewareRegistry: Pick<AgentMiddlewareRegistryDependency, 'get'>
) {
    return new ResolvePromptWorkflowInvocationHandler(
        promptWorkflowService as PromptWorkflowServiceDependency,
        agentMiddlewareRegistry as AgentMiddlewareRegistryDependency
    )
}

function createXpert(middlewares: MiddlewareFixture[]): QueryXpert {
    return {
        id: 'xpert-1',
        workspaceId: 'workspace-1',
        agent: {
            key: 'agent-1'
        },
        graph: {
            nodes: middlewares.map((middleware) => ({
                key: middleware.key,
                type: 'workflow' as const,
                position: {
                    x: 0,
                    y: 0
                },
                entity: {
                    id: middleware.key,
                    key: middleware.key,
                    type: WorkflowNodeTypeEnum.MIDDLEWARE,
                    provider: middleware.provider,
                    ...(middleware.required ? { required: true } : {})
                }
            })),
            connections: middlewares.map((middleware) => ({
                key: `agent-1:${middleware.key}`,
                type: 'workflow' as const,
                from: 'agent-1',
                to: middleware.key
            }))
        }
    }
}

describe('ResolvePromptWorkflowInvocationHandler', () => {
    it('resolves required middleware insert_invocation commands before prompt workflows', async () => {
        const promptWorkflowService = createPromptWorkflowService()
        const agentMiddlewareRegistry = createAgentMiddlewareRegistry([
            {
                name: 'goal',
                label: 'Goal',
                description: 'Run a verifier-first Ralph Loop goal until the objective is complete.',
                kind: 'prompt_workflow',
                workflow: {
                    type: 'prompt_workflow',
                    name: 'goal',
                    label: 'Goal'
                },
                action: {
                    type: 'insert_invocation',
                    template: 'Goal:\n{{args}}\n\nFinish with <promise>DONE</promise>.'
                }
            }
        ])
        const handler = createHandler(promptWorkflowService, agentMiddlewareRegistry)

        const result = await handler.execute(
            new ResolvePromptWorkflowInvocationQuery(
                createXpert([{ key: 'middleware-ralph', provider: 'ralph-loop', required: true }]),
                {
                    input: '/goal migrate the app',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: {
                            workspaceId: 'workspace-1',
                            ids: []
                        },
                        plugins: {
                            nodeKeys: []
                        },
                        subAgents: {
                            nodeKeys: []
                        }
                    }
                }
            )
        )

        expect(result?.input.input).toContain('Goal:\nmigrate the app')
        expect(result?.input.runtimeCapabilities).toEqual({
            mode: 'allowlist',
            skills: {
                workspaceId: 'workspace-1',
                ids: []
            },
            plugins: {
                nodeKeys: ['middleware-ralph']
            },
            subAgents: {
                nodeKeys: []
            }
        })
        expect(result?.input.commandSource).toEqual({
            type: 'slash_command',
            name: 'goal',
            source: 'runtime',
            executionType: 'insert_invocation',
            kind: 'prompt_workflow',
            workflow: {
                type: 'prompt_workflow',
                name: 'goal',
                label: 'Goal',
                description: 'Run a verifier-first Ralph Loop goal until the objective is complete.'
            }
        })
        expect(promptWorkflowService.resolveRuntimeCommandProfile).not.toHaveBeenCalled()
    })

    it('does not resolve the goal command from optional middleware', async () => {
        const promptWorkflowService = createPromptWorkflowService()
        const agentMiddlewareRegistry = createAgentMiddlewareRegistry([
            {
                name: 'goal',
                label: 'Goal',
                action: {
                    type: 'insert_invocation',
                    template: 'Goal:\n{{args}}'
                }
            }
        ])
        const handler = createHandler(promptWorkflowService, agentMiddlewareRegistry)

        const result = await handler.execute(
            new ResolvePromptWorkflowInvocationQuery(
                createXpert([{ key: 'middleware-ralph', provider: 'ralph-loop' }]),
                {
                    input: '/goal migrate the app'
                }
            )
        )

        expect(result).toBeNull()
        expect(promptWorkflowService.resolveRuntimeCommandProfile).toHaveBeenCalled()
    })

    it('resolves the goal command from selected optional middleware', async () => {
        const promptWorkflowService = createPromptWorkflowService()
        const agentMiddlewareRegistry = createAgentMiddlewareRegistry([
            {
                name: 'goal',
                label: 'Goal',
                action: {
                    type: 'insert_invocation',
                    template: 'Goal:\n{{args}}'
                }
            }
        ])
        const handler = createHandler(promptWorkflowService, agentMiddlewareRegistry)

        const result = await handler.execute(
            new ResolvePromptWorkflowInvocationQuery(
                createXpert([{ key: 'middleware-ralph', provider: 'ralph-loop' }]),
                {
                    input: '/goal migrate the app',
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
                }
            )
        )

        expect(result?.input.input).toContain('Goal:\nmigrate the app')
        expect(result?.input.runtimeCapabilities).toEqual({
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
        })
        expect(promptWorkflowService.resolveRuntimeCommandProfile).not.toHaveBeenCalled()
    })

    it('keeps reserved prompt workflow names blocked when no middleware owns the command', async () => {
        const promptWorkflowService = createPromptWorkflowService(
            createCommandProfile({
                xpertCommands: [
                    {
                        sourceType: 'xpert',
                        name: 'goal',
                        template: 'Workspace goal: {{args}}',
                        aliases: [],
                        tags: []
                    }
                ],
                workspaceCommands: []
            })
        )
        const agentMiddlewareRegistry = createMissingAgentMiddlewareRegistry()
        const handler = createHandler(promptWorkflowService, agentMiddlewareRegistry)

        const result = await handler.execute(
            new ResolvePromptWorkflowInvocationQuery(createXpert([]), {
                input: '/goal migrate the app'
            })
        )

        expect(result).toBeNull()
    })

    it('resolves connected middleware submit_prompt commands with their original execution type', async () => {
        const promptWorkflowService = createPromptWorkflowService()
        const agentMiddlewareRegistry = createAgentMiddlewareRegistry(
            [
                {
                    name: 'compact',
                    aliases: ['compress'],
                    label: 'Compress',
                    description: 'Compress this thread context',
                    kind: 'command',
                    action: {
                        type: 'submit_prompt',
                        template: '/compact'
                    }
                }
            ],
            'Context Compression'
        )
        const handler = createHandler(promptWorkflowService, agentMiddlewareRegistry)

        const result = await handler.execute(
            new ResolvePromptWorkflowInvocationQuery(
                createXpert([{ key: 'middleware-compression', provider: 'ContextCompressionMiddleware' }]),
                {
                    input: '/compact',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: {
                            workspaceId: 'workspace-1',
                            ids: []
                        },
                        plugins: {
                            nodeKeys: []
                        },
                        subAgents: {
                            nodeKeys: []
                        }
                    }
                }
            )
        )

        expect(result?.input.input).toBe('/compact')
        expect(result?.input.runtimeCapabilities).toEqual({
            mode: 'allowlist',
            skills: {
                workspaceId: 'workspace-1',
                ids: []
            },
            plugins: {
                nodeKeys: ['middleware-compression']
            },
            subAgents: {
                nodeKeys: []
            }
        })
        expect(result?.input.commandSource).toEqual({
            type: 'slash_command',
            name: 'compact',
            source: 'runtime',
            executionType: 'submit_prompt',
            kind: 'command'
        })
        expect(promptWorkflowService.resolveRuntimeCommandProfile).not.toHaveBeenCalled()
    })
})

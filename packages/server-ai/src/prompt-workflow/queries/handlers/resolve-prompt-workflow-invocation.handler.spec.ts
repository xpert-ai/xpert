import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { ResolvePromptWorkflowInvocationQuery } from '../../../shared/agent/queries/resolve-prompt-workflow-invocation.query'
import { ResolvePromptWorkflowInvocationHandler } from './resolve-prompt-workflow-invocation.handler'

jest.mock('../../prompt-workflow.service', () => ({
    PromptWorkflowService: class PromptWorkflowService {}
}))

describe('ResolvePromptWorkflowInvocationHandler', () => {
    it('resolves connected middleware insert_invocation commands before prompt workflows', async () => {
        const promptWorkflowService = {
            resolveRuntimeCommandProfile: jest.fn()
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
                    ]
                }
            }))
        }
        const handler = new ResolvePromptWorkflowInvocationHandler(
            promptWorkflowService as any,
            agentMiddlewareRegistry as any
        )

        const result = await handler.execute(
            new ResolvePromptWorkflowInvocationQuery(
                {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1',
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
                } as any,
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

    it('keeps reserved prompt workflow names blocked when no middleware owns the command', async () => {
        const promptWorkflowService = {
            resolveRuntimeCommandProfile: jest.fn(async () => ({
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
            }))
        }
        const agentMiddlewareRegistry = {
            get: jest.fn(() => {
                throw new Error('not found')
            })
        }
        const handler = new ResolvePromptWorkflowInvocationHandler(
            promptWorkflowService as any,
            agentMiddlewareRegistry as any
        )

        const result = await handler.execute(
            new ResolvePromptWorkflowInvocationQuery(
                {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1',
                    agent: {
                        key: 'agent-1'
                    },
                    graph: {
                        nodes: [],
                        connections: []
                    }
                } as any,
                {
                    input: '/goal migrate the app'
                }
            )
        )

        expect(result).toBeNull()
    })
})

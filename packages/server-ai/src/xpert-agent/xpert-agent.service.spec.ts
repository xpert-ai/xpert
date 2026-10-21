jest.mock('@xpert-ai/server-core', () => ({
    LOADED_PLUGINS: 'XPERT_LOADED_PLUGINS',
    normalizePluginName: (pluginName: string) => {
        const lastAt = pluginName.lastIndexOf('@')
        return lastAt > 0 ? pluginName.slice(0, lastAt) : pluginName
    },
    TenantOrganizationAwareCrudService: class {
        protected repository

        constructor(repository: unknown) {
            this.repository = repository
        }
    }
}))

jest.mock('../shared', () => ({
    ToolSchemaParser: {
        parseZodToJsonSchema: jest.fn()
    }
}))

jest.mock('../xpert/queries', () => ({
    FindXpertQuery: class FindXpertQuery {
        constructor(
            public readonly conditions: Record<string, unknown>,
            public readonly params: Record<string, unknown>
        ) {}
    }
}))

jest.mock('../xpert/xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../shared/agent/middleware-runtime/index', () => ({
    AgentMiddlewareRuntimeService: class AgentMiddlewareRuntimeService {}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
    AgentMiddlewareRegistry: class AgentMiddlewareRegistry {},
    SandboxWorkspaceMapperStrategy: () => () => undefined,
    RequestContext: {
        currentTenantId: jest.fn().mockReturnValue('tenant-1'),
        currentUserId: jest.fn().mockReturnValue('user-1'),
        getOrganizationId: jest.fn().mockReturnValue('organization-1')
    }
}))

jest.mock('./commands', () => ({
    XpertAgentChatCommand: class XpertAgentChatCommand {
        constructor(
            public readonly state: Record<string, unknown>,
            public readonly agentKey: string,
            public readonly xpert: Record<string, unknown>,
            public readonly options: Record<string, unknown>
        ) {}
    }
}))

jest.mock('./xpert-agent.entity', () => ({
    XpertAgent: class XpertAgent {}
}))

import { of } from 'rxjs'
import { z } from 'zod/v3'
import { tool } from '@langchain/core/tools'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { AgentMiddlewareRegistry, type AgentMiddleware, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { type TXpertGraph, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { getAgentMiddlewares } from '../shared/agent/middleware'
import { FindXpertQuery } from '../xpert/queries'
import { XpertAgentChatCommand } from './commands'
import { XpertAgentService } from './xpert-agent.service'

describe('XpertAgentService', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let agentMiddlewareRuntimeService: {
        api: {
            createModelClient: jest.Mock
            wrapWorkflowNodeExecution: jest.Mock
        }
        createScopedApi: jest.Mock
    }
    let xpertService: { assertCanAuthorById: jest.Mock }
    let service: XpertAgentService

    beforeEach(() => {
        commandBus = {
            execute: jest.fn().mockResolvedValue(of({ data: { ok: true } } as MessageEvent))
        }
        queryBus = {
            execute: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                agent: {
                    key: 'agent-1'
                }
            })
        }
        agentMiddlewareRuntimeService = {
            api: {
                createModelClient: jest.fn(),
                wrapWorkflowNodeExecution: jest.fn()
            },
            createScopedApi: jest.fn().mockReturnValue({ scope: 'bounded-runtime' })
        }
        xpertService = {
            assertCanAuthorById: jest.fn().mockResolvedValue(undefined)
        }

        service = new XpertAgentService(
            {} as any,
            commandBus as any,
            queryBus as any,
            agentMiddlewareRuntimeService as any,
            xpertService as never
        )
        const scheduler = {
            meta: {
                name: 'scheduler',
                label: {
                    en_US: 'Scheduler'
                }
            }
        }
        const connectorRuntime = {
            meta: {
                name: 'ConnectorRuntime:lark',
                label: {
                    en_US: 'Feishu connector runtime'
                },
                builtin: true
            }
        }
        ;(service as any).agentMiddlewareRegistry = {
            list: jest.fn().mockReturnValue([scheduler, connectorRuntime]),
            getSource: jest.fn().mockImplementation((strategy) => {
                return strategy === scheduler
                    ? {
                          kind: 'builtin',
                          scopeKey: 'builtin:global'
                      }
                    : {
                          kind: 'plugin',
                          pluginName: '@xpert/connector',
                          scopeKey: 'org-1'
                      }
            })
        }
    })

    it('maps run requests to a new agent chat command', async () => {
        await service.chatAgent(
            {
                action: 'run',
                agentKey: 'agent-1',
                xpertId: 'xpert-1',
                state: {
                    human: {
                        input: 'Hello'
                    }
                }
            },
            {
                language: 'en-US'
            } as any
        )

        const query = queryBus.execute.mock.calls[0][0] as FindXpertQuery
        expect(query).toBeInstanceOf(FindXpertQuery)
        expect(query.conditions).toEqual({ id: 'xpert-1' })
        expect(query.params).toEqual({ relations: ['agent'], isDraft: true })
        expect(commandBus.execute).toHaveBeenCalledTimes(1)

        const command = commandBus.execute.mock.calls[0][0] as XpertAgentChatCommand
        expect(command).toBeInstanceOf(XpertAgentChatCommand)
        expect(command.state).toEqual({
            human: {
                input: 'Hello'
            }
        })
        expect(command.agentKey).toBe('agent-1')
        expect(command.options.execution).toBeUndefined()
        expect(command.options.resume).toBeUndefined()
    })

    it('maps resume requests to resume an existing execution', async () => {
        await service.chatAgent(
            {
                action: 'resume',
                agentKey: 'agent-1',
                xpertId: 'xpert-1',
                target: {
                    executionId: 'execution-1'
                },
                decision: {
                    type: 'confirm',
                    payload: {
                        approved: true
                    }
                },
                patch: {
                    agentKey: 'agent-2'
                },
                state: {
                    human: {
                        input: 'Continue'
                    }
                }
            },
            {} as any
        )

        const command = commandBus.execute.mock.calls[0][0] as XpertAgentChatCommand
        expect(command.options.execution).toEqual({
            id: 'execution-1',
            category: 'agent'
        })
        expect(command.options.resume).toEqual({
            decision: {
                type: 'confirm',
                payload: {
                    approved: true
                }
            },
            patch: {
                agentKey: 'agent-2'
            }
        })
    })

    it('treats legacy agent payloads as run requests', async () => {
        await service.chatAgent(
            {
                agentKey: 'agent-1',
                xpertId: 'xpert-1',
                executionId: 'execution-1',
                reject: true,
                state: {
                    human: {
                        input: 'Reject this'
                    }
                }
            } as any,
            {} as any
        )

        const command = commandBus.execute.mock.calls[0][0] as XpertAgentChatCommand
        expect(command.options.execution).toBeUndefined()
        expect(command.options.resume).toBeUndefined()
    })

    it('returns user-addable middleware from the middleware registry', () => {
        expect(service.getMiddlewareStrategies()).toEqual([
            {
                meta: {
                    name: 'scheduler',
                    label: {
                        en_US: 'Scheduler'
                    }
                },
                source: {
                    kind: 'builtin'
                }
            }
        ])
    })

    it('returns plugin display metadata from the matching loaded plugin scope', () => {
        const pluginMiddleware = {
            meta: {
                name: 'plugin-middleware',
                label: { en_US: 'Plugin middleware' }
            }
        }
        ;(service as any).loadedPlugins = [
            {
                organizationId: 'org-1',
                scopeKey: 'org-1',
                name: 'plugin',
                packageName: '@xpert/plugin@1.0.0',
                instance: {
                    meta: {
                        displayName: { en_US: 'Xpert Plugin' },
                        icon: { type: 'icon', value: 'ri-plug-line' }
                    }
                }
            }
        ]
        ;(service as any).agentMiddlewareRegistry = {
            list: jest.fn().mockReturnValue([pluginMiddleware]),
            getSource: jest.fn().mockReturnValue({
                kind: 'plugin',
                pluginName: '@xpert/plugin',
                scopeKey: 'org-1'
            })
        }

        expect(service.getMiddlewareStrategies()).toEqual([
            {
                meta: pluginMiddleware.meta,
                source: {
                    kind: 'plugin',
                    pluginName: '@xpert/plugin',
                    displayName: { en_US: 'Xpert Plugin' },
                    icon: { type: 'icon', value: 'ri-plug-line' }
                }
            }
        ])
    })

    it('loads draft features and injects them into middleware tooling requests', async () => {
        const createMiddleware = jest.fn().mockResolvedValue({
            tools: [
                {
                    name: 'sandbox_shell',
                    description: 'Run shell commands',
                    schema: null
                }
            ]
        })
        ;(service as any).agentMiddlewareRegistry = {
            list: jest.fn().mockReturnValue([]),
            get: jest.fn().mockReturnValue({
                createMiddleware
            })
        }
        queryBus.execute.mockResolvedValueOnce({
            id: 'xpert-1',
            workspaceId: 'workspace-1',
            features: {
                sandbox: {
                    enabled: true
                }
            }
        })

        await service.getMiddlewareTools('SandboxShell', {
            xpertId: 'xpert-1',
            options: {}
        })

        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                conditions: {
                    id: 'xpert-1'
                },
                params: {
                    isDraft: true
                }
            })
        )
        expect(createMiddleware).toHaveBeenCalledWith(
            {},
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                userId: 'user-1',
                xpertId: 'xpert-1',
                workspaceId: 'workspace-1',
                xpertFeatures: {
                    sandbox: {
                        enabled: true
                    }
                },
                runtime: { scope: 'bounded-runtime' }
            })
        )
        expect(xpertService.assertCanAuthorById).toHaveBeenCalledWith('xpert-1')
        expect(agentMiddlewareRuntimeService.createScopedApi).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1',
            workspaceId: 'workspace-1',
            xpertId: 'xpert-1',
            catalog: 'xperts',
            scopeId: 'xpert-1',
            isolateByUser: false
        })
    })

    it('loads draft features for middleware tool test requests', async () => {
        const invoke = jest.fn().mockResolvedValue('ok')
        const createMiddleware = jest.fn().mockResolvedValue({
            tools: [
                {
                    name: 'sandbox_shell',
                    invoke
                }
            ]
        })
        ;(service as any).agentMiddlewareRegistry = {
            list: jest.fn().mockReturnValue([]),
            get: jest.fn().mockReturnValue({
                createMiddleware
            })
        }
        queryBus.execute.mockResolvedValueOnce({
            id: 'xpert-1',
            workspaceId: 'workspace-1',
            features: {
                sandbox: {
                    enabled: true
                }
            }
        })

        await service.testMiddlewareTool('SandboxShell', 'sandbox_shell', {
            xpertId: 'xpert-1',
            options: {},
            parameters: {
                command: 'pwd'
            }
        })

        expect(createMiddleware).toHaveBeenCalledWith(
            {},
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                userId: 'user-1',
                xpertId: 'xpert-1',
                workspaceId: 'workspace-1',
                xpertFeatures: {
                    sandbox: {
                        enabled: true
                    }
                },
                runtime: { scope: 'bounded-runtime' }
            })
        )
        expect(invoke).toHaveBeenCalledWith({
            command: 'pwd'
        })
    })

    it('rejects middleware preview for an assistant the caller cannot author', async () => {
        const createMiddleware = jest.fn()
        ;(service as any).agentMiddlewareRegistry = {
            list: jest.fn().mockReturnValue([]),
            get: jest.fn().mockReturnValue({ createMiddleware })
        }
        xpertService.assertCanAuthorById.mockRejectedValueOnce(new Error('forbidden'))

        await expect(
            service.testMiddlewareTool('SandboxShell', 'sandbox_shell', {
                xpertId: 'victim-xpert',
                parameters: {}
            })
        ).rejects.toThrow('forbidden')

        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(createMiddleware).not.toHaveBeenCalled()
        expect(agentMiddlewareRuntimeService.createScopedApi).not.toHaveBeenCalled()
    })

    describe('middleware configuration parity', () => {
        function fixture(configuration: { options?: unknown }) {
            // No schema default: this must exercise the host's normalization, not a forgiving plugin.
            const schema = z
                .object({
                    allowedFinalProviders: z.array(z.string().min(1)).min(1).max(20).optional()
                })
                .strict()
            const discover = jest.fn(async () => 'sources')
            const createMiddleware = jest.fn((options: unknown, context: IAgentMiddlewareContext): AgentMiddleware => {
                expect(context.node.options).toBe(options)
                schema.parse(options)
                return {
                    name: 'ConfigProbe',
                    tools: [tool(discover, { name: 'list_sources', description: 'List sources', schema: z.object({}) })]
                }
            })
            const registry = Object.assign(
                new AgentMiddlewareRegistry(new DiscoveryService(new ModulesContainer()), new Reflector()),
                {
                    get: jest.fn(() => ({ createMiddleware }))
                }
            )
            Object.defineProperty(service, 'agentMiddlewareRegistry', { value: registry, configurable: true })
            // JSON round-trip models a persisted published graph with no options property.
            const graph: TXpertGraph = JSON.parse(
                JSON.stringify({
                    nodes: [
                        {
                            key: 'middleware-1',
                            type: 'workflow',
                            position: { x: 0, y: 0 },
                            entity: {
                                id: 'middleware-1',
                                key: 'middleware-1',
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'ConfigProbe',
                                required: true,
                                ...configuration
                            }
                        }
                    ],
                    connections: [
                        { key: 'agent-1/middleware-1', from: 'agent-1', to: 'middleware-1', type: 'workflow' }
                    ]
                })
            )
            const bindApps = jest.fn((middleware: AgentMiddleware, context: IAgentMiddlewareContext) => {
                expect(context.node.options).toEqual(configuration.options === undefined ? {} : configuration.options)
                return middleware
            })
            const run = () =>
                getAgentMiddlewares(
                    graph,
                    { id: 'agent-1', key: 'agent-1' },
                    registry,
                    {
                        tenantId: 'tenant-1',
                        userId: 'user-1',
                        xpertId: 'xpert-1',
                        tools: new Map(),
                        runtime: agentMiddlewareRuntimeService.createScopedApi()
                    },
                    {
                        runtimeCapabilities: {
                            mode: 'allowlist',
                            plugins: { nodeKeys: [] },
                            skills: { ids: [] },
                            subAgents: { nodeKeys: [] }
                        }
                    },
                    bindApps
                )
            return { graph, run, createMiddleware, discover, bindApps }
        }

        it.each<{ label: string; configuration: { options?: unknown } }>([
            { label: 'missing options in a published node', configuration: {} },
            { label: 'explicit undefined', configuration: { options: undefined } },
            { label: 'empty options', configuration: { options: {} } },
            {
                label: 'valid provider policy',
                configuration: { options: { allowedFinalProviders: ['workspace_script.query'] } }
            }
        ])('initializes preview, tool testing and runtime with $label', async ({ configuration }) => {
            const f = fixture(configuration)
            const originalGraph = JSON.stringify(f.graph)
            const body = { xpertId: 'xpert-1', ...configuration }
            const preview = await service.getMiddlewareTools('ConfigProbe', body)
            expect(preview.tools.map(({ name }) => name)).toEqual(['list_sources'])
            await expect(service.testMiddlewareTool('ConfigProbe', 'list_sources', body)).resolves.toBe('sources')
            const middlewares = await f.run()
            expect(middlewares).toHaveLength(1)
            await expect(middlewares[0].tools[0].invoke({})).resolves.toBe('sources')
            expect(f.discover).toHaveBeenCalledTimes(2)
            expect(f.createMiddleware).toHaveBeenCalledTimes(3)
            expect(f.bindApps).toHaveBeenCalledTimes(1)
            expect(f.createMiddleware.mock.calls.map(([options]) => options)).toEqual(
                Array(3).fill(configuration.options === undefined ? {} : configuration.options)
            )
            expect(JSON.stringify(f.graph)).toBe(originalGraph)
            if (configuration.options === undefined) expect(f.graph.nodes[0].entity).not.toHaveProperty('options')
        })

        it.each(
            [
                null,
                '',
                false,
                0,
                [],
                { unexpected: true },
                { allowedFinalProviders: null },
                { allowedFinalProviders: 'workspace_script.query' },
                { allowedFinalProviders: [] },
                { allowedFinalProviders: [''] },
                { allowedFinalProviders: [42] },
                { allowedFinalProviders: Array(21).fill('workspace_script.query') }
            ].map((options) => ({ options }))
        )('rejects invalid options consistently without invoking tools: $options', async ({ options }) => {
            const f = fixture({ options })
            const body = { xpertId: 'xpert-1', options }
            await expect(service.getMiddlewareTools('ConfigProbe', body)).rejects.toBeInstanceOf(z.ZodError)
            await expect(service.testMiddlewareTool('ConfigProbe', 'list_sources', body)).rejects.toBeInstanceOf(
                z.ZodError
            )
            await expect(f.run()).rejects.toBeInstanceOf(z.ZodError)
            expect(f.createMiddleware.mock.calls.map(([value]) => value)).toEqual([options, options, options])
            expect(f.discover).not.toHaveBeenCalled()
            expect(f.bindApps).not.toHaveBeenCalled()
        })
    })
})

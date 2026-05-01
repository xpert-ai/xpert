jest.mock('@xpert-ai/contracts', () => {
    const actual = jest.requireActual('@xpert-ai/contracts')
    return {
        ...actual,
        isMiddlewareToolEnabled: (config?: { enabled?: boolean } | boolean) => {
            if (typeof config === 'boolean') {
                return config
            }
            return config?.enabled !== false
        }
    }
})

import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { getAgentMiddlewares } from './middleware'
import { SKILLS_MIDDLEWARE_NAME } from '../../skill-package/types'

describe('getAgentMiddlewares', () => {
    it('filters middleware tools by xpert config and user preference for the matching node', async () => {
        const runtime = {
            createModelClient: jest.fn(),
            wrapWorkflowNodeExecution: jest.fn()
        }
        const createMiddleware = jest.fn(async () => ({
            name: 'provider-a',
            tools: [
                { name: 'shared' },
                { name: 'xpertOff' },
                { name: 'userOff' }
            ]
        }))
        const registry = {
            get: jest.fn(() => ({
                createMiddleware
            }))
        }

        const graph = {
            nodes: [
                {
                    key: 'middleware-1',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'provider-a',
                        tools: {
                            xpertOff: false
                        }
                    }
                },
                {
                    key: 'middleware-2',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'provider-a',
                        tools: {}
                    }
                }
            ],
            connections: [
                {
                    type: 'workflow',
                    from: 'agent-1',
                    to: 'middleware-1'
                },
                {
                    type: 'workflow',
                    from: 'agent-1',
                    to: 'middleware-2'
                }
            ]
        } as any

        const middlewares = await getAgentMiddlewares(
            graph,
            {
                key: 'agent-1',
                options: {}
            } as any,
            registry as any,
            {
                xpertFeatures: {
                    sandbox: {
                        enabled: true
                    }
                },
                runtime
            } as any,
            {
                toolPreferences: {
                    version: 1,
                    middlewares: {
                        'middleware-1': {
                            provider: 'provider-a',
                            disabledTools: ['userOff']
                        }
                    }
                }
            }
        )

        expect(middlewares).toHaveLength(2)
        expect(createMiddleware).toHaveBeenNthCalledWith(
            1,
            undefined,
            expect.objectContaining({
                xpertFeatures: {
                    sandbox: {
                        enabled: true
                    }
                },
                runtime
            })
        )
        expect(middlewares[0].tools.map((tool) => tool.name)).toEqual(['shared'])
        expect(middlewares[1].tools.map((tool) => tool.name)).toEqual(['shared', 'xpertOff', 'userOff'])
    })

    it('filters middleware nodes by runtime plugin allow-list', async () => {
        const createMiddleware = jest.fn(async (_options, context) => ({
            name: context.node.provider,
            tools: []
        }))
        const registry = {
            get: jest.fn((provider: string) => ({
                createMiddleware
            }))
        }
        const graph = {
            nodes: [
                {
                    key: 'middleware-1',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'provider-a'
                    }
                },
                {
                    key: 'middleware-2',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'provider-b'
                    }
                }
            ],
            connections: [
                { type: 'workflow', from: 'agent-1', to: 'middleware-1' },
                { type: 'workflow', from: 'agent-1', to: 'middleware-2' }
            ]
        } as any

        const middlewares = await getAgentMiddlewares(
            graph,
            { key: 'agent-1', options: {} } as any,
            registry as any,
            { runtime: {} } as any,
            {
                runtimeCapabilities: {
                    mode: 'allowlist',
                    skills: { ids: [] },
                    plugins: { nodeKeys: ['middleware-2'] },
                    subAgents: { nodeKeys: [] }
                }
            }
        )

        expect(middlewares.map((middleware) => middleware.name)).toEqual(['provider-b'])
        expect(registry.get).toHaveBeenCalledTimes(1)
        expect(registry.get).toHaveBeenCalledWith('provider-b')
    })

    it('keeps required middleware nodes even when omitted from runtime plugin allow-list', async () => {
        const createMiddleware = jest.fn(async (_options, context) => ({
            name: context.node.provider,
            tools: []
        }))
        const registry = {
            get: jest.fn((provider: string) => ({
                createMiddleware
            }))
        }
        const graph = {
            nodes: [
                {
                    key: 'middleware-1',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'provider-a',
                        required: true
                    }
                },
                {
                    key: 'middleware-2',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'provider-b'
                    }
                }
            ],
            connections: [
                { type: 'workflow', from: 'agent-1', to: 'middleware-1' },
                { type: 'workflow', from: 'agent-1', to: 'middleware-2' }
            ]
        } as any

        const middlewares = await getAgentMiddlewares(
            graph,
            { key: 'agent-1', options: {} } as any,
            registry as any,
            { runtime: {} } as any,
            {
                runtimeCapabilities: {
                    mode: 'allowlist',
                    skills: { ids: [] },
                    plugins: { nodeKeys: [] },
                    subAgents: { nodeKeys: [] }
                }
            }
        )

        expect(middlewares.map((middleware) => middleware.name)).toEqual(['provider-a'])
        expect(registry.get).toHaveBeenCalledTimes(1)
        expect(registry.get).toHaveBeenCalledWith('provider-a')
    })

    it('implicitly keeps SkillsMiddleware when runtime skills are selected', async () => {
        const createMiddleware = jest.fn(async (_options, context) => ({
            name: context.node.provider,
            tools: []
        }))
        const registry = {
            get: jest.fn((provider: string) => ({
                createMiddleware
            }))
        }
        const graph = {
            nodes: [
                {
                    key: 'middleware-1',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'provider-a'
                    }
                },
                {
                    key: 'skills-middleware',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: SKILLS_MIDDLEWARE_NAME
                    }
                }
            ],
            connections: [
                { type: 'workflow', from: 'agent-1', to: 'middleware-1' },
                { type: 'workflow', from: 'agent-1', to: 'skills-middleware' }
            ]
        } as any

        const middlewares = await getAgentMiddlewares(
            graph,
            { key: 'agent-1', options: {} } as any,
            registry as any,
            { runtime: {} } as any,
            {
                runtimeCapabilities: {
                    mode: 'allowlist',
                    skills: { workspaceId: 'workspace-1', ids: ['skill-1'] },
                    plugins: { nodeKeys: [] },
                    subAgents: { nodeKeys: [] }
                }
            }
        )

        expect(middlewares.map((middleware) => middleware.name)).toEqual([SKILLS_MIDDLEWARE_NAME])
        expect(registry.get).toHaveBeenCalledTimes(1)
        expect(registry.get).toHaveBeenCalledWith(SKILLS_MIDDLEWARE_NAME)
    })
})

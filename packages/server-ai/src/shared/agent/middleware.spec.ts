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

describe('getAgentMiddlewares', () => {
    it('filters middleware tools by xpert config and user preference for the matching node', async () => {
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
                }
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
                }
            })
        )
        expect(middlewares[0].tools.map((tool) => tool.name)).toEqual(['shared'])
        expect(middlewares[1].tools.map((tool) => tool.name)).toEqual(['shared', 'xpertOff', 'userOff'])
    })
})

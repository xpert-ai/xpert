jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')
    return {
        ...actual,
        AgentMiddlewareStrategy: () => (target: unknown) => target
    }
})

import { AIMessage, HumanMessage, RemoveMessage, SystemMessage } from '@langchain/core/messages'
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph'
import { channelName, IWFNMiddleware, STATE_VARIABLE_HUMAN, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddleware, AgentMiddlewareRuntimeApi, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { RALPH_LOOP_MIDDLEWARE_NAME, RalphLoopMiddleware } from './ralph-loop.middleware'

function createRuntime(): AgentMiddlewareRuntimeApi {
    return {
        async createModelClient() {
            throw new Error('createModelClient is not used in these tests.')
        },
        async wrapWorkflowNodeExecution(run, params) {
            void params
            return (await run({})).state
        }
    }
}

function createContext(): IAgentMiddlewareContext {
    const node: IWFNMiddleware = {
        id: 'middleware-1',
        key: 'middleware-1',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: RALPH_LOOP_MIDDLEWARE_NAME
    }

    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        agentKey: 'agent-1',
        node,
        tools: new Map(),
        runtime: createRuntime()
    }
}

async function createRalphLoopAgentMiddleware(options: Record<string, unknown> = {}) {
    const strategy = new RalphLoopMiddleware()
    return Promise.resolve(strategy.createMiddleware(options, createContext()))
}

function getAfterModelHook(middleware: AgentMiddleware) {
    const hook = typeof middleware.afterModel === 'function' ? middleware.afterModel : middleware.afterModel?.hook
    if (!hook) {
        throw new Error('Expected middleware to expose afterModel.')
    }

    return hook
}

function getWrapModelCall(middleware: AgentMiddleware) {
    if (!middleware.wrapModelCall) {
        throw new Error('Expected middleware to expose wrapModelCall.')
    }

    return middleware.wrapModelCall
}

describe('RalphLoopMiddleware', () => {
    it('creates Ralph Loop middleware hooks and state schema', async () => {
        const middleware = await createRalphLoopAgentMiddleware()

        expect(middleware.name).toBe(RALPH_LOOP_MIDDLEWARE_NAME)
        expect(middleware.stateSchema).toBeDefined()
        expect(middleware.beforeAgent).toBeDefined()
        expect(middleware.wrapModelCall).toBeDefined()
        expect(middleware.afterModel).toBeDefined()
    })

    it('resets iteration and captures the original task before the agent starts', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const beforeAgent =
            typeof middleware.beforeAgent === 'function' ? middleware.beforeAgent : middleware.beforeAgent?.hook

        const result = await beforeAgent?.(
            {
                messages: [],
                ralphLoopIteration: 8
            } as any,
            {
                state: {
                    [STATE_VARIABLE_HUMAN]: {
                        input: 'ship the feature'
                    }
                }
            } as any
        )

        expect(result).toMatchObject({
            ralphLoopIteration: 0,
            ralphLoopOriginalTaskText: 'ship the feature',
            ralphLoopOriginalHumanContent: 'ship the feature'
        })
    })

    it('appends the completion promise rule in wrapModelCall', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const wrapModelCall = getWrapModelCall(middleware)
        const handler = jest.fn(async (request) => new AIMessage('ok'))

        await wrapModelCall(
            {
                messages: [new HumanMessage('hello')],
                systemMessage: new SystemMessage('You are helpful.'),
                state: {},
                tools: [],
                runtime: {}
            } as any,
            handler
        )

        const request = handler.mock.calls[0][0]
        expect(request.systemMessage.content).toContain('<promise>DONE</promise>')
    })

    it('forces retry-only messages during wrapModelCall when the channel was reset for Ralph Loop', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const wrapModelCall = getWrapModelCall(middleware)
        const retryMessage = new HumanMessage('[RALPH LOOP - ITERATION 1/20]\n\nOriginal task:\nship it')
        const handler = jest.fn(async (request) => new AIMessage('ok'))

        await wrapModelCall(
            {
                messages: [new HumanMessage('stale history'), retryMessage],
                systemMessage: new SystemMessage('System.'),
                state: {
                    [channelName('agent-1')]: {
                        messages: [retryMessage]
                    }
                },
                tools: [],
                runtime: {}
            } as any,
            handler
        )

        const request = handler.mock.calls[0][0]
        expect(request.messages).toEqual([retryMessage])
    })

    it('cleans completion promise from the final answer and stops looping', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const hook = getAfterModelHook(middleware)
        const aiMessage = new AIMessage('All done. <promise>DONE</promise>')

        const result = await hook(
            {
                messages: [new HumanMessage('finish this'), aiMessage],
                ralphLoopIteration: 3,
                ralphLoopOriginalTaskText: 'finish this',
                ralphLoopOriginalHumanContent: 'finish this'
            } as any,
            {} as any
        )

        expect(aiMessage.content).toBe('All done.')
        expect(result).toMatchObject({
            ralphLoopIteration: 0,
            ralphLoopOriginalHumanContent: undefined,
            ralphLoopOriginalTaskText: undefined
        })
        expect((result as any).jumpTo).toBeUndefined()
    })

    it('does not clear messages when the model produced tool calls', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const hook = getAfterModelHook(middleware)
        const aiMessage = new AIMessage({
            content: '',
            tool_calls: [
                {
                    type: 'tool_call',
                    id: 'call-1',
                    name: 'search',
                    args: {}
                }
            ]
        })

        const result = await hook(
            {
                messages: [new HumanMessage('search first'), aiMessage],
                ralphLoopIteration: 0
            } as any,
            {} as any
        )

        expect((result as any).messages).toBeUndefined()
        expect((result as any).jumpTo).toBeUndefined()
    })

    it('clears channel messages and retries from a fresh Ralph Loop prompt when unfinished', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const hook = getAfterModelHook(middleware)

        const result = (await hook(
            {
                messages: [new HumanMessage('build the API'), new AIMessage('I started but did not finish.')],
                ralphLoopIteration: 0,
                ralphLoopOriginalTaskText: 'build the API',
                ralphLoopOriginalHumanContent: 'build the API'
            } as any,
            {} as any
        )) as any

        expect(result?.jumpTo).toBe('model')
        expect(result?.ralphLoopIteration).toBe(1)
        expect(result?.messages?.[0]).toBeInstanceOf(RemoveMessage)
        expect((result?.messages?.[0] as RemoveMessage).id).toBe(REMOVE_ALL_MESSAGES)
        expect(result?.messages?.[1]).toBeInstanceOf(HumanMessage)
        expect((result?.messages?.[1] as HumanMessage).content).toContain('[RALPH LOOP - ITERATION 1/20]')
        expect((result?.messages?.[1] as HumanMessage).content).toContain('Original task:\nbuild the API')
    })

    it('preserves multipart original user content behind the retry prompt', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const hook = getAfterModelHook(middleware)
        const originalContent = [
            {
                type: 'text',
                text: 'describe this image'
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'data:image/png;base64,abc'
                }
            }
        ]

        const result = (await hook(
            {
                messages: [new HumanMessage({ content: originalContent }), new AIMessage('Not done yet.')],
                ralphLoopIteration: 0,
                ralphLoopOriginalHumanContent: originalContent
            } as any,
            {} as any
        )) as any

        const retryMessage = result?.messages?.[1] as HumanMessage
        expect(Array.isArray(retryMessage.content)).toBe(true)
        expect((retryMessage.content as any[])[0]).toMatchObject({
            type: 'text',
            text: expect.stringContaining('[RALPH LOOP - ITERATION 1/20]')
        })
        expect((retryMessage.content as any[])[1]).toEqual(originalContent[0])
        expect((retryMessage.content as any[])[2]).toEqual(originalContent[1])
    })

    it('stops with a notice when max iterations is reached', async () => {
        const middleware = await createRalphLoopAgentMiddleware({ maxIterations: 2 })
        const hook = getAfterModelHook(middleware)
        const aiMessage = new AIMessage('Still not complete.')

        const result = await hook(
            {
                messages: [new HumanMessage('finish this'), aiMessage],
                ralphLoopIteration: 2,
                ralphLoopOriginalTaskText: 'finish this',
                ralphLoopOriginalHumanContent: 'finish this'
            } as any,
            {} as any
        )

        expect(aiMessage.content).toContain('Ralph Loop stopped after reaching 2 automatic retries')
        expect((result as any).messages).toBeUndefined()
        expect((result as any).jumpTo).toBeUndefined()
        expect(result).toMatchObject({
            ralphLoopIteration: 0,
            ralphLoopOriginalHumanContent: undefined,
            ralphLoopOriginalTaskText: undefined
        })
    })
})

import { AIMessage, HumanMessage, RemoveMessage } from '@langchain/core/messages'
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph'
import { ContextCompressionMiddleware } from './context-compression.middleware'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    __esModule: true,
    AgentMiddlewareStrategy: () => (target: unknown) => target,
    getModelContextSize: (input: { options?: Record<string, unknown> } | { profile?: { maxInputTokens?: number } }) => {
        if ('options' in input) {
            return Number(input.options?.context_size) || undefined
        }
        if ('profile' in input) {
            return input.profile?.maxInputTokens
        }
        return undefined
    }
}))

const MANUAL_RESULT_KEY = '__contextCompressionManualCommandResult'

function getBeforeModel(middleware: AgentMiddleware) {
    const hook = typeof middleware.beforeModel === 'function' ? middleware.beforeModel : middleware.beforeModel?.hook
    if (!hook) {
        throw new Error('Expected beforeModel hook')
    }
    return hook
}

function getWrapModelCall(middleware: AgentMiddleware) {
    if (!middleware.wrapModelCall) {
        throw new Error('Expected wrapModelCall hook')
    }
    return middleware.wrapModelCall
}

function createContext(options?: { modelResponse?: string }) {
    const model = {
        invoke: jest.fn(async () => ({
            content: options?.modelResponse ?? '<state_snapshot>Compressed history.</state_snapshot>'
        }))
    }
    const subscriber = {
        next: jest.fn()
    }
    const runtime = {
        createModelClient: jest.fn(async () => model)
    }
    const context = {
        agentKey: 'Agent_1',
        node: {
            key: 'middleware-compression',
            title: 'Context Compression'
        },
        runtime
    }

    return {
        context: context as any,
        model,
        runtime,
        subscriber
    }
}

function createRuntimeConfig(subscriber: { next: jest.Mock }, input = '/compact') {
    return {
        state: {
            human: {
                input
            }
        },
        configurable: {
            copilotModel: {
                options: {
                    context_size: 200_000
                }
            },
            subscriber
        }
    } as any
}

describe('ContextCompressionMiddleware', () => {
    it('exposes compact slash command metadata', () => {
        const strategy = new ContextCompressionMiddleware()

        expect(strategy.meta.slashCommands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'compact',
                    aliases: ['compress'],
                    label: {
                        en_US: 'Compress',
                        zh_Hans: '压缩'
                    },
                    description: {
                        en_US: 'Compress this thread context',
                        zh_Hans: '压缩此线程的上下文'
                    },
                    action: {
                        type: 'submit_prompt',
                        template: '/compact'
                    }
                })
            ])
        )
    })

    it('skips the model and reports no-op when a manual command has no history to compress', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, runtime, subscriber } = createContext()
        const middleware = (await strategy.createMiddleware({}, context)) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const wrapModelCall = getWrapModelCall(middleware)

        const beforeResult = (await beforeModel({ messages: [] } as any, createRuntimeConfig(subscriber))) as any

        expect(runtime.createModelClient).not.toHaveBeenCalled()
        expect(beforeResult?.[MANUAL_RESULT_KEY]).toEqual({
            status: 'skipped',
            message: 'No old context was available to compress, so compression was skipped.'
        })
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({
                            status: 'success',
                            reason: 'no_messages',
                            message: {
                                en_US: 'No messages available to compress.',
                                zh_Hans: '没有可压缩的消息。'
                            }
                        })
                    })
                })
            })
        )

        const handler = jest.fn()
        const response = await wrapModelCall(
            {
                messages: [new HumanMessage('/compact')],
                state: {
                    agent_1_channel: beforeResult
                }
            } as any,
            handler
        )

        expect(handler).not.toHaveBeenCalled()
        expect(response).toBeInstanceOf(AIMessage)
        expect(response.content).toBe('No old context was available to compress, so compression was skipped.')
    })

    it('reports a no-op success when protected user turns leave no old history to compress', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, runtime, subscriber } = createContext()
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                protectedUserTurns: 2,
                preserveFraction: 0.3
            },
            context
        )) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const messages = [
            new HumanMessage('First protected request.'),
            new AIMessage('First protected answer.'),
            new HumanMessage('Second protected request.'),
            new AIMessage('Second protected answer.')
        ]

        const beforeResult = (await beforeModel({ messages } as any, createRuntimeConfig(subscriber))) as any

        expect(runtime.createModelClient).not.toHaveBeenCalled()
        expect(model.invoke).not.toHaveBeenCalled()
        expect(beforeResult?.messages).toBeUndefined()
        expect(beforeResult?.[MANUAL_RESULT_KEY]).toEqual({
            status: 'skipped',
            message: 'No old context was available to compress, so compression was skipped.'
        })

        const successEvent = subscriber.next.mock.calls.find(
            (call) => call[0]?.data?.data?.data?.reason === 'no_unprotected_history'
        )
        expect(successEvent?.[0]?.data?.data?.data).toEqual(
            expect.objectContaining({
                status: 'success',
                reason: 'no_unprotected_history',
                message: {
                    en_US: 'No unprotected history available to compress. Recent user turns were preserved.',
                    zh_Hans: '没有可压缩的旧上下文。最近的用户回合已被保留。'
                }
            })
        )
    })

    it('reports a no-op success when a manual summary would increase context size', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, runtime, subscriber } = createContext({
            modelResponse: 'Generated summary that is longer than the compacted source. '.repeat(80)
        })
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                protectedUserTurns: 1,
                preserveFraction: 0.3
            },
            context
        )) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const wrapModelCall = getWrapModelCall(middleware)
        const messages = [
            new HumanMessage('Old request.'),
            new AIMessage('Old answer.'),
            new HumanMessage('Middle request.'),
            new AIMessage('Middle answer.'),
            new HumanMessage('Recent request to preserve.'),
            new AIMessage('Recent answer to preserve.')
        ]

        const beforeResult = (await beforeModel({ messages } as any, createRuntimeConfig(subscriber))) as any

        expect(runtime.createModelClient).toHaveBeenCalledTimes(1)
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(beforeResult?.messages).toBeUndefined()
        expect(beforeResult?.[MANUAL_RESULT_KEY]).toEqual({
            status: 'skipped',
            message: 'No old context was available to compress, so compression was skipped.'
        })

        const noGainEvent = subscriber.next.mock.calls.find(
            (call) => call[0]?.data?.data?.data?.reason === 'no_token_gain'
        )
        expect(noGainEvent?.[0]?.data?.data?.data).toEqual(
            expect.objectContaining({
                status: 'success',
                reason: 'no_token_gain'
            })
        )
        expect(subscriber.next.mock.calls.some((call) => call[0]?.data?.data?.data?.status === 'fail')).toBe(false)

        const handler = jest.fn()
        const response = await wrapModelCall(
            {
                messages: [...messages, new HumanMessage('/compact')],
                state: {
                    agent_1_channel: beforeResult
                }
            } as any,
            handler
        )

        expect(handler).not.toHaveBeenCalled()
        expect(response).toBeInstanceOf(AIMessage)
        expect(response.content).toBe('No old context was available to compress, so compression was skipped.')
    })

    it('forces compression for manual commands and skips the ordinary model response', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, runtime, subscriber } = createContext()
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                protectedUserTurns: 1,
                preserveFraction: 0.3
            },
            context
        )) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const wrapModelCall = getWrapModelCall(middleware)
        const longText = 'Older context that should be summarized. '.repeat(600)
        const messages = [
            new HumanMessage(longText),
            new AIMessage(longText),
            new HumanMessage(`${longText}More middle context.`),
            new AIMessage(longText),
            new HumanMessage('Recent request to preserve.'),
            new AIMessage('Recent answer to preserve.')
        ]

        const beforeResult = (await beforeModel({ messages } as any, createRuntimeConfig(subscriber))) as any

        expect(runtime.createModelClient).toHaveBeenCalledTimes(1)
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(beforeResult?.[MANUAL_RESULT_KEY]).toEqual({
            status: 'compressed',
            message: 'Context compressed.'
        })
        expect(beforeResult?.messages?.[0]).toBeInstanceOf(RemoveMessage)
        expect(beforeResult.messages[0].id).toBe(REMOVE_ALL_MESSAGES)
        expect(beforeResult.messages[1].additional_kwargs?.compressed).toBe(true)
        const successEvent = subscriber.next.mock.calls.find((call) => call[0]?.data?.data?.data?.status === 'success')
        expect(successEvent?.[0]?.data?.data?.data?.summary).toBe(
            '<state_snapshot>Compressed history.</state_snapshot>'
        )

        const handler = jest.fn()
        const response = await wrapModelCall(
            {
                messages: [...messages, new HumanMessage('/compress')],
                state: {
                    agent_1_channel: beforeResult
                }
            } as any,
            handler
        )

        expect(handler).not.toHaveBeenCalled()
        expect(response).toBeInstanceOf(AIMessage)
        expect(response.content).toBe('Context compressed.')
    })
})

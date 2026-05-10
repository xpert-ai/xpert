/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')
    return {
        ...actual,
        AgentMiddlewareStrategy: () => (target: unknown) => target
    }
})

import { AIMessage, HumanMessage, RemoveMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph'
import { channelName, IWFNMiddleware, STATE_VARIABLE_HUMAN, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddleware, AgentMiddlewareRuntimeApi, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import {
    RALPH_LOOP_GOAL_SLASH_COMMAND_TEMPLATE,
    RALPH_LOOP_MIDDLEWARE_NAME,
    RalphLoopMiddleware
} from './ralph-loop.middleware'

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

function getBeforeAgentHook(middleware: AgentMiddleware) {
    const hook = typeof middleware.beforeAgent === 'function' ? middleware.beforeAgent : middleware.beforeAgent?.hook
    if (!hook) {
        throw new Error('Expected middleware to expose beforeAgent.')
    }

    return hook
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

function createVerifierToolCall(command = 'npm test') {
    return {
        type: 'tool_call' as const,
        id: 'call-verify',
        name: 'sandbox_shell',
        args: {
            command
        }
    }
}

function createVerifierMessages(output = 'All tests passed.', command = 'npm test') {
    const toolCall = createVerifierToolCall(command)
    return [
        new AIMessage({
            content: '',
            tool_calls: [toolCall]
        }),
        new ToolMessage({
            content: output,
            tool_call_id: toolCall.id,
            name: toolCall.name
        })
    ]
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

    it('exposes the default goal slash command template from metadata', () => {
        const strategy = new RalphLoopMiddleware()

        expect(strategy.meta.slashCommands).toEqual([
            expect.objectContaining({
                name: 'goal',
                label: 'Goal',
                action: {
                    type: 'insert_invocation',
                    template: RALPH_LOOP_GOAL_SLASH_COMMAND_TEMPLATE
                }
            })
        ])
        expect(RALPH_LOOP_GOAL_SLASH_COMMAND_TEMPLATE).toContain('Plan -> Act -> Verify -> Reflect -> Retry')
        expect(RALPH_LOOP_GOAL_SLASH_COMMAND_TEMPLATE).toContain('Playwright Interactive')
        expect(RALPH_LOOP_GOAL_SLASH_COMMAND_TEMPLATE).toContain('<promise>DONE</promise>')
    })

    it('starts a fresh active run and captures the original task before the agent starts', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const beforeAgent = getBeforeAgentHook(middleware)

        const result = await beforeAgent(
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
            ralphLoopStatus: 'active',
            ralphLoopOriginalTaskText: 'ship the feature',
            ralphLoopOriginalHumanContent: 'ship the feature',
            ralphLoopRuntimeSummary: undefined,
            ralphLoopLastVerifier: undefined,
            ralphLoopStopReason: undefined
        })
        expect((result as any).ralphLoopRunId).toEqual(expect.any(String))
    })

    it('preserves active state across turns for the same objective', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const beforeAgent = getBeforeAgentHook(middleware)

        const result = await beforeAgent(
            {
                messages: [],
                ralphLoopIteration: 4,
                ralphLoopStatus: 'active',
                ralphLoopRunId: 'run-1',
                ralphLoopOriginalTaskText: 'ship the feature',
                ralphLoopOriginalHumanContent: 'ship the feature',
                ralphLoopRuntimeSummary: 'fixed the first failure'
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
            ralphLoopStatus: 'active',
            ralphLoopRunId: 'run-1',
            ralphLoopOriginalTaskText: 'ship the feature',
            ralphLoopOriginalHumanContent: 'ship the feature'
        })
        expect((result as any).ralphLoopIteration).toBeUndefined()
        expect((result as any).ralphLoopRuntimeSummary).toBeUndefined()
    })

    it('starts a fresh run when the objective changes or the prior run is terminal', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const beforeAgent = getBeforeAgentHook(middleware)

        const changedObjective = await beforeAgent(
            {
                messages: [],
                ralphLoopIteration: 4,
                ralphLoopStatus: 'active',
                ralphLoopRunId: 'run-1',
                ralphLoopOriginalTaskText: 'ship the feature'
            } as any,
            {
                state: {
                    [STATE_VARIABLE_HUMAN]: {
                        input: 'ship the next feature'
                    }
                }
            } as any
        )

        expect(changedObjective).toMatchObject({
            ralphLoopIteration: 0,
            ralphLoopStatus: 'active',
            ralphLoopOriginalTaskText: 'ship the next feature'
        })
        expect((changedObjective as any).ralphLoopRunId).not.toBe('run-1')

        const terminalRun = await beforeAgent(
            {
                messages: [],
                ralphLoopIteration: 0,
                ralphLoopStatus: 'completed',
                ralphLoopRunId: 'run-2',
                ralphLoopOriginalTaskText: 'ship the feature'
            } as any,
            {
                state: {
                    [STATE_VARIABLE_HUMAN]: {
                        input: 'ship the feature'
                    }
                }
            } as any
        )

        expect(terminalRun).toMatchObject({
            ralphLoopIteration: 0,
            ralphLoopStatus: 'active',
            ralphLoopOriginalTaskText: 'ship the feature'
        })
        expect((terminalRun as any).ralphLoopRunId).not.toBe('run-2')
    })

    it('appends the verifier-first completion rule in wrapModelCall', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const wrapModelCall = getWrapModelCall(middleware)
        const handler = jest.fn(async (request: any) => {
            void request
            return new AIMessage('ok')
        })

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
        expect(request.systemMessage.content).toContain('Ralph Loop verifier-first mode is enabled')
        expect(request.systemMessage.content).toContain('<promise>DONE</promise>')
        expect(request.systemMessage.content).toContain('trusted verifier evidence has passed')
    })

    it('forces retry-only messages during wrapModelCall when the channel was reset for Ralph Loop', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const wrapModelCall = getWrapModelCall(middleware)
        const retryMessage = new HumanMessage('[RALPH LOOP - ITERATION 1/20]\n\nOriginal objective:\nship it')
        const handler = jest.fn(async (request: any) => {
            void request
            return new AIMessage('ok')
        })

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

    it('rejects a completion promise without trusted verifier evidence and continues', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const hook = getAfterModelHook(middleware)
        const aiMessage = new AIMessage('All done. <promise>DONE</promise>')

        const result = (await hook(
            {
                messages: [new HumanMessage('finish this'), aiMessage],
                ralphLoopIteration: 0,
                ralphLoopOriginalTaskText: 'finish this',
                ralphLoopOriginalHumanContent: 'finish this'
            } as any,
            {} as any
        )) as any

        expect(result?.jumpTo).toBe('model')
        expect(result?.ralphLoopIteration).toBe(1)
        expect(result?.ralphLoopStatus).toBe('active')
        expect(result?.ralphLoopLastVerifier).toBeUndefined()
        expect(result?.messages?.[0]).toBeInstanceOf(RemoveMessage)
        expect((result?.messages?.[0] as RemoveMessage).id).toBe(REMOVE_ALL_MESSAGES)
        expect((result?.messages?.[1] as HumanMessage).content).toContain('no trusted verifier evidence')
    })

    it('accepts completion only when sandbox_shell verifier evidence passed', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const hook = getAfterModelHook(middleware)
        const aiMessage = new AIMessage('All done. <promise>DONE</promise>')

        const result = await hook(
            {
                messages: [new HumanMessage('finish this'), ...createVerifierMessages('All tests passed.'), aiMessage],
                ralphLoopIteration: 3,
                ralphLoopOriginalTaskText: 'finish this',
                ralphLoopOriginalHumanContent: 'finish this'
            } as any,
            {} as any
        )

        expect(aiMessage.content).toBe('All done.')
        expect(result).toMatchObject({
            ralphLoopIteration: 0,
            ralphLoopStatus: 'completed',
            ralphLoopOriginalHumanContent: 'finish this',
            ralphLoopOriginalTaskText: 'finish this',
            ralphLoopStopReason: 'verifier_passed',
            ralphLoopLastVerifier: {
                toolName: 'sandbox_shell',
                command: 'npm test',
                status: 'pass',
                content: 'All tests passed.'
            }
        })
        expect((result as any).jumpTo).toBeUndefined()
    })

    it('continues with failed verifier evidence even when the model claims completion', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const hook = getAfterModelHook(middleware)
        const aiMessage = new AIMessage('Looks good. <promise>DONE</promise>')

        const result = (await hook(
            {
                messages: [
                    new HumanMessage('fix the tests'),
                    ...createVerifierMessages('Exit code 1\n1 failed, 2 passed.', 'npm test'),
                    aiMessage
                ],
                ralphLoopIteration: 1,
                ralphLoopOriginalTaskText: 'fix the tests',
                ralphLoopOriginalHumanContent: 'fix the tests'
            } as any,
            {} as any
        )) as any

        expect(result?.jumpTo).toBe('model')
        expect(result?.ralphLoopIteration).toBe(2)
        expect(result?.ralphLoopStatus).toBe('active')
        expect(result?.ralphLoopLastVerifier).toMatchObject({
            toolName: 'sandbox_shell',
            command: 'npm test',
            status: 'fail',
            content: 'Exit code 1\n1 failed, 2 passed.'
        })
        const retryMessage = result?.messages?.[1] as HumanMessage
        expect(retryMessage.content).toContain('latest trusted verifier status was FAIL')
        expect(retryMessage.content).toContain('Exit code 1')
    })

    it('does not clear messages when the model produced tool calls', async () => {
        const middleware = await createRalphLoopAgentMiddleware()
        const hook = getAfterModelHook(middleware)
        const aiMessage = new AIMessage({
            content: 'I will verify first.',
            tool_calls: [createVerifierToolCall()]
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
        expect(result).toMatchObject({
            ralphLoopStatus: 'active'
        })
    })

    it('clears channel messages and retries from a compact continuation prompt when unfinished', async () => {
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
        expect((result?.messages?.[1] as HumanMessage).content).toContain('Original objective:\nbuild the API')
        expect((result?.messages?.[1] as HumanMessage).content).toContain('Plan -> Act -> Verify -> Reflect -> Retry')
        expect((result as any).ralphLoopRuntimeSummary).toContain('I started but did not finish.')
    })

    it('preserves multipart original user content behind the continuation prompt', async () => {
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

    it('stops with a verifier-aware notice when max iterations is reached', async () => {
        const middleware = await createRalphLoopAgentMiddleware({ maxIterations: 2 })
        const hook = getAfterModelHook(middleware)
        const aiMessage = new AIMessage('Still not complete.')

        const result = await hook(
            {
                messages: [
                    new HumanMessage('finish this'),
                    ...createVerifierMessages('Exit code 1\n1 failed.', 'npm test'),
                    aiMessage
                ],
                ralphLoopIteration: 2,
                ralphLoopOriginalTaskText: 'finish this',
                ralphLoopOriginalHumanContent: 'finish this'
            } as any,
            {} as any
        )

        expect(aiMessage.content).toContain('verifier-first completion contract')
        expect(aiMessage.content).toContain('Exit code 1')
        expect((result as any).messages).toBeUndefined()
        expect((result as any).jumpTo).toBeUndefined()
        expect(result).toMatchObject({
            ralphLoopIteration: 2,
            ralphLoopStatus: 'budget_exhausted',
            ralphLoopOriginalHumanContent: 'finish this',
            ralphLoopOriginalTaskText: 'finish this',
            ralphLoopStopReason: 'max_iterations',
            ralphLoopLastVerifier: {
                status: 'fail',
                command: 'npm test'
            }
        })
    })
})

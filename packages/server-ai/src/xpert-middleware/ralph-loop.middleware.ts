import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    MessageContent,
    MessageContentComplex,
    RemoveMessage,
    SystemMessage,
    isAIMessage,
    isHumanMessage
} from '@langchain/core/messages'
import { InferInteropZodInput, interopParse } from '@langchain/core/utils/types'
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph'
import { Injectable } from '@nestjs/common'
import { channelName, STATE_VARIABLE_HUMAN, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

export const RALPH_LOOP_MIDDLEWARE_NAME = 'ralph-loop'

const DEFAULT_MAX_ITERATIONS = 20
const COMPLETION_PROMISE = '<promise>DONE</promise>'
const COMPLETION_PROMISE_TEST_PATTERN = /<promise>\s*DONE\s*<\/promise>/i
const COMPLETION_PROMISE_PATTERN = /<promise>\s*DONE\s*<\/promise>/gi
const RALPH_RETRY_PREFIX = '[RALPH LOOP - ITERATION '

const configSchema = z.object({
    maxIterations: z.number().int().min(1).default(DEFAULT_MAX_ITERATIONS)
})

const ralphLoopStateSchema = z.object({
    ralphLoopIteration: z.number().int().min(0).default(0),
    ralphLoopOriginalHumanContent: z.any().optional(),
    ralphLoopOriginalTaskText: z.string().optional()
})

export type RalphLoopMiddlewareConfig = InferInteropZodInput<typeof configSchema>

function getMessageText(content: MessageContent | unknown): string {
    if (typeof content === 'string') {
        return content
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') {
                    return part
                }

                if (!part || typeof part !== 'object') {
                    return ''
                }

                const text = Reflect.get(part, 'text')
                if (typeof text === 'string') {
                    return text
                }

                return ''
            })
            .filter(Boolean)
            .join('\n')
    }

    return ''
}

function replaceCompletionPromise(content: MessageContent): MessageContent {
    if (typeof content === 'string') {
        return content.replace(COMPLETION_PROMISE_PATTERN, '').trim()
    }

    return content.map((part) => {
        if (!part || typeof part !== 'object') {
            return part
        }

        const text = Reflect.get(part, 'text')
        if (typeof text !== 'string') {
            return part
        }

        return {
            ...part,
            text: text.replace(COMPLETION_PROMISE_PATTERN, '').trim()
        }
    })
}

function containsCompletionPromise(message: AIMessage): boolean {
    return COMPLETION_PROMISE_TEST_PATTERN.test(getMessageText(message.content))
}

function isRalphRetryText(text: string): boolean {
    return text.trimStart().startsWith(RALPH_RETRY_PREFIX)
}

function isRalphRetryHumanMessage(message: BaseMessage | undefined): boolean {
    if (!message || !isHumanMessage(message)) {
        return false
    }

    return isRalphRetryText(getMessageText(message.content))
}

function findLatestAiMessage(messages: BaseMessage[]): AIMessage | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (isAIMessage(message)) {
            return message
        }
    }

    return undefined
}

function findOriginalHumanContent(messages: BaseMessage[]): MessageContent | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (isHumanMessage(message) && !isRalphRetryHumanMessage(message)) {
            return message.content
        }
    }

    return undefined
}

function resolveOriginalHumanContent(storedContent: unknown, messages: BaseMessage[]): MessageContent | undefined {
    const messageContent = findOriginalHumanContent(messages)
    if (Array.isArray(messageContent)) {
        return messageContent
    }

    if (typeof storedContent === 'string' || Array.isArray(storedContent)) {
        return storedContent
    }

    return messageContent
}

function readRuntimeOriginalTask(runtime: unknown): string | undefined {
    if (!runtime || typeof runtime !== 'object') {
        return undefined
    }

    const state = Reflect.get(runtime, 'state')
    if (!state || typeof state !== 'object') {
        return undefined
    }

    const human = Reflect.get(state, STATE_VARIABLE_HUMAN)
    if (!human || typeof human !== 'object') {
        return undefined
    }

    const input = Reflect.get(human, 'input')
    return typeof input === 'string' && input.trim() ? input : undefined
}

function readRequestChannelMessages(context: IAgentMiddlewareContext, state: unknown): BaseMessage[] | undefined {
    if (!context.agentKey || !state || typeof state !== 'object') {
        return undefined
    }

    const channelState = Reflect.get(state, channelName(context.agentKey))
    if (!channelState || typeof channelState !== 'object') {
        return undefined
    }

    const messages = Reflect.get(channelState, 'messages')
    return Array.isArray(messages) ? (messages as BaseMessage[]) : undefined
}

function normalizeOriginalTaskText(taskText: string | undefined, humanContent: MessageContent | undefined): string {
    const textFromContent = humanContent ? getMessageText(humanContent) : ''
    const resolved = taskText?.trim() || textFromContent.trim()
    return resolved || '(original task is provided in the attached message parts below)'
}

function buildRetryPrompt(iteration: number, maxIterations: number, originalTask: string): string {
    return `[RALPH LOOP - ITERATION ${iteration}/${maxIterations}]

Your previous attempt did not output the completion promise, so this is a fresh retry with a clean message history.

IMPORTANT:
- Work from scratch on the original task below.
- Do not rely on previous conversation context; only use this message and the system instructions.
- Complete the task fully.
- When FULLY complete, output: ${COMPLETION_PROMISE}
- Do not stop until the task is truly done.

Original task:
${originalTask}`
}

function createRetryHumanMessage(
    iteration: number,
    maxIterations: number,
    originalTaskText: string | undefined,
    originalHumanContent: MessageContent | undefined
): HumanMessage {
    const originalTask = normalizeOriginalTaskText(originalTaskText, originalHumanContent)
    const prompt = buildRetryPrompt(iteration, maxIterations, originalTask)

    if (Array.isArray(originalHumanContent)) {
        return new HumanMessage({
            content: [{ type: 'text', text: prompt }, ...(originalHumanContent as MessageContentComplex[])]
        })
    }

    return new HumanMessage(prompt)
}

function appendSystemRule(systemMessage: SystemMessage | undefined): SystemMessage {
    const currentContent =
        typeof systemMessage?.content === 'string' ? systemMessage.content : getMessageText(systemMessage?.content)
    const rule = `Ralph Loop is enabled. When the task is fully complete, include exactly ${COMPLETION_PROMISE} at the end of the final answer.`

    if (currentContent.includes(COMPLETION_PROMISE)) {
        return new SystemMessage({
            content: currentContent,
            id: systemMessage?.id,
            name: systemMessage?.name,
            additional_kwargs: systemMessage?.additional_kwargs,
            response_metadata: systemMessage?.response_metadata
        })
    }

    return new SystemMessage({
        content: `${currentContent}${currentContent ? '\n\n' : ''}${rule}`,
        id: systemMessage?.id,
        name: systemMessage?.name,
        additional_kwargs: systemMessage?.additional_kwargs,
        response_metadata: systemMessage?.response_metadata
    })
}

function appendMaxIterationNotice(message: AIMessage, maxIterations: number) {
    const notice = `Ralph Loop stopped after reaching ${maxIterations} automatic retries without receiving the completion promise.`

    if (typeof message.content === 'string') {
        message.content = `${message.content.trimEnd()}\n\n${notice}`.trim()
        return
    }

    message.content = [
        ...message.content,
        {
            type: 'text',
            text: notice
        }
    ]
}

@Injectable()
@AgentMiddlewareStrategy(RALPH_LOOP_MIDDLEWARE_NAME)
export class RalphLoopMiddleware implements IAgentMiddlewareStrategy {
    meta: TAgentMiddlewareMeta = {
        name: RALPH_LOOP_MIDDLEWARE_NAME,
        label: {
            en_US: 'Ralph Loop Middleware',
            zh_Hans: 'Ralph Loop Middleware'
        },
        description: {
            en_US: 'Automatically retries an agent from a clean message context until it emits the Ralph Loop completion promise.',
            zh_Hans:
                'Automatically retries an agent from a clean message context until it emits the Ralph Loop completion promise.'
        },
        configSchema: {
            type: 'object',
            properties: {
                maxIterations: {
                    type: 'number',
                    default: DEFAULT_MAX_ITERATIONS,
                    minimum: 1,
                    title: {
                        en_US: 'Max Iterations',
                        zh_Hans: 'Max Iterations'
                    },
                    description: {
                        en_US: 'Maximum number of automatic clean-context retries.',
                        zh_Hans: 'Maximum number of automatic clean-context retries.'
                    }
                }
            }
        }
    }

    createMiddleware(
        options: RalphLoopMiddlewareConfig = {},
        context: IAgentMiddlewareContext
    ): PromiseOrValue<AgentMiddleware> {
        const config = interopParse(configSchema, options) ?? { maxIterations: DEFAULT_MAX_ITERATIONS }

        return {
            name: RALPH_LOOP_MIDDLEWARE_NAME,
            stateSchema: ralphLoopStateSchema,
            beforeAgent: async (_state, runtime) => {
                const originalTaskText = readRuntimeOriginalTask(runtime)

                return {
                    ralphLoopIteration: 0,
                    ralphLoopOriginalTaskText: originalTaskText,
                    ralphLoopOriginalHumanContent: originalTaskText
                }
            },
            wrapModelCall: async (request, handler) => {
                const channelMessages = readRequestChannelMessages(context, request.state)
                const retryOnlyMessages =
                    channelMessages?.length === 1 && isRalphRetryHumanMessage(channelMessages[0])
                        ? [channelMessages[0]]
                        : request.messages

                return handler({
                    ...request,
                    messages: retryOnlyMessages,
                    systemMessage: appendSystemRule(request.systemMessage)
                })
            },
            afterModel: {
                canJumpTo: ['model'],
                hook: async (state) => {
                    const messages = Array.isArray(state.messages) ? (state.messages as BaseMessage[]) : []
                    if (!messages.length) {
                        return
                    }

                    const lastAiMessage = findLatestAiMessage(messages)
                    if (!lastAiMessage) {
                        return
                    }

                    const originalHumanContent = resolveOriginalHumanContent(
                        state.ralphLoopOriginalHumanContent,
                        messages
                    )
                    const originalTaskText =
                        state.ralphLoopOriginalTaskText ?? normalizeOriginalTaskText(undefined, originalHumanContent)

                    if (lastAiMessage.tool_calls?.length) {
                        return {
                            ralphLoopOriginalHumanContent: originalHumanContent,
                            ralphLoopOriginalTaskText: originalTaskText
                        }
                    }

                    if (containsCompletionPromise(lastAiMessage)) {
                        lastAiMessage.content = replaceCompletionPromise(lastAiMessage.content)
                        return {
                            ralphLoopIteration: 0,
                            ralphLoopOriginalHumanContent: undefined,
                            ralphLoopOriginalTaskText: undefined
                        }
                    }

                    const currentIteration =
                        typeof state.ralphLoopIteration === 'number' && Number.isFinite(state.ralphLoopIteration)
                            ? state.ralphLoopIteration
                            : 0

                    if (currentIteration >= config.maxIterations) {
                        appendMaxIterationNotice(lastAiMessage, config.maxIterations)
                        return {
                            ralphLoopIteration: 0,
                            ralphLoopOriginalHumanContent: undefined,
                            ralphLoopOriginalTaskText: undefined
                        }
                    }

                    const nextIteration = currentIteration + 1
                    return {
                        messages: [
                            new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
                            createRetryHumanMessage(
                                nextIteration,
                                config.maxIterations,
                                originalTaskText,
                                originalHumanContent
                            )
                        ],
                        ralphLoopIteration: nextIteration,
                        ralphLoopOriginalHumanContent: originalHumanContent,
                        ralphLoopOriginalTaskText: originalTaskText,
                        jumpTo: 'model'
                    }
                }
            }
        }
    }
}

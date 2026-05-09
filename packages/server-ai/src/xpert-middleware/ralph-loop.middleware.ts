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
        icon: {
            type: 'svg',
            value: `<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 48 48">
<path fill="#4b7bb2" d="M7.489,41.021c0,0-0.351-6.957,4.34-6.989L13.904,34c0,0-1.149,4.915,4.309,6.926l6.702-6.287 l8.106,0.287l5.617-2.904l1.34,4.053c0,0-3.287,4.691-10.564,5.17L25.5,38.5l-7.702,3.223c0,0-4.755-2.074-8.298-1.5L7.489,41.021z"></path><path fill="#febf10" d="M4.537,26.835c0,0,1.484,4.404,7.181,2.777c0,0,0.048,1.101,2.777,1.676c0,0-1.676,5.17,0.814,8.186 l2.633,2.011l6.846-6.941l6.08,0.479c0,0,7.372-0.096,8.809-5.649c0,0,6.447-1.725,2.027-5.698c0,0,1.229-8.425-7.436-14.983 c0,0-13.309-7.564-24.941,3.973c0,0-5.122,5.266-2.489,10.915C6.835,23.58,3.819,26.309,4.537,26.835z"></path><path fill="#d6e5e5" d="M14.207,22.622c0,0-5.051,1.316-5.074-3.854c0,0,0.91-5.936,6.367-3.303c0,0,2.944,2.418,0.886,5.29 C16.386,20.755,14.519,21.521,14.207,22.622z"></path><path fill="#d6e5e5" d="M23.662,21.856c0,0-4.261-2.394-0.574-6.152c0,0,3.519-2.729,6.008,1.029 c0,0,2.011,2.537-0.311,4.931C28.785,21.665,26.582,24.011,23.662,21.856z"></path><path d="M13.493,18.496c-0.043-0.04-0.086-0.079-0.129-0.119c-0.034-0.026-0.067-0.052-0.101-0.078 c-0.04-0.017-0.08-0.034-0.119-0.05c-0.044-0.006-0.089-0.012-0.133-0.018c-0.069-0.003-0.133,0.012-0.193,0.043 c-0.042,0.012-0.079,0.033-0.11,0.064c-0.038,0.022-0.067,0.052-0.09,0.09c-0.031,0.031-0.052,0.068-0.064,0.11 c-0.031,0.06-0.046,0.124-0.043,0.193c0.005,0.099,0.01,0.198,0.015,0.297c0,0.09,0.023,0.174,0.068,0.252 c0.031,0.058,0.074,0.105,0.129,0.14c0.048,0.044,0.105,0.074,0.17,0.089c0.089,0.024,0.177,0.024,0.266,0 c0.034-0.006,0.065-0.022,0.096-0.035c0.03-0.013,0.064-0.024,0.092-0.043c0.043-0.03,0.09-0.062,0.128-0.101 s0.07-0.084,0.101-0.129c0.007-0.011,0.014-0.023,0.019-0.035c0.018-0.039,0.049-0.102,0.062-0.153 c0.014-0.055,0.019-0.112,0.024-0.168c0.001-0.013,0.001-0.026-0.001-0.039c-0.004-0.034-0.009-0.117-0.026-0.167 c-0.017-0.051-0.037-0.105-0.065-0.151c-0.062-0.1-0.13-0.165-0.228-0.229c-0.044-0.028-0.115-0.053-0.15-0.066 c-0.013-0.005-0.026-0.009-0.039-0.011c-0.054-0.01-0.11-0.02-0.166-0.021c-0.055-0.001-0.126,0.013-0.17,0.02 c-0.014,0.002-0.028,0.005-0.041,0.01c-0.046,0.017-0.093,0.037-0.136,0.057c-0.007,0.003-0.013,0.007-0.019,0.011 c-0.097,0.061-0.177,0.137-0.235,0.237c-0.037,0.057-0.056,0.119-0.059,0.186c-0.015,0.066-0.012,0.133,0.009,0.199 c0.015,0.065,0.045,0.122,0.089,0.17c0.035,0.054,0.082,0.097,0.14,0.129c0.04,0.017,0.08,0.034,0.119,0.05 c0.089,0.024,0.177,0.024,0.266,0c0.04-0.017,0.08-0.034,0.119-0.05c0.075-0.044,0.135-0.104,0.179-0.179 c0.004-0.006,0.008-0.013,0.012-0.019c-0.026,0.034-0.052,0.067-0.078,0.101c0.008-0.011,0.018-0.02,0.028-0.028 c-0.034,0.026-0.067,0.052-0.101,0.078c0.013-0.01,0.026-0.018,0.041-0.024c-0.04,0.017-0.08,0.034-0.119,0.05 c0.017-0.007,0.035-0.012,0.053-0.015c-0.044,0.006-0.089,0.012-0.133,0.018c0.02-0.003,0.04-0.003,0.059,0 c-0.044-0.006-0.089-0.012-0.133-0.018c0.017,0.002,0.034,0.007,0.05,0.013c-0.04-0.017-0.08-0.034-0.119-0.05 c0.015,0.006,0.028,0.014,0.041,0.024c-0.034-0.026-0.067-0.052-0.101-0.078c0.011,0.008,0.02,0.018,0.028,0.029 c-0.026-0.034-0.052-0.067-0.078-0.101c0.008,0.011,0.015,0.023,0.02,0.036c-0.017-0.04-0.034-0.08-0.05-0.119 c0.005,0.014,0.009,0.028,0.011,0.043c-0.006-0.044-0.012-0.089-0.018-0.133c0.002,0.016,0.002,0.032,0,0.048 c0.006-0.044,0.012-0.089,0.018-0.133c-0.003,0.02-0.008,0.039-0.016,0.058c0.017-0.04,0.034-0.08,0.05-0.119 c-0.007,0.016-0.016,0.031-0.026,0.045c0.026-0.034,0.052-0.067,0.078-0.101c-0.011,0.014-0.023,0.026-0.036,0.037 c0.034-0.026,0.067-0.052,0.101-0.078c-0.012,0.009-0.024,0.016-0.038,0.022c0.04-0.017,0.08-0.034,0.119-0.05 c-0.012,0.005-0.024,0.008-0.036,0.01c0.211,0.161,0.422,0.321,0.633,0.482c-0.005-0.099-0.01-0.198-0.015-0.297 c-0.285,0.118-0.569,0.236-0.854,0.354c0.043,0.04,0.086,0.079,0.129,0.119c0.045,0.049,0.099,0.083,0.161,0.103 c0.06,0.031,0.124,0.046,0.193,0.043c0.069,0.003,0.133-0.012,0.193-0.043c0.062-0.02,0.116-0.055,0.161-0.103 c0.026-0.034,0.052-0.067,0.078-0.101c0.045-0.078,0.068-0.162,0.068-0.252c-0.006-0.044-0.012-0.089-0.018-0.133 C13.598,18.632,13.555,18.559,13.493,18.496L13.493,18.496z"></path><path d="M25.148,17.964c-0.005,0.012-0.008,0.024-0.01,0.037c-0.008,0.048-0.017,0.098-0.019,0.147c0,0.007,0,0.014,0,0.021 c0.01,0.138,0.027,0.192,0.086,0.316c0.005,0.011,0.011,0.021,0.018,0.031c0.031,0.045,0.063,0.089,0.101,0.129 c0.009,0.009,0.018,0.018,0.029,0.026c0.042,0.034,0.084,0.071,0.131,0.099c0.046,0.027,0.098,0.045,0.147,0.064 c0.013,0.005,0.027,0.01,0.041,0.013c0.136,0.028,0.196,0.025,0.331,0.002c0.013-0.002,0.025-0.005,0.036-0.01 c0.047-0.018,0.105-0.037,0.15-0.067c0.043-0.029,0.085-0.06,0.124-0.096c0.004-0.004,0.008-0.008,0.012-0.012 c0.032-0.036,0.061-0.076,0.089-0.115c0.006-0.009,0.012-0.018,0.017-0.027c0.012-0.023,0.022-0.05,0.032-0.073 c0.01-0.024,0.023-0.05,0.031-0.076c0.004-0.011,0.007-0.022,0.009-0.034c0.01-0.055,0.019-0.11,0.022-0.166 c0.003-0.067-0.01-0.138-0.023-0.202c-0.013-0.063-0.044-0.127-0.072-0.183c-0.005-0.011-0.011-0.021-0.018-0.03 c-0.027-0.038-0.057-0.076-0.086-0.112c-0.004-0.005-0.008-0.01-0.013-0.015c-0.004-0.004-0.007-0.007-0.011-0.011 c-0.035-0.031-0.074-0.059-0.111-0.087c-0.011-0.008-0.022-0.015-0.034-0.021c-0.049-0.023-0.098-0.047-0.15-0.062 c-0.054-0.016-0.118-0.021-0.17-0.025c-0.013-0.001-0.027-0.001-0.04,0c-0.057,0.004-0.114,0.011-0.17,0.024 c-0.035,0.008-0.068,0.025-0.101,0.038c-0.033,0.014-0.068,0.026-0.098,0.045c-0.049,0.03-0.093,0.067-0.137,0.104 c-0.012,0.01-0.023,0.021-0.033,0.032c-0.045,0.051-0.096,0.11-0.124,0.174c-0.019,0.043-0.052,0.107-0.063,0.161 c-0.012,0.058-0.021,0.117-0.023,0.176c-0.003,0.069,0.012,0.133,0.043,0.193c0.02,0.062,0.055,0.116,0.103,0.161 c0.045,0.049,0.099,0.083,0.161,0.103c0.06,0.031,0.124,0.046,0.193,0.043c0.044-0.006,0.089-0.012,0.133-0.018 c0.085-0.024,0.158-0.067,0.221-0.129c0.026-0.034,0.052-0.067,0.078-0.101c0.045-0.078,0.068-0.162,0.068-0.252 c0-0.009,0.001-0.017,0.002-0.026c-0.006,0.044-0.012,0.089-0.018,0.133c0.003-0.02,0.008-0.04,0.016-0.059 c-0.017,0.04-0.034,0.08-0.05,0.119c0.009-0.022,0.022-0.042,0.036-0.061c-0.026,0.034-0.052,0.067-0.078,0.101 c0.015-0.019,0.032-0.036,0.051-0.051c-0.034,0.026-0.067,0.052-0.101,0.078c0.021-0.016,0.043-0.029,0.066-0.039 c-0.04,0.017-0.08,0.034-0.119,0.05c0.02-0.008,0.041-0.014,0.063-0.017c-0.044,0.006-0.089,0.012-0.133,0.018 c0.02-0.003,0.04-0.003,0.06-0.001c-0.044-0.006-0.089-0.012-0.133-0.018c0.019,0.003,0.036,0.007,0.054,0.014 c-0.04-0.017-0.08-0.034-0.119-0.05c0.015,0.007,0.029,0.015,0.043,0.025c-0.034-0.026-0.067-0.052-0.101-0.078 c0.014,0.011,0.026,0.023,0.037,0.037c-0.026-0.034-0.052-0.067-0.078-0.101c0.012,0.015,0.021,0.032,0.029,0.049 c-0.017-0.04-0.034-0.08-0.05-0.119c0.009,0.022,0.016,0.045,0.019,0.069c-0.006-0.044-0.012-0.089-0.018-0.133 c0.003,0.024,0.003,0.047,0.001,0.071c0.006-0.044,0.012-0.089,0.018-0.133c-0.003,0.022-0.008,0.043-0.017,0.063 c0.017-0.04,0.034-0.08,0.05-0.119c-0.007,0.016-0.015,0.031-0.026,0.045c0.026-0.034,0.052-0.067,0.078-0.101 c-0.01,0.013-0.021,0.024-0.034,0.033c0.034-0.026,0.067-0.052,0.101-0.078c-0.011,0.008-0.023,0.015-0.036,0.021 c0.04-0.017,0.08-0.034,0.119-0.05c-0.015,0.006-0.03,0.01-0.046,0.012c0.044-0.006,0.089-0.012,0.133-0.018 c-0.016,0.002-0.031,0.002-0.047,0c0.044,0.006,0.089,0.012,0.133,0.018c-0.019-0.003-0.037-0.008-0.055-0.015 c0.04,0.017,0.08,0.034,0.119,0.05c-0.021-0.009-0.04-0.02-0.058-0.034c0.034,0.026,0.067,0.052,0.101,0.078 c-0.016-0.013-0.031-0.028-0.044-0.044c0.026,0.034,0.052,0.067,0.078,0.101c-0.011-0.015-0.021-0.031-0.028-0.049 c0.017,0.04,0.034,0.08,0.05,0.119c-0.006-0.014-0.01-0.029-0.012-0.044c0.006,0.044,0.012,0.089,0.018,0.133 c-0.002-0.015-0.002-0.03,0-0.046c-0.006,0.044-0.012,0.089-0.018,0.133c0.002-0.013,0.005-0.025,0.01-0.037 c0.021-0.066,0.024-0.133,0.009-0.199c-0.003-0.067-0.023-0.129-0.059-0.186c-0.031-0.058-0.074-0.105-0.129-0.14 c-0.048-0.044-0.105-0.074-0.17-0.089c-0.044-0.006-0.089-0.012-0.133-0.018c-0.09,0-0.174,0.023-0.252,0.068 c-0.034,0.026-0.067,0.052-0.101,0.078C25.215,17.806,25.172,17.88,25.148,17.964L25.148,17.964z"></path><path d="M17.281,20.727c0.627-1.373,0.586-2.99-0.123-4.331c-0.751-1.42-2.23-2.263-3.825-2.278 c-0.774-0.007-1.556,0.183-2.234,0.557c-0.758,0.418-1.298,1.079-1.73,1.816c-0.467,0.798-0.846,1.66-0.865,2.598 c-0.017,0.836,0.238,1.699,0.706,2.391c0.955,1.411,2.807,2.056,4.458,1.697c-0.104,0.891,0.171,1.798,0.986,2.307 c0.84,0.525,1.891,0.436,2.778,0.09c0.251-0.098,0.426-0.335,0.349-0.615c-0.066-0.24-0.362-0.448-0.615-0.349 c-0.551,0.215-1.159,0.356-1.734,0.149c-0.446-0.16-0.764-0.537-0.796-1.037c-0.069-1.062,0.666-2.179,1.81-2.163 c0.247,0.003,0.488,0.075,0.661,0.203c0.221,0.163,0.3,0.319,0.284,0.551c-0.019,0.27,0.243,0.5,0.5,0.5 c0.286,0,0.481-0.23,0.5-0.5C18.441,21.599,17.913,20.996,17.281,20.727z M14.696,21.198c-0.282,0.231-0.507,0.533-0.682,0.863 c-0.03,0.005-0.056,0.001-0.088,0.013c-1.191,0.432-2.689,0.18-3.577-0.758c-1.026-1.084-1.023-2.597-0.369-3.864 c0.323-0.625,0.699-1.272,1.276-1.695c0.467-0.342,1.036-0.552,1.611-0.616c1.216-0.137,2.478,0.331,3.183,1.358 c0.791,1.151,0.914,2.712,0.264,3.955c-0.022,0.041-0.025,0.081-0.035,0.121C15.704,20.61,15.141,20.833,14.696,21.198z"></path><path d="M28.006,14.827c-1.81-0.851-3.936-0.93-5.455,0.515c-1.269,1.208-1.822,3.318-1.225,4.983 c0.325,0.908,1.006,1.52,1.815,2.009c0.913,0.553,1.997,0.95,3.077,0.891c1.849-0.168,3.61-1.402,4.266-3.17 c0.399-1.074-0.091-2.18-0.527-3.162C29.548,15.974,28.925,15.259,28.006,14.827z M28.419,21.265 c-0.61,0.535-1.392,0.887-2.202,0.961c-0.75,0.041-1.481-0.179-2.145-0.517c-0.553-0.281-1.169-0.645-1.53-1.164 c-0.775-1.113-0.488-2.851,0.225-3.917c0.367-0.55,0.912-1.006,1.53-1.245c0.799-0.309,1.66-0.201,2.462,0.039 c0.756,0.226,1.498,0.572,1.948,1.248c0.219,0.328,0.376,0.696,0.521,1.062c0.162,0.409,0.351,0.835,0.401,1.276 C29.727,19.879,29.037,20.723,28.419,21.265z"></path><path d="M39.076,26.887c0.123,0.028,0.279,0.028,0.385-0.05c0.155-0.114,0.318-0.217,0.492-0.299 c0.05-0.018,0.102-0.032,0.154-0.044c0.035-0.002,0.07-0.002,0.105,0c0.029,0.006,0.057,0.014,0.085,0.023 c0.013,0.007,0.026,0.014,0.038,0.022c0.007,0.007,0.014,0.013,0.021,0.02c0.004,0.007,0.009,0.013,0.013,0.02 c0.125,0.23,0.462,0.323,0.684,0.179c0.233-0.151,0.313-0.438,0.179-0.684c-0.211-0.388-0.666-0.6-1.098-0.587 c-0.443,0.013-0.83,0.231-1.178,0.487c-0.108,0.08-0.193,0.164-0.23,0.299c-0.033,0.12-0.018,0.279,0.05,0.385 C38.846,26.764,38.948,26.858,39.076,26.887z"></path><path d="M35.333,8.727c-0.267-0.2-0.529-0.404-0.816-0.58c-1.684-1.037-3.621-1.665-5.553-2.043 c-4.704-0.92-9.764-0.26-14.091,1.848c-4.145,1.407-7.952,3.675-11.149,6.671c-0.471,0.441,0.238,1.147,0.707,0.707 c1.717-1.609,3.621-2.995,5.658-4.149c-0.38,0.348-0.749,0.707-1.101,1.086C6.123,15.36,4.504,19.77,6.204,23.82 c-0.383,0.381-0.766,0.763-1.138,1.155c-0.382,0.401-0.761,0.832-0.956,1.36c-0.414,1.125,0.304,2.103,1.195,2.723 c1.836,1.277,4.239,1.667,6.419,1.29c0.066,0.088,0.136,0.172,0.211,0.252c0.443,0.474,1.033,0.776,1.664,0.901 c-0.044,0.697-0.087,1.393-0.112,2.087c-1.261,0.162-2.607-0.369-3.749,0.414c-0.499,0.342-0.922,0.813-1.293,1.286 c-1.428,1.819-1.966,4.085-1.428,6.346c0.101,0.424,0.702,0.481,0.914,0.119c0.712-1.216,2.744-1.149,3.951-1.068 c1.858,0.125,3.509,0.924,5.248,1.498c-0.019,0.023-0.044,0.041-0.062,0.065c-0.393,0.509,0.476,1.008,0.864,0.505 c0.434-0.563,1.175-0.94,1.783-1.274c0.837-0.459,1.708-0.856,2.586-1.227c1.04-0.439,2.097-0.844,3.165-1.209 c1.335,0.679,2.813,1.173,3.523,2.599c0.107,0.214,0.354,0.262,0.565,0.23c2.939-0.448,5.777-1.515,8.275-3.13 c0.592-0.383,1.162-0.798,1.714-1.237c0.491-0.391,0.896-0.797,0.895-1.467c0-0.742-0.341-1.515-0.592-2.199 c-0.251-0.688-0.542-1.36-0.854-2.022c0.494-0.601,0.925-1.255,1.267-1.956c0.019-0.04,0.022-0.078,0.031-0.117 c1.346-0.291,2.529-1.217,3.08-2.565c0.437-1.068,0.398-2.293-0.381-3.189c-0.161-0.185-0.351-0.334-0.55-0.469 c0.027-0.059,0.045-0.126,0.047-0.203c0.1-3.557-1.176-6.975-3.066-9.949c2.157,2.517,3.619,5.631,4.098,8.936 c0.092,0.634,1.056,0.365,0.964-0.266C43.674,16.464,40.175,11.509,35.333,8.727z M11.501,39.665 C10.33,39.624,8.853,39.72,7.84,40.43c-0.141-1.65,0.366-3.272,1.433-4.586c0.19-0.234,0.395-0.457,0.613-0.665 c0.082-0.078,0.166-0.154,0.252-0.228c0.133-0.115,0.048-0.05,0.133-0.105c0.514-0.337,1.108-0.315,1.698-0.28 c0.508,0.03,1.002,0.06,1.503,0.021c0.001,0.812,0.048,1.621,0.174,2.425c-0.259-0.322-0.512-0.645-0.759-0.966 c-0.387-0.503-1.256-0.006-0.863,0.505c1.202,1.565,2.473,3.191,4.176,4.237c-0.593-0.224-1.186-0.451-1.792-0.64 C13.464,39.853,12.488,39.7,11.501,39.665z M38.881,34.103c0.201,0.55,0.596,1.334,0.556,1.934 c-0.038,0.577-0.994,1.071-1.421,1.372c-0.512,0.362-1.041,0.701-1.585,1.014c-2.092,1.207-4.385,2.001-6.762,2.408 c-0.406-0.671-0.962-1.203-1.645-1.612c-0.352-0.21-0.722-0.387-1.091-0.564c-0.395-0.189-0.876-0.547-1.3-0.637 c-0.238-0.05-0.465,0.068-0.684,0.146c-0.435,0.154-0.868,0.313-1.298,0.478c-1.256,0.479-2.504,0.994-3.708,1.593 c0.705-0.632,1.395-1.281,2.052-1.962c0.888-0.92,1.639-1.977,2.526-2.889c0.435-0.448,1.148-0.239,1.728-0.191 c0.674,0.057,1.348,0.129,2.022,0.19c2.41,0.22,4.834,0.244,7.084-0.765c1.083-0.486,2.068-1.169,2.912-1.998 C38.486,33.107,38.697,33.599,38.881,34.103z M37.389,25.337c0.216,0.126,0.57,0.067,0.684-0.179 c0.631-1.365,2.938-1.631,4.006-0.666c1.297,1.172,0.212,3.225-1.043,3.943c-0.836,0.478-1.835,0.534-2.737,0.222 c-0.61-0.21-0.872,0.755-0.266,0.964c0.359,0.124,0.724,0.178,1.087,0.202c-0.879,1.565-2.164,2.857-3.767,3.688 c-2.096,1.087-4.428,1.098-6.727,0.903c-1.182-0.1-2.377-0.294-3.565-0.302c-1.113-0.008-1.6,1.022-2.254,1.783 c-1.449,1.687-3.047,3.237-4.757,4.657c-1.183-0.406-2.174-1.138-3.049-2.013c0.002-0.055,0.001-0.11-0.018-0.173 c-0.738-2.321-0.518-4.699-0.369-7.086c0.01-0.156-0.043-0.272-0.127-0.352c-0.064-0.208-0.238-0.348-0.469-0.363 c-0.041-0.003-0.081-0.006-0.122-0.01c-0.004,0-0.002,0-0.005,0c-0.002-0.001,0,0-0.003-0.001 c-0.073-0.016-0.147-0.028-0.219-0.047c-0.072-0.019-0.144-0.041-0.214-0.066c-0.032-0.011-0.064-0.024-0.095-0.036 c0.111,0.041-0.014-0.008-0.03-0.015c-0.135-0.065-0.265-0.141-0.387-0.227c-0.011-0.008-0.1-0.077-0.048-0.034 c0.051,0.041-0.049-0.042-0.06-0.052c-0.056-0.049-0.111-0.101-0.163-0.154c-0.047-0.049-0.091-0.101-0.135-0.152 c-0.008-0.009-0.007-0.007-0.011-0.012c-0.002-0.004-0.002-0.004-0.01-0.016c-0.023-0.034-0.047-0.067-0.069-0.101 c-0.038-0.059-0.073-0.119-0.105-0.181c-0.017-0.033-0.033-0.067-0.049-0.101c-0.002-0.007-0.025-0.064-0.03-0.079 c-0.025-0.073-0.047-0.148-0.064-0.224c-0.009-0.041-0.017-0.082-0.023-0.123l0,0c0.001,0.007,0.003,0.014,0.002,0 c6.222,0.845,12.563,0.55,18.688-0.884c0,0.003,0,0.006,0,0.008c-0.004,0.038-0.005,0.041-0.005,0.037 c-0.001,0.008-0.002,0.015-0.004,0.022c-0.009,0.049-0.019,0.099-0.032,0.147c-0.004,0.015-0.009,0.029-0.014,0.044 c-0.003,0.004-0.004,0.007-0.007,0.01c-0.133,0.159-0.182,0.388-0.062,0.574c0.142,0.22,0.449,0.331,0.684,0.179 c0.275-0.177,0.368-0.49,0.411-0.796c0.041-0.292,0.063-0.588,0.031-0.882c-0.038-0.344-0.178-0.68-0.351-0.978 c-0.21-0.362-0.526-0.67-0.942-0.77c-0.254-0.061-0.554,0.08-0.615,0.349c-0.059,0.257,0.077,0.549,0.349,0.615 c0.004,0.001,0.049,0.012,0.075,0.02c0.007,0.004,0.014,0.008,0.021,0.011c0.003,0.001,0.028,0.016,0.051,0.03 c0.004,0.003,0.001,0.001,0.006,0.005c0.012,0.011,0.024,0.022,0.036,0.034c0.023,0.022,0.043,0.054,0.068,0.073 c0.002,0.002,0,0,0.002,0.002c0.001,0.001,0.002,0.003,0.003,0.004c0.04,0.057,0.076,0.116,0.109,0.177 c0.014,0.027,0.034,0.059,0.052,0.091c-6.125,1.451-12.488,1.743-18.711,0.856c-0.043-0.029-0.088-0.057-0.14-0.069 c-0.084-0.019-0.164-0.013-0.241,0.005c-0.748-0.112-1.495-0.232-2.238-0.379c-0.629-0.124-0.898,0.84-0.266,0.964 c0.677,0.134,1.358,0.239,2.039,0.345c-0.002,0.213,0.028,0.426,0.086,0.632c-1.736,0.249-3.546-0.089-5.064-0.973 c-0.651-0.38-1.499-1.023-1.101-1.874c0.196-0.42,0.551-0.751,0.868-1.079c0.381-0.394,0.768-0.784,1.158-1.17 c0.174-0.172,0.179-0.38,0.095-0.548c-0.003-0.065-0.016-0.132-0.047-0.201c-1.576-3.46-0.236-7.388,2.116-10.132 c1.641-1.915,3.713-3.449,5.981-4.564c0.094-0.031,0.185-0.068,0.279-0.098c-2.036,1.341-3.839,3.017-5.329,4.982 c-0.389,0.513,0.479,1.012,0.863,0.505c1.959-2.584,4.561-4.676,7.494-6.058c-0.173,0.191-0.348,0.379-0.512,0.579 C17,10.07,15.965,11.425,15.16,12.893c-0.31,0.565,0.554,1.07,0.863,0.505c0.748-1.364,1.696-2.623,2.676-3.827 c0.864-1.061,1.855-2.121,3.146-2.653c0.026-0.011,0.047-0.028,0.071-0.041c0.207-0.027,0.413-0.058,0.62-0.079 c-1.764,1.753-2.982,3.973-4.15,6.151c-0.304,0.567,0.559,1.073,0.863,0.505c1.264-2.358,2.564-4.763,4.618-6.536 c0.078-0.068,0.117-0.143,0.139-0.219c0.138-0.005,0.276-0.002,0.415-0.004c-0.798,1.987-1.423,4.037-1.853,6.135 c-0.129,0.628,0.835,0.897,0.964,0.266c0.448-2.188,1.104-4.326,1.952-6.391c0.034,0.001,0.068,0.004,0.102,0.005 c0.017,0.075,0.048,0.149,0.107,0.218c1.404,1.679,1.959,3.874,2.392,5.972c0.13,0.63,1.094,0.363,0.964-0.266 c-0.423-2.053-0.997-4.114-2.213-5.835c0.266,0.027,0.532,0.051,0.797,0.088c0.094,0.013,0.189,0.034,0.283,0.049 c2.401,3.25,4.946,6.736,5.246,10.906c0.046,0.638,1.046,0.643,1,0c-0.291-4.045-2.49-7.442-4.815-10.633 c0.781,0.175,1.553,0.392,2.301,0.67c0.018,0.029,0.027,0.06,0.053,0.088c2.847,3.115,4.927,6.861,6.076,10.921 c0.175,0.618,1.14,0.356,0.964-0.266c-0.979-3.458-2.622-6.687-4.807-9.525c0.226,0.111,0.447,0.23,0.667,0.351 c0.89,0.645,1.696,1.398,2.41,2.266c2.604,3.165,4.51,7.217,4.466,11.374c-0.48-0.132-0.987-0.179-1.475-0.126 c-1.111,0.12-2.298,0.619-2.794,1.691C37.096,24.897,37.14,25.191,37.389,25.337z M30.821,28.299c0.005-0.006,0,0,0.009-0.01 c0.022-0.027,0.014-0.018,0.013-0.018c0.012-0.009,0.038-0.03,0.078-0.064c-0.039,0.025-0.07,0.061-0.101,0.095 C30.82,28.301,30.821,28.3,30.821,28.299z"></path>
</svg>`
        },
        label: {
            en_US: 'Ralph Loop',
            zh_Hans: 'Ralph 循环'
        },
        description: {
            en_US: 'Automatically retries an agent from a clean message context until it emits the Ralph Loop completion promise.',
            zh_Hans: '从干净的消息上下文中自动重试智能体，直到它发出 Ralph Loop 完成承诺。'
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
                        zh_Hans: '最大迭代次数'
                    },
                    description: {
                        en_US: 'Maximum number of automatic clean-context retries.',
                        zh_Hans: '自动干净上下文重试的最大次数。'
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

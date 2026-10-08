// Only complete current tool rounds can introduce visual input. Historical bytes
// are removed from outbound clones, never from durable messages or checkpoints.
import { isAIMessage, isToolMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { ToolCall } from '@langchain/core/messages/tool'
import { BadRequestException } from '@nestjs/common'
import type { ToolOutputPresentation } from '@xpert-ai/chatkit-types'
import { t } from 'i18next'

/** Host-owned operation contracts may explicitly allow a validated text receipt. */
export type ToolImageTextResultPolicy = (call: ToolCall, content: string) => boolean

export function textOnlyToolMessages(
    messages: readonly BaseMessage[],
    toolNames: readonly string[],
    policy?: ToolImageTextResultPolicy
): Set<ToolMessage> {
    const results = new Set<ToolMessage>()
    if (!policy) return results
    const names = new Set(toolNames)
    let calls = new Map<string, ToolCall>()
    for (const message of messages) {
        if (!isToolMessage(message)) {
            calls = new Map(
                isAIMessage(message)
                    ? (message.tool_calls ?? []).flatMap((call) => (call.id ? [[call.id, call] as const] : []))
                    : []
            )
            continue
        }
        const call = calls.get(message.tool_call_id)
        if (
            call &&
            names.has(call.name) &&
            message.name === call.name &&
            message.artifact == null &&
            typeof message.content === 'string' &&
            !hasLegacyImageContent(message) &&
            policy(call, message.content)
        ) {
            results.add(message)
        }
    }
    return results
}

export function readyImageMessages(messages: readonly BaseMessage[], toolNames: readonly string[]): ToolMessage[] {
    const names = new Set(toolNames)
    const trailing: ToolMessage[] = []
    let index = messages.length - 1
    while (index >= 0 && isToolMessage(messages[index])) trailing.unshift(messages[index--] as ToolMessage)
    const previous = messages[index]
    const calls = previous && isAIMessage(previous) ? (previous.tool_calls ?? []) : []
    if (!trailing.some((message) => names.has(message.name ?? '')) && !calls.some((call) => names.has(call.name)))
        return []
    // An AI request without replies is not yet a model continuation.
    if (!trailing.length) return []
    const expected = new Map(calls.map((call) => [call.id, call]))
    const received = new Map(trailing.map((message) => [message.tool_call_id, message]))
    if (
        !calls.length ||
        calls.some((call) => !call.id) ||
        expected.size !== calls.length ||
        received.size !== trailing.length ||
        expected.size !== received.size ||
        trailing.some((message) => {
            const call = expected.get(message.tool_call_id)
            return (
                !call ||
                (message.name !== undefined && message.name !== call.name) ||
                (names.has(call.name) && message.name !== call.name)
            )
        })
    ) {
        throw new BadRequestException(
            t('server-ai:Error.ToolImageRoundIncomplete', {
                defaultValue:
                    'The image tool round is incomplete or its call identities do not match. Retry the image tools.'
            })
        )
    }
    return trailing.filter((message) => names.has(message.name ?? '') && message.status !== 'error')
}

/** Explicit fields avoid copying lc_kwargs, which can retain legacy Base64 despite replacing content. */
export function imageToolMessageForModel(message: ToolMessage, presentation?: ToolOutputPresentation): ToolMessage {
    let content: string
    if (typeof message.content === 'string') {
        content =
            (presentation || message.status === 'error') && !containsInlineImage(message.content)
                ? message.content
                : historicalImageNotice()
    } else {
        content =
            message.content
                .flatMap((part) =>
                    part.type === 'text' && typeof part.text === 'string' && !containsInlineImage(part.text)
                        ? [part.text]
                        : []
                )
                .join('\n') || historicalImageNotice()
    }
    return new ToolMessage({
        content,
        id: message.id,
        name: message.name,
        tool_call_id: message.tool_call_id,
        status: message.status,
        artifact: presentation
    })
}

export function hasLegacyImageContent(message: ToolMessage): boolean {
    return typeof message.content === 'string'
        ? containsInlineImage(message.content)
        : message.content.some(
              (part) => part.type !== 'text' || typeof part.text !== 'string' || containsInlineImage(part.text)
          )
}

function containsInlineImage(text: string) {
    return /data:image\//i.test(text)
}

function historicalImageNotice() {
    return t('server-ai:ToolImage.HistoricalReference', {
        defaultValue:
            'Historical image output is not current visual input. Call the image tool again before inspecting it.'
    })
}

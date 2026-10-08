import {
    IChatMessage,
    STATE_VARIABLE_HUMAN,
    TChatRequest,
    TChatRequestHuman,
    TInterruptCommand,
    TXpertChatResumeRequest,
    TXpertChatRetryRequest
} from '@xpert-ai/contracts'
export function toInterruptCommand(request: TXpertChatResumeRequest): TInterruptCommand | null {
    const command: TInterruptCommand = {}
    if (request.decision.type === 'confirm') {
        command.resume = request.decision.payload ?? {}
    } else if (request.decision.payload !== undefined) {
        command.resume = request.decision.payload
    }
    if (request.patch?.toolCalls?.length) {
        command.toolCalls = request.patch.toolCalls
    }
    if (request.patch?.update !== undefined) {
        command.update = request.patch.update
    }
    if (request.patch?.agentKey) {
        command.agentKey = request.patch.agentKey
    }

    return Object.keys(command).length ? command : null
}

export function shouldRejectResumeWithGraph(request: TChatRequest): boolean {
    return request.action === 'resume' && request.decision.type === 'reject' && request.decision.payload === undefined
}

export function resolveRetryHumanInput(sourceInputs: unknown, fallbackInput: TChatRequestHuman): TChatRequestHuman {
    const retryInput = extractRetryHumanInput(sourceInputs)

    if (typeof retryInput === 'string') {
        return {
            ...fallbackInput,
            input: retryInput.trim().length ? retryInput : fallbackInput.input
        }
    }

    if (!isChatRequestHumanRecord(retryInput)) {
        return fallbackInput
    }

    const mergedInput: TChatRequestHuman = {
        ...fallbackInput,
        ...retryInput
    }

    if (typeof mergedInput.input !== 'string' || !mergedInput.input.trim().length) {
        mergedInput.input = fallbackInput.input
    }

    if ((!Array.isArray(mergedInput.files) || !mergedInput.files.length) && Array.isArray(fallbackInput.files)) {
        mergedInput.files = fallbackInput.files
    }

    return mergedInput
}

function extractRetryHumanInput(sourceInputs: unknown): unknown {
    if (isChatRequestHumanRecord(sourceInputs) && isChatRequestHumanRecord(sourceInputs[STATE_VARIABLE_HUMAN])) {
        return sourceInputs[STATE_VARIABLE_HUMAN]
    }

    return sourceInputs
}

function isChatRequestHumanRecord(value: unknown): value is TChatRequestHuman {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function resolveConversationRetrySourceMessageId(
    request: TXpertChatRetryRequest,
    messages?: IChatMessage[] | null
): string | null {
    return request.source.aiMessageId ?? findLastAiMessageId(messages) ?? null
}

export function resolveConversationResumeTargetMessageId(
    request: TXpertChatResumeRequest,
    messages?: IChatMessage[] | null
): string | null {
    return request.target.aiMessageId ?? findLastAiMessageId(messages) ?? null
}

function findLastAiMessageId(messages?: IChatMessage[] | null): string | null {
    if (!messages?.length) {
        return null
    }

    const message = [...messages].reverse().find((item) => item?.role === 'ai')
    return message?.id ?? null
}

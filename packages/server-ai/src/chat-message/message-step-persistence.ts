import { IChatMessage, TChatMessageStep } from '@xpert-ai/contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeRecordForPersistence<T extends Record<string, unknown>>(value: T): T {
    const sanitized = { ...value } as Record<string, unknown>
    delete sanitized.appInstanceToken

    if (isRecord(sanitized.data)) {
        sanitized.data = sanitizeRecordForPersistence(sanitized.data)
    }

    return sanitized as T
}

export function sanitizeMessageContentForPersistence<T>(content: T): T {
    if (Array.isArray(content)) {
        return content.map((item) => sanitizeMessageContentForPersistence(item)) as T
    }

    if (isRecord(content)) {
        return sanitizeRecordForPersistence(content) as T
    }

    return content
}

export function sanitizeMessageStepForPersistence<T extends TChatMessageStep>(step: T): T {
    return sanitizeMessageContentForPersistence(step)
}

export function appendMessageSteps(aiMessage: IChatMessage, steps: TChatMessageStep[]) {
    aiMessage.events ??= []
    steps.forEach((item) => {
        const sanitizedItem = sanitizeMessageStepForPersistence(item)
        if (sanitizedItem.id) {
            const index = aiMessage.events.findIndex((_) => _.id === sanitizedItem.id)
            if (index > -1) {
                aiMessage.events[index] = sanitizeMessageStepForPersistence({
                    ...aiMessage.events[index],
                    ...sanitizedItem
                })
                return
            }
        }
        aiMessage.events.push(sanitizedItem)
    })
}

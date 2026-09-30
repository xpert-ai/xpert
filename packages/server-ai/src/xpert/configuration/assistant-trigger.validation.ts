import { BadRequestException } from '@nestjs/common'
import type { AssistantTriggerConfig, AssistantTriggerMutation, AssistantTriggerValue } from '@xpert-ai/contracts'
import { t } from 'i18next'

export function invalidTrigger(): never {
    throw new BadRequestException(t('server-ai:Error.AssistantTriggerInvalid'))
}

export function parseTriggerValue(value: unknown, depth = 0): AssistantTriggerValue {
    if (depth > 8) return invalidTrigger()
    if (value === null) return null
    if (typeof value === 'boolean' || typeof value === 'string') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (Array.isArray(value)) return value.map((item) => parseTriggerValue(item, depth + 1))
    if (!value || typeof value !== 'object') return invalidTrigger()
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) return invalidTrigger()
            return [key, parseTriggerValue(item, depth + 1)]
        })
    )
}

export function parseTriggerConfig(value: unknown): AssistantTriggerConfig {
    const parsed = parseTriggerValue(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalidTrigger()
    if (
        parsed.additionalInstructions !== undefined &&
        (typeof parsed.additionalInstructions !== 'string' || parsed.additionalInstructions.length > 8000)
    )
        return invalidTrigger()
    return parsed
}

export function parseTriggerMutation(value: unknown): AssistantTriggerMutation {
    if (
        !value ||
        typeof value !== 'object' ||
        !('revision' in value) ||
        typeof value.revision !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.revision) ||
        !('provider' in value) ||
        typeof value.provider !== 'string' ||
        !/^[\w.-]{1,100}$/.test(value.provider) ||
        value.provider === 'chat' ||
        !('operation' in value)
    )
        return invalidTrigger()
    const base = { revision: value.revision, provider: value.provider }
    if (value.operation === 'delete') return { ...base, operation: 'delete' }
    if (value.operation === 'toggle' && 'enabled' in value && typeof value.enabled === 'boolean')
        return { ...base, operation: 'toggle', enabled: value.enabled }
    if (
        value.operation !== 'save' ||
        !('title' in value) ||
        typeof value.title !== 'string' ||
        !value.title.trim() ||
        value.title.length > 120 ||
        !('config' in value)
    )
        return invalidTrigger()
    const config = parseTriggerConfig(value.config)
    if (JSON.stringify(config).length > 12000) return invalidTrigger()
    return { ...base, operation: 'save', title: value.title.trim(), config }
}

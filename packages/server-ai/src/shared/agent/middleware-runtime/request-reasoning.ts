import {
    normalizeModelParameterValue,
    ParameterType,
    type ICopilotModel,
    type ModelExecutionParameters,
    type ParameterRule
} from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

export interface RequestReasoningControls {
    enableThinking?: boolean
    reasoningEffort?: ModelExecutionParameters['reasoning_effort']
}

/** Native effort levels take precedence; boolean-only providers use none/off versus non-none/on. */
export function resolveRequestReasoningOptions(
    saved: ICopilotModel['options'],
    rules: ParameterRule[],
    { enableThinking, reasoningEffort }: RequestReasoningControls
): ICopilotModel['options'] {
    if (enableThinking === undefined && reasoningEffort === undefined) return saved
    const options = { ...saved }
    const supportsThinking = rules.some(
        (rule) => rule.name === 'enable_thinking' && rule.type === ParameterType.BOOLEAN
    )
    if (reasoningEffort !== undefined) {
        const nativeEffort = rules.find((rule) => rule.name === 'reasoning_effort')
        if (nativeEffort) {
            if (
                ![ParameterType.STRING, ParameterType.TEXT].includes(nativeEffort.type) ||
                normalizeModelParameterValue(reasoningEffort, nativeEffort) !== reasoningEffort
            ) {
                throw unsupportedEffort()
            }
            options.reasoning_effort = reasoningEffort
        } else if (supportsThinking) {
            // The compatibility alias must not leak to a provider that only accepts enable_thinking.
            delete options.reasoning_effort
            enableThinking = reasoningEffort !== 'none'
        } else {
            throw unsupportedEffort()
        }
    }
    if (enableThinking !== undefined) {
        if (!supportsThinking) {
            throw new BadRequestException(
                t('server-ai:Error.ModelThinkingUnsupported', {
                    defaultValue: 'This model does not declare support for request-controlled thinking.'
                })
            )
        }
        options.enable_thinking = enableThinking
    }
    return options
}

function unsupportedEffort() {
    return new BadRequestException(
        t('server-ai:Error.ModelReasoningEffortUnsupported', {
            defaultValue: 'This model does not support the requested reasoning_effort.'
        })
    )
}

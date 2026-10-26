// Invariants: only typed tuning fields cross into a grant; credentials and provider configuration never do.
// Explicit request values override the snapshot, provider defaults fill gaps, and retries remain host-owned.
import {
    isOutputTokenParameter,
    modelExecutionParametersSchema,
    resolveModelParameterOptions,
    type ModelExecutionParameters,
    type ParameterRule
} from '@xpert-ai/contracts'
import type { NativeModelBody, NativeModelProtocol } from '@xpert-ai/plugin-sdk'
import type { OpenAIChatRequest } from '../model-gateway/openai-adapter'
import { executionError } from './execution-errors'

const savedParameters = modelExecutionParametersSchema
    .extend({
        max_completion_tokens: modelExecutionParametersSchema.shape.max_tokens,
        max_output_tokens: modelExecutionParametersSchema.shape.max_tokens,
        max_tokens_to_sample: modelExecutionParametersSchema.shape.max_tokens
    })
    .strip()

/** Read saved Assistant options at the persistence boundary; never copy arbitrary provider options. */
export function snapshotExecutionParameters(options: unknown): ModelExecutionParameters | undefined {
    if (options == null) return undefined
    const parsed = savedParameters.safeParse(options)
    if (!parsed.success) throw executionError('ParametersUnsupported')
    const { max_completion_tokens, max_output_tokens, max_tokens_to_sample, ...parameters } = parsed.data
    const output = max_completion_tokens ?? max_output_tokens ?? max_tokens_to_sample ?? parameters.max_tokens
    if (output !== undefined) parameters.max_tokens = output
    const defined = Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== undefined))
    return Object.keys(defined).length ? modelExecutionParametersSchema.parse(defined) : undefined
}

export function executionChatParameters(
    parameters: ModelExecutionParameters | undefined,
    request: OpenAIChatRequest['options']
) {
    const effective = { ...parameters }
    for (const key of [
        'temperature',
        'top_p',
        'max_tokens',
        'presence_penalty',
        'frequency_penalty',
        'seed'
    ] as const) {
        if (request[key] !== undefined) effective[key] = request[key]
    }
    return effective
}

/** Resolve aliases before defaults so a provider's max_completion_tokens cannot shadow requested max_tokens. */
export function resolveExecutionModelOptions(options: Record<string, unknown> | undefined, rules: ParameterRule[]) {
    const parameters = snapshotExecutionParameters(options) ?? {}
    const { max_tokens: output, ...tuning } = parameters
    for (const key of Object.keys(tuning)) {
        // Seed is a standard Chat invocation option, even on providers without a catalog rule for it.
        if (key !== 'seed' && !rules.some((rule) => rule.name === key)) throw executionError('ParametersUnsupported')
    }
    const input: Record<string, unknown> = { ...tuning }
    const outputRules = rules.filter(isOutputTokenParameter)
    if (output !== undefined) {
        if (!outputRules.length) input.max_tokens = output
        for (const rule of outputRules) input[rule.name] = output
    }
    const resolved = resolveModelParameterOptions(input, rules)
    // Admission reserved this exact output value; a provider minimum must not silently expand it.
    if (output !== undefined && outputRules.some((rule) => resolved?.[rule.name] !== output))
        throw executionError('ParametersUnsupported')
    return {
        ...resolved,
        ...(typeof options?.context_size === 'number' ? { context_size: options.context_size } : {}),
        maxRetries: 0
    }
}

/** Native protocols have different tuning fields; reject unmappable settings instead of silently dropping them. */
export function inheritNativeParameters(
    request: NativeModelBody,
    protocol: NativeModelProtocol,
    parameters?: ModelExecutionParameters
) {
    if (!parameters) return
    const supported = new Set(['temperature', 'top_p', 'max_tokens'])
    if (protocol === 'openai_responses') supported.add('reasoning_effort')
    else for (const key of ['top_k', 'thinking', 'budget_tokens']) supported.add(key)
    if (Object.keys(parameters).some((key) => !supported.has(key))) throw executionError('ParametersUnsupported')
    for (const key of ['temperature', 'top_p'] as const) {
        if (request[key] === undefined && parameters[key] !== undefined) request[key] = parameters[key]
    }
    const outputKey = protocol === 'openai_responses' ? 'max_output_tokens' : 'max_tokens'
    if (request[outputKey] === undefined && parameters.max_tokens !== undefined)
        request[outputKey] = parameters.max_tokens
    if (protocol === 'openai_responses') {
        if (parameters.reasoning_effort !== undefined) {
            const reasoning = request.reasoning
            if (typeof reasoning === 'object' && reasoning && !Array.isArray(reasoning))
                request.reasoning = { effort: parameters.reasoning_effort, ...reasoning }
            else if (reasoning === undefined) request.reasoning = { effort: parameters.reasoning_effort }
            else throw executionError('ParametersUnsupported')
        }
    } else {
        if (request.top_k === undefined && parameters.top_k !== undefined) request.top_k = parameters.top_k
        if (request.thinking === undefined && parameters.thinking !== undefined) {
            request.thinking = {
                type: parameters.thinking,
                ...(parameters.thinking === 'enabled' && parameters.budget_tokens !== undefined
                    ? { budget_tokens: parameters.budget_tokens }
                    : {})
            }
        }
        if (parameters.budget_tokens !== undefined && parameters.thinking === undefined)
            throw executionError('ParametersUnsupported')
    }
}

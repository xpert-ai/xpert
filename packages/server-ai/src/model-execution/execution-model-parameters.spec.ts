import { ParameterType, type ParameterRule, type ModelExecutionParameters } from '@xpert-ai/contracts'
import type { NativeModelBody } from '@xpert-ai/plugin-sdk'
import { executionError } from './execution-errors'
import {
    executionChatParameters,
    inheritNativeParameters,
    resolveExecutionModelOptions,
    snapshotExecutionParameters
} from './execution-model-parameters'

const rules: ParameterRule[] = [
    { label: { en_US: 'Parameter' }, name: 'temperature', type: ParameterType.FLOAT, default: 0.2 },
    { label: { en_US: 'Parameter' }, name: 'top_p', type: ParameterType.FLOAT, default: 0.8 },
    { label: { en_US: 'Parameter' }, name: 'enable_thinking', type: ParameterType.BOOLEAN, default: false },
    { label: { en_US: 'Parameter' }, name: 'thinking_budget', type: ParameterType.INT, default: 2048, min: 0 },
    { label: { en_US: 'Parameter' }, name: 'max_completion_tokens', type: ParameterType.INT, default: 8192 },
    { label: { en_US: 'Parameter' }, name: 'maxRetries', type: ParameterType.INT, default: 6 }
]

describe('execution tuning boundaries', () => {
    it('carries explicit unset values through snapshots and omits them from provider options', () => {
        const saved = snapshotExecutionParameters({
            temperature: null,
            top_p: null,
            max_completion_tokens: null,
            enable_thinking: false
        })
        expect(saved).toEqual({ temperature: null, top_p: null, max_tokens: null, enable_thinking: false })
        const options = resolveExecutionModelOptions(executionChatParameters(saved, {}), rules)
        expect(options).not.toHaveProperty('temperature')
        expect(options).not.toHaveProperty('top_p')
        expect(options).not.toHaveProperty('max_completion_tokens')
        expect(options).toMatchObject({ enable_thinking: false, maxRetries: 0 })
        expect(resolveExecutionModelOptions(executionChatParameters(saved, { temperature: 0 }), rules)).toMatchObject({
            temperature: 0
        })
    })

    it('omits unset parameters from native requests without rejecting unsupported unset fields', () => {
        const request: NativeModelBody = {}
        inheritNativeParameters(request, 'openai_responses', {
            temperature: null,
            max_tokens: null,
            enable_thinking: null,
            reasoning_effort: null
        })
        expect(request).toEqual({})
    })

    it('overrides captured reasoning effort without mutating the snapshot', () => {
        const saved: ModelExecutionParameters = Object.freeze({ reasoning_effort: 'high', max_tokens: 8192 })
        expect(executionChatParameters(saved, { reasoning_effort: 'none' })).toEqual({
            reasoning_effort: 'none',
            max_tokens: 8192
        })
        expect(executionChatParameters(saved, {})).toEqual(saved)
        expect(saved.reasoning_effort).toBe('high')
    })
    it('overrides thinking per request without mutating the execution snapshot', () => {
        const saved = { enable_thinking: true, max_tokens: 8192 }
        expect(executionChatParameters(saved, { enable_thinking: false })).toEqual({
            enable_thinking: false,
            max_tokens: 8192
        })
        expect(executionChatParameters(saved, {})).toEqual(saved)
        expect(saved.enable_thinking).toBe(true)
    })

    it('does not increase a reserved output value to a provider minimum', () => {
        expect(() =>
            resolveExecutionModelOptions({ max_tokens: 1 }, [
                { name: 'max_completion_tokens', label: { en_US: 'Output' }, type: ParameterType.INT, min: 64 }
            ])
        ).toThrow(executionError('ParametersUnsupported'))
    })
    it('keeps only typed non-secret settings and canonicalizes output aliases', () => {
        expect(
            snapshotExecutionParameters({
                enable_thinking: false,
                temperature: 0,
                max_completion_tokens: 12345,
                max_tokens: 8192,
                api_key: 'secret',
                extra_headers: '{"Authorization":"secret"}',
                configuration: { baseURL: 'https://untrusted.example' },
                modelKwargs: { credentials: 'secret' },
                maxRetries: 9,
                context_size: 1000000,
                top_p: undefined
            })
        ).toEqual({ enable_thinking: false, temperature: 0, max_tokens: 12345 })
        expect(snapshotExecutionParameters({ api_key: 'secret' })).toBeUndefined()
        expect(snapshotExecutionParameters(undefined)).toBeUndefined()
        expect(() => snapshotExecutionParameters({ temperature: { api_key: 'secret' } })).toThrow(
            executionError('ParametersUnsupported')
        )
    })

    it('preserves false and zero, supplies defaults only for absent settings and forces zero retries', () => {
        expect(
            resolveExecutionModelOptions(
                { enable_thinking: false, temperature: 0, thinking_budget: 0, maxRetries: 9 },
                rules
            )
        ).toEqual({
            enable_thinking: false,
            temperature: 0,
            thinking_budget: 0,
            top_p: 0.8,
            max_completion_tokens: 8192,
            maxRetries: 0
        })
    })

    it('overrides the canonical output before provider defaults and maps every declared output alias', () => {
        const effective = executionChatParameters(
            { temperature: 0.6, max_tokens: 12345, enable_thinking: true },
            { max_tokens: 4567, temperature: 0, top_p: undefined }
        )
        const options = resolveExecutionModelOptions(effective, [
            ...rules,
            { label: { en_US: 'Parameter' }, name: 'max_tokens', type: ParameterType.INT, default: 512 }
        ])
        expect(options).toMatchObject({
            max_tokens: 4567,
            max_completion_tokens: 4567,
            temperature: 0,
            enable_thinking: true,
            maxRetries: 0
        })
    })

    it('rejects configured parameters missing from the provider rules instead of silently dropping them', () => {
        expect(() => resolveExecutionModelOptions({ enable_thinking: true }, [])).toThrow(
            executionError('ParametersUnsupported')
        )
    })

    it('maps native Responses parameters without overwriting explicit request values', () => {
        const request: NativeModelBody = { temperature: 0, max_output_tokens: 4567, reasoning: { summary: 'auto' } }
        inheritNativeParameters(request, 'openai_responses', {
            temperature: 0.6,
            top_p: 0.37,
            max_tokens: 12345,
            reasoning_effort: 'high'
        })
        expect(request).toEqual({
            temperature: 0,
            top_p: 0.37,
            max_output_tokens: 4567,
            reasoning: { effort: 'high', summary: 'auto' }
        })
        inheritNativeParameters(request, 'openai_responses', { reasoning_effort: 'low' })
        expect(request.reasoning).toMatchObject({ effort: 'high' })
    })

    it('maps native Messages thinking and preserves an explicit disabled request', () => {
        const request: NativeModelBody = {}
        inheritNativeParameters(request, 'anthropic_messages', {
            max_tokens: 12345,
            thinking: 'enabled',
            budget_tokens: 4096,
            top_k: 0
        })
        expect(request).toEqual({ max_tokens: 12345, top_k: 0, thinking: { type: 'enabled', budget_tokens: 4096 } })
        request.thinking = { type: 'disabled' }
        inheritNativeParameters(request, 'anthropic_messages', { thinking: 'enabled', budget_tokens: 4096 })
        expect(request.thinking).toEqual({ type: 'disabled' })
    })

    it('rejects incompatible native parameters before any provider call', () => {
        expect(() => inheritNativeParameters({}, 'openai_responses', { enable_thinking: true })).toThrow(
            executionError('ParametersUnsupported')
        )
        expect(() => inheritNativeParameters({}, 'anthropic_messages', { reasoning_effort: 'high' })).toThrow(
            executionError('ParametersUnsupported')
        )
    })
})

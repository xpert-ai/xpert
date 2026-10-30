import { BadRequestException } from '@nestjs/common'
import { modelExecutionParametersSchema, ParameterType, type ParameterRule } from '@xpert-ai/contracts'
import { resolveRequestReasoningOptions } from './request-reasoning'

const thinkingRule: ParameterRule = {
    name: 'enable_thinking',
    type: ParameterType.BOOLEAN,
    label: { en_US: 'Thinking' },
    default: true
}
const effortRule: ParameterRule = {
    name: 'reasoning_effort',
    type: ParameterType.STRING,
    label: { en_US: 'Effort' },
    options: ['low', 'medium', 'high'],
    default: 'medium'
}

describe('request reasoning controls against declared model parameters', () => {
    it.each(modelExecutionParametersSchema.shape.reasoning_effort.unwrap().options)(
        'maps %s to a declared boolean without forwarding the alias or mutating saved options',
        (reasoningEffort) => {
            const enabled = reasoningEffort !== 'none'
            const saved = Object.freeze({ enable_thinking: !enabled, reasoning_effort: 'high', temperature: 0 })
            expect(resolveRequestReasoningOptions(saved, [thinkingRule], { reasoningEffort })).toEqual({
                enable_thinking: enabled,
                temperature: 0
            })
            expect(saved).toEqual({ enable_thinking: !enabled, reasoning_effort: 'high', temperature: 0 })
        }
    )

    it('preserves omitted controls and native effort values', () => {
        const saved = Object.freeze({ reasoning_effort: 'medium', temperature: 0 })
        expect(resolveRequestReasoningOptions(saved, [effortRule], {})).toEqual(saved)
        expect(resolveRequestReasoningOptions(saved, [effortRule], { reasoningEffort: 'low' })).toEqual({
            reasoning_effort: 'low',
            temperature: 0
        })
        expect(saved.reasoning_effort).toBe('medium')
        expect(resolveRequestReasoningOptions(undefined, [thinkingRule], {})).toBeUndefined()
    })

    it('does not fall back to boolean thinking when a native level is unsupported', () => {
        expect(() =>
            resolveRequestReasoningOptions({}, [effortRule, thinkingRule], { reasoningEffort: 'none' })
        ).toThrow(BadRequestException)
    })

    it('keeps consistent explicit controls for a model declaring both parameters', () => {
        expect(
            resolveRequestReasoningOptions({}, [effortRule, thinkingRule], {
                enableThinking: true,
                reasoningEffort: 'high'
            })
        ).toEqual({ enable_thinking: true, reasoning_effort: 'high' })
    })

    it.each([
        { label: 'missing controls', rules: [] },
        { label: 'a non-boolean thinking rule', rules: [{ ...thinkingRule, type: ParameterType.STRING }] },
        {
            label: 'an invalid native effort rule',
            rules: [{ ...effortRule, type: ParameterType.BOOLEAN }, thinkingRule]
        }
    ])('rejects $label', ({ rules }) => {
        expect(() => resolveRequestReasoningOptions({}, rules, { reasoningEffort: 'high' })).toThrow(
            BadRequestException
        )
    })
})

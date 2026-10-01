jest.mock('./assistant-configuration.service', () => ({ AssistantConfigurationService: class {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { parseAssistantConfiguration, parseCapabilityDraftInput } from './assistant-configuration.controller'

describe('Assistant configuration request boundary', () => {
    const valid = { revision: 'a'.repeat(64), prompt: '', modelId: 'provider/model', capabilities: [] }
    it('accepts empty instructions and deduplicates only stable capability keys', () => {
        expect(parseAssistantConfiguration({ ...valid, capabilities: ['desktop-shell', 'desktop-shell'] })).toEqual({
            ...valid,
            capabilities: ['desktop-shell']
        })
    })
    it('rejects invalid revisions, oversized prompts, missing models and malformed capabilities', () => {
        for (const input of [
            null,
            {},
            { ...valid, revision: '' },
            { ...valid, prompt: 'x'.repeat(32001) },
            { ...valid, modelId: '' },
            { ...valid, capabilities: 'desktop-shell' },
            { ...valid, capabilities: [5] }
        ]) {
            expect(() => parseAssistantConfiguration(input)).toThrow()
        }
    })
})

describe('Capability preview request boundary', () => {
    it('accepts typed provider configuration, never an injected graph or publish flag', () => {
        expect(
            parseCapabilityDraftInput({
                revision: 'a'.repeat(64),
                capabilities: ['desktop-shell', 'desktop-shell'],
                sandboxProvider: 'sandbox-a',
                publish: true,
                draft: {}
            })
        ).toEqual({ revision: 'a'.repeat(64), capabilities: ['desktop-shell'], sandboxProvider: 'sandbox-a' })
        for (const input of [
            null,
            {},
            { revision: 'invalid', capabilities: [] },
            { revision: 'a'.repeat(64), capabilities: [], sandboxProvider: {} },
            { revision: 'a'.repeat(64), capabilities: [], sandboxProvider: 'x'.repeat(201) },
            { revision: 'a'.repeat(64), capabilities: [5] }
        ])
            expect(() => parseCapabilityDraftInput(input)).toThrow()
    })
})

jest.mock('./assistant-configuration.service', () => ({ AssistantConfigurationService: class {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { parseAssistantConfiguration } from './assistant-configuration.controller'

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

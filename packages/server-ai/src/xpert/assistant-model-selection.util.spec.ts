import { AiModelTypeEnum } from '@xpert-ai/contracts'
import {
    getAssistantModelId,
    normalizeAssistantAllowedModels,
    sanitizeAssistantCopilotModel,
    sanitizeAssistantModelSnapshot
} from './assistant-model-selection.util'

describe('Assistant model selection utilities', () => {
    const primary = {
        copilotId: 'provider-openai',
        modelType: AiModelTypeEnum.LLM as const,
        model: 'gpt-primary',
        options: { temperature: 0.2 }
    }

    it('generates stable ids without including runtime options', () => {
        const first = getAssistantModelId(primary)
        const second = getAssistantModelId(
            sanitizeAssistantCopilotModel({ ...primary, options: { temperature: 0.9 } })!
        )

        expect(first).toMatch(/^mdl_[A-Za-z0-9_-]{43}$/)
        expect(second).toBe(first)
    })

    it('preserves author order while removing the Primary and duplicate models', () => {
        const fast = {
            copilotId: 'provider-openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-fast',
            options: { temperature: 0 }
        }
        const reasoning = {
            copilotId: 'provider-anthropic',
            modelType: AiModelTypeEnum.LLM,
            model: 'claude-reasoning'
        }

        expect(normalizeAssistantAllowedModels(primary, [fast, primary, fast, reasoning])).toEqual([fast, reasoning])
    })

    it('rejects non-LLM and incomplete models', () => {
        expect(
            sanitizeAssistantCopilotModel({
                copilotId: 'provider-openai',
                modelType: AiModelTypeEnum.TEXT_EMBEDDING,
                model: 'embedding'
            })
        ).toBeNull()
        expect(sanitizeAssistantCopilotModel({ ...primary, model: '' })).toBeNull()
    })

    it('scrubs nested credentials from execution snapshots', () => {
        expect(
            sanitizeAssistantModelSnapshot({
                ...primary,
                options: {
                    temperature: 0.4,
                    apiKey: 'secret',
                    transport: { authorization: 'Bearer secret', timeout: 10 },
                    endpoints: [{ url: 'https://example.com', token: 'nested-secret' }]
                }
            }).options
        ).toEqual({
            temperature: 0.4,
            transport: { timeout: 10 },
            endpoints: [{ url: 'https://example.com' }]
        })
    })
})

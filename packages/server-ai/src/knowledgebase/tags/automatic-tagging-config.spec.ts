import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { prepareAutomaticTaggingConfig } from './automatic-tagging-config'

describe('automatic tagging persisted configuration', () => {
    it('normalizes caps and keeps expanded provider data out of storage', () => {
        expect(
            prepareAutomaticTaggingConfig({
                enabled: true,
                maxTags: 99,
                model: {
                    copilotId: 'provider',
                    model: 'chat',
                    modelType: AiModelTypeEnum.LLM,
                    copilot: { credentials: 'not-a-descriptor' },
                    options: { temperature: 1 }
                }
            })
        ).toEqual({
            enabled: true,
            maxTags: 10,
            confidenceThreshold: 0.7,
            allowWithManualTags: false,
            model: {
                copilotId: 'provider',
                model: 'chat',
                modelType: AiModelTypeEnum.LLM,
                options: { temperature: 0, max_tokens: 1024 }
            }
        })
    })
    it('rejects invalid model descriptors instead of silently falling back to another paid model', () => {
        expect(() =>
            prepareAutomaticTaggingConfig({ enabled: true, model: { modelType: AiModelTypeEnum.TEXT_EMBEDDING } })
        ).toThrow()
        expect(() => prepareAutomaticTaggingConfig('enabled')).toThrow()
        expect(prepareAutomaticTaggingConfig(null)).toBeNull()
    })
})

import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { assertPlatformModelRequirements } from './platform-model-requirements'
import type { PlatformModels } from './platform-models.service'

describe('managed application model preflight', () => {
    const image = { provider: 'provider', model: 'image-v2', modelType: AiModelTypeEnum.IMAGE }
    const model: PlatformModels = {
        primary: { copilotId: 'primary', model: 'chat', modelType: AiModelTypeEnum.LLM },
        auxiliary: [{ copilotId: 'primary', ...image }],
        billingModels: [{ copilotId: 'primary', ...image }]
    }
    it('requires the exact model actually used by the App tool', () => {
        expect(() => assertPlatformModelRequirements(model, { auxiliary: [image] })).not.toThrow()
        for (const mismatch of [{ model: 'image-v1' }, { provider: 'other' }, { modelType: AiModelTypeEnum.LLM }])
            expect(() => assertPlatformModelRequirements(model, { auxiliary: [{ ...image, ...mismatch }] })).toThrow()
    })
    it.each(['embedding', 'vision', 'speechToText'] as const)(
        'does not initialize with an implicit default for required %s',
        (key) => {
            expect(() => assertPlatformModelRequirements(model, { [key]: true })).toThrow()
            expect(() =>
                assertPlatformModelRequirements({ ...model, [`${key}ModelId`]: 'configured' }, { [key]: true })
            ).not.toThrow()
        }
    )
})

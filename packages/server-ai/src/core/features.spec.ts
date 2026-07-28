import { AiFeatureEnum } from '@xpert-ai/contracts'
import { DEFAULT_FEATURES } from './features'

describe('AI default features', () => {
    it('keeps personal model access disabled as a direct Copilot feature by default', () => {
        const modelAccess = DEFAULT_FEATURES.flatMap((feature) => feature.children ?? []).find(
            (feature) => feature.code === AiFeatureEnum.FEATURE_MODEL_ACCESS_REQUEST
        )

        expect(modelAccess).toMatchObject({
            code: AiFeatureEnum.FEATURE_MODEL_ACCESS_REQUEST,
            isEnabled: false
        })
    })

    it('keeps the external model gateway disabled by default', () => {
        const gateway = DEFAULT_FEATURES.flatMap((feature) => feature.children ?? []).find(
            (feature) => feature.code === AiFeatureEnum.FEATURE_MODEL_GATEWAY
        )

        expect(gateway).toMatchObject({
            code: AiFeatureEnum.FEATURE_MODEL_GATEWAY,
            isEnabled: false
        })
    })
})

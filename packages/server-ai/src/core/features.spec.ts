import { AiFeatureEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
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

    it('uses configured URLs for external Xpert applications', () => {
        const xpertFeatures = DEFAULT_FEATURES.flatMap((feature) => feature.children ?? [])

        expect(xpertFeatures.find((feature) => feature.code === AiFeatureEnum.FEATURE_XPERT_CODEXPERT)?.link).toBe(
            environment.codeXpertUrl
        )
        expect(xpertFeatures.find((feature) => feature.code === AiFeatureEnum.FEATURE_XPERT_DEEP_RESEARCH)?.link).toBe(
            environment.deepResearchUrl
        )
        expect(xpertFeatures.find((feature) => feature.code === AiFeatureEnum.FEATURE_XPERT_DATA_ONTOLOGY)?.link).toBe(
            environment.dataOntologyUrl
        )
    })
})

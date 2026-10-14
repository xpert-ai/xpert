import { HumanMessage } from '@langchain/core/messages'
import { AiModelTypeEnum, defaultModelConfiguration, FetchFrom, ModelFeature } from '@xpert-ai/contracts'
import { prepareMessagesForModel, resolveModelVisionSupport, setModelVisionSupport } from './model-capabilities'

describe('model capabilities', () => {
    it('honors edited imported vision support over legacy flags in both directions', () => {
        const configuration = defaultModelConfiguration(AiModelTypeEnum.LLM)
        expect(
            resolveModelVisionSupport('imported', [
                {
                    modelProperties: {
                        vision_support: 'support',
                        model_configuration: configuration
                    }
                }
            ])
        ).toBe(false)
        expect(
            resolveModelVisionSupport('imported', [
                {
                    modelProperties: {
                        model_configuration: {
                            ...configuration,
                            modelType: AiModelTypeEnum.LLM,
                            maxOutputTokens: 2048,
                            defaultMaxTokens: 2048,
                            features: [ModelFeature.VISION]
                        }
                    }
                }
            ])
        ).toBe(true)
    })
    it('uses custom model vision metadata before provider model features', () => {
        expect(
            resolveModelVisionSupport(
                'custom-model',
                [{ modelName: 'custom-model', modelProperties: { vision_support: 'support' } }],
                [
                    {
                        model: 'custom-model',
                        model_type: AiModelTypeEnum.LLM,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: { en_US: 'Custom model', zh_Hans: 'Custom model' }
                    }
                ]
            )
        ).toBe(true)
    })

    it('reads vision support from predefined provider model features', () => {
        expect(
            resolveModelVisionSupport(
                'vision-model',
                [],
                [
                    {
                        model: 'vision-model',
                        model_type: AiModelTypeEnum.LLM,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [ModelFeature.VISION],
                        label: { en_US: 'Vision model', zh_Hans: 'Vision model' }
                    }
                ]
            )
        ).toBe(true)
    })

    it('filters images for a text-only model without mutating shared messages', () => {
        const messages = [
            new HumanMessage({
                content: [
                    { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
                    { type: 'text', text: 'Describe this image' }
                ]
            })
        ]
        const textModel = setModelVisionSupport({}, false)
        const visionModel = setModelVisionSupport({}, true)

        const textOnlyMessages = prepareMessagesForModel(messages, textModel)
        const visionMessages = prepareMessagesForModel(messages, visionModel)

        expect(textOnlyMessages[0].content).toEqual([{ type: 'text', text: 'Describe this image' }])
        expect(visionMessages).toBe(messages)
        expect(messages[0].content).toHaveLength(2)
    })
})

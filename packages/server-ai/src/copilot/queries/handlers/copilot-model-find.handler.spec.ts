import { AiModelTypeEnum, FetchFrom } from '@xpert-ai/contracts'
import { FindCopilotModelsQuery } from '../copilot-model-find.query'
import { FindCopilotModelsHandler } from './copilot-model-find.handler'

describe('FindCopilotModelsHandler', () => {
    it('includes the currently selected copilot model when the provider catalog does not list it', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue([])
        }
        const service = {
            findAllAvailablesCopilots: jest.fn().mockResolvedValue([
                {
                    id: 'copilot-primary',
                    copilotModel: {
                        model: 'qwen3.6-plus',
                        modelType: AiModelTypeEnum.LLM
                    },
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'openai-compatible'
                    }
                }
            ])
        }
        const providersService = {
            getProvider: jest.fn().mockReturnValue({
                getProviderModels: jest.fn().mockReturnValue([
                    {
                        model: 'glm-5',
                        model_type: AiModelTypeEnum.LLM,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: {
                            zh_Hans: 'glm-5',
                            en_US: 'glm-5'
                        }
                    }
                ]),
                getProviderSchema: jest.fn().mockReturnValue({
                    provider: 'openai-compatible',
                    label: {
                        zh_Hans: 'OpenAI Compatible',
                        en_US: 'OpenAI Compatible'
                    },
                    supported_model_types: [AiModelTypeEnum.LLM],
                    models: []
                })
            })
        }
        const configService = {
            get: jest.fn().mockReturnValue('http://localhost:3000')
        }
        const handler = new FindCopilotModelsHandler(queryBus as never, service as never, providersService as never)
        Object.defineProperty(handler, 'configService', {
            value: configService
        })

        const result = await handler.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM))

        expect(result).toHaveLength(1)
        expect(result[0].providerWithModels.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    model: 'qwen3.6-plus',
                    model_type: AiModelTypeEnum.LLM,
                    fetch_from: FetchFrom.CUSTOMIZABLE_MODEL
                })
            ])
        )
    })
})

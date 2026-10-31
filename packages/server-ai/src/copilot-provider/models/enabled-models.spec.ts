import { AiModelTypeEnum, ICopilotProvider, ICopilotProviderModel, ProviderModel } from '@xpert-ai/contracts'
import { snapshotEnabledModels } from './enabled-models'

describe('explicit model catalog initialization', () => {
    const builtin = [{ model: 'same', model_type: AiModelTypeEnum.LLM }] as ProviderModel[]
    const custom = [{ modelName: 'same', modelType: AiModelTypeEnum.TEXT_EMBEDDING }] as ICopilotProviderModel[]
    it('preserves previously usable models with distinct types when freezing a legacy catalog', () => {
        expect(snapshotEnabledModels({} as ICopilotProvider, builtin, custom)).toEqual([
            { model: 'same', modelType: AiModelTypeEnum.LLM },
            { model: 'same', modelType: AiModelTypeEnum.TEXT_EMBEDDING }
        ])
    })
    it('does not expand an explicit empty catalog when new built-in or imported models arrive', () => {
        expect(snapshotEnabledModels({ options: { enabledModels: [] } } as ICopilotProvider, builtin, custom)).toEqual(
            []
        )
    })
    it('does not reopen unavailable or invalid entries', () => {
        expect(
            snapshotEnabledModels({} as ICopilotProvider, builtin, [
                { ...custom[0], modelType: AiModelTypeEnum.LLM, isValid: false }
            ])
        ).toEqual([])
    })
})

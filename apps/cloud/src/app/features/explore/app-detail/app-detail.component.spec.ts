import { AiModelTypeEnum } from '@xpert-ai/contracts'
import {
  pluginApplicationCopilotModel,
  pluginApplicationDefaultCopilotModel,
  pluginApplicationModelId
} from './app-detail-model.util'

describe('ApplicationDetail model selection', () => {
  it('maps a preflight model option to the shared Copilot model contract', () => {
    expect(
      pluginApplicationCopilotModel(
        {
          id: 'copilot-1/multimodal-embedding-v1',
          copilotId: 'copilot-1',
          model: 'multimodal-embedding-v1',
          label: 'Multimodal Embedding',
          modelType: AiModelTypeEnum.TEXT_EMBEDDING
        },
        AiModelTypeEnum.TEXT_EMBEDDING
      )
    ).toEqual({
      copilotId: 'copilot-1',
      model: 'multimodal-embedding-v1',
      modelType: AiModelTypeEnum.TEXT_EMBEDDING
    })
  })

  it('serializes the selected Copilot model to the server model option id', () => {
    expect(
      pluginApplicationModelId({
        copilotId: 'copilot-1',
        model: 'qwen 3.7/plus',
        modelType: AiModelTypeEnum.LLM
      })
    ).toBe('copilot-1/qwen%203.7%2Fplus')
  })

  it('selects the organization default instead of the first provider catalog model', () => {
    const options = [
      {
        id: 'copilot-1/multimodal-embedding-v1',
        copilotId: 'copilot-1',
        model: 'multimodal-embedding-v1',
        label: 'Multimodal Embedding',
        modelType: AiModelTypeEnum.TEXT_EMBEDDING
      },
      {
        id: 'copilot-1/text-embedding-v4',
        copilotId: 'copilot-1',
        model: 'text-embedding-v4',
        label: 'Text Embedding v4',
        modelType: AiModelTypeEnum.TEXT_EMBEDDING
      }
    ]

    expect(
      pluginApplicationDefaultCopilotModel(options, 'copilot-1/text-embedding-v4', AiModelTypeEnum.TEXT_EMBEDDING)
    ).toMatchObject({ copilotId: 'copilot-1', model: 'text-embedding-v4' })
  })

  it('falls back to the first authorized option when no organization default is eligible', () => {
    const options = [
      {
        id: 'copilot-1/text-embedding-v1',
        copilotId: 'copilot-1',
        model: 'text-embedding-v1',
        label: 'Text Embedding v1',
        modelType: AiModelTypeEnum.TEXT_EMBEDDING
      }
    ]

    expect(pluginApplicationDefaultCopilotModel(options, null, AiModelTypeEnum.TEXT_EMBEDDING)).toMatchObject({
      model: 'text-embedding-v1'
    })
  })

  it('does not serialize an incomplete selection', () => {
    expect(pluginApplicationModelId(null)).toBeNull()
    expect(pluginApplicationModelId({ copilotId: 'copilot-1' })).toBeNull()
  })
})

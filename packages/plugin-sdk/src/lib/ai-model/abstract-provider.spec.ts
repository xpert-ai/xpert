import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { ModelProvider } from './abstract-provider'
import type { TChatModelOptions } from './types'
import { type AsyncAIGCModelClient, VideoGenerationModel } from './types/aigc'

type VideoSubmission = { id: string }

class TestProvider extends ModelProvider {
  getAuthorization(): string {
    return 'Bearer test'
  }

  getBaseUrl(): string {
    return 'https://example.com'
  }

  async validateProviderCredentials(): Promise<void> {}
}

class TestVideoModel extends VideoGenerationModel {
  constructor(
    provider: ModelProvider,
    private readonly client: AsyncAIGCModelClient<string, VideoSubmission>
  ) {
    super(provider, AiModelTypeEnum.VIDEO)
  }

  async validateCredentials(): Promise<void> {}

  override getAIGCModel(
    _copilotModel: ICopilotModel,
    _options?: TChatModelOptions
  ): AsyncAIGCModelClient<string, VideoSubmission> {
    return this.client
  }
}

describe('ModelProvider AIGC clients', () => {
  it('creates a registered asynchronous video client', async () => {
    const client: AsyncAIGCModelClient<string, VideoSubmission> = {
      async submit(input) {
        return { providerRequestId: input, data: { id: input } }
      },
      async query(providerRequestId) {
        return {
          data: { id: providerRequestId },
          observation: { state: 'succeeded', usageAvailability: 'unknown' }
        }
      }
    }
    const provider = new TestProvider()
    new TestVideoModel(provider, client)

    await expect(provider.getModelInstance(AiModelTypeEnum.VIDEO, {})).resolves.toBe(client)
  })
})

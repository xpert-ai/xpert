import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk'
import { VLLM } from './types'

@Injectable()
@AIModelProviderStrategy(VLLM)
export class VLLMProviderStrategy extends ModelProvider {
  override logger = new Logger(VLLMProviderStrategy.name)

  override async validateProviderCredentials(credentials: Record<string, any>): Promise<void> {
    if (!credentials['apiKey']) {
      throw new Error('vLLM API key is missing')
    }
  }

  getBaseUrl(credentials: Record<string, any>): string {
    return credentials['baseUrl'] || 'https://api.openai.com/v1'
  }

  getAuthorization(credentials: Record<string, any>): string {
    return `Bearer ${credentials['apiKey']}`
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { AIModelProviderStrategy, ModelProvider } from '@xpert-ai/plugin-sdk'
import { OpenAICompatible } from './types'

@Injectable()
@AIModelProviderStrategy(OpenAICompatible)
export class OpenAICompatibleProviderStrategy extends ModelProvider {
  override logger = new Logger(OpenAICompatibleProviderStrategy.name)

  override async validateProviderCredentials(credentials: Record<string, any>): Promise<void> {
    if (!credentials['apiKey']) {
      throw new Error('OpenAI API key is missing')
    }
  }

  getBaseUrl(credentials: Record<string, any>): string {
    return credentials['baseUrl'] || 'https://api.openai.com/v1'
  }

  getAuthorization(credentials: Record<string, any>): string {
    return `Bearer ${credentials['apiKey']}`
  }
}

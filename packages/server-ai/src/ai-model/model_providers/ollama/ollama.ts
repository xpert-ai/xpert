import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { OllamaLargeLanguageModel } from './llm/llm'
import { OllamaTextEmbeddingModel } from './text-embedding/text-embedding'
import { OllamaCredentials } from './types'

@Injectable()
export class OllamaProvider extends ModelProvider {
	constructor() {
		super('ollama')
	}

	getBaseUrl(credentials: OllamaCredentials): string {
		return credentials.base_url
	}

	getAuthorization(credentials: OllamaCredentials): string {
		return null
	}

	async validateProviderCredentials(credentials: OllamaCredentials): Promise<void> {
		return
	}
}

@Module({
	providers: [
		OllamaProvider,
		{
			provide: ModelProvider,
			useExisting: OllamaProvider
		},
		OllamaLargeLanguageModel,
		OllamaTextEmbeddingModel
	],
	exports: [ModelProvider]
})
export class OllamaProviderModule {}
